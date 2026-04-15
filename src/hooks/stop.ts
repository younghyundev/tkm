import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readState, writeState, pruneSessionTokens, readSessionGenMap, writeSessionGenMap, readCommonState, writeCommonState } from '../core/state.js';
import { readConfig, writeConfig, readGlobalConfig, writeGlobalConfig } from '../core/config.js';
import { getPokemonDB, getPokemonName, ensurePokemonInDB } from '../core/pokemon-data.js';
import { levelToXp, xpToLevel } from '../core/xp.js';
import { checkEvolution, applyEvolution, addFriendship, FRIENDSHIP_PER_LEVELUP, FRIENDSHIP_PER_SESSION } from '../core/evolution.js';
import { checkAchievements, checkCommonAchievements, formatAchievementMessage } from '../core/achievements.js';
import { t, initLocale } from '../i18n/index.js';
import type { HookInput, HookOutput, ExpGroup } from '../core/types.js';
import { playCry } from '../audio/play-cry.js';
import { playSfx } from '../audio/play-sfx.js';
import { syncPokedexFromUnlocked, markShinyCaught } from '../core/pokedex.js';
import { processEncounter, formatEncounterMessage } from '../core/encounter.js';
import { getVolumeTier } from '../core/volume-tier.js';
import { withLock, withLockRetry } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache, getActiveGeneration } from '../core/paths.js';
import { recordXp, recordBattle, recordCatch, recordEncounter, recordShinyEncounter, recordShinyCatch, recordShinyEscaped } from '../core/stats.js';

function getTurnFloor(level: number): number {
  if (level <= 10) return 3;
  if (level <= 20) return 2;
  return 0;
}

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function parseJsonl(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  let total = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const msg = obj.message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, unknown> | undefined;
      if (usage) {
        total += (usage.input_tokens as number) || 0;
        total += (usage.output_tokens as number) || 0;
        // Explicitly NOT counting cache_creation_input_tokens or cache_read_input_tokens
      }
    } catch {
      // Skip malformed lines
    }
  }
  return total;
}

function findJsonlFile(sessionId: string): string | null {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const projectsDir = join(claudeDir, 'projects');
  if (!existsSync(projectsDir)) return null;

  // Search project subdirs for session JSONL
  try {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const subDir = join(projectsDir, entry.name);
      const candidate = join(subDir, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function main(): Promise<void> {
  const input = JSON.parse(readStdin()) as HookInput;
  const sessionId = input.session_id ?? '';

  // Resolve and lock this hook to the session's bound generation
  const resolvedGen = getSessionGeneration(sessionId);
  if (resolvedGen !== null) {
    setActiveGenerationCache(resolvedGen);
  } else if (sessionId) {
    // No gen binding — could be a race with session-start or a genuine issue
    // Fail closed: skip mutations to prevent cross-gen corruption
    // Only warn if this looks like a real miss (not a brand-new session)
    process.stderr.write(`tokenmon stop: no gen binding for session ${sessionId}, skipping XP\n`);
    playCry();
    console.log(JSON.stringify({ continue: true }));
    return;
  } else {
    // No session ID at all — legacy fallback
    setActiveGenerationCache(getActiveGeneration());
  }

  const output: HookOutput = { continue: true };

  // Pre-lock: read config for early exit check (benign TOCTOU — worst case: enter lock unnecessarily)
  const configCheck = readConfig();
  const globalConfig = readGlobalConfig();
  const needsVoiceToneMigration = (globalConfig.voice_tone as string) === 'classic';
  if (needsVoiceToneMigration) globalConfig.voice_tone = 'claude';
  initLocale(configCheck.language ?? 'en', globalConfig.voice_tone);

  if (configCheck.party.length === 0 || !sessionId) {
    playCry();
    console.log(JSON.stringify(output));
    return;
  }

  // Pre-lock: parse JSONL (read-only, no race condition)
  const jsonlFile = findJsonlFile(sessionId);
  let totalTokens = 0;
  if (jsonlFile) {
    totalTokens = parseJsonl(jsonlFile);
  }

  // Pre-lock: load guide module (read-only module load)
  let getRandomTip: ((state: any, config: any) => { id: string; text: string } | null) | null = null;
  try {
    const guideModule = await import('../core/guide.js');
    getRandomTip = guideModule.getRandomTip;
  } catch {
    // Ignore guide errors
  }

  // All state mutations under global lock
  const messages: string[] = [];

  const result = withLockRetry(() => {
    const config = readConfig();
    const state = readState();

    // Clear previous battle/tip result (only show for one turn)
    state.last_battle = null;
    state.last_tip = null;

    // Read common state early (needed for last_turn_ts on all paths)
    const commonState = readCommonState();

    // Delta tracking
    const isFirstStop = !(sessionId in state.last_session_tokens);
    const prevSessionTokens = state.last_session_tokens[sessionId] ?? 0;
    const deltaTokens = totalTokens - prevSessionTokens;

    if (isFirstStop) {
      // First stop in this session: record baseline, no XP yet
      state.last_session_tokens[sessionId] = totalTokens;
      const activeIds = new Set(Object.keys(readSessionGenMap()));
      state.last_session_tokens = pruneSessionTokens(state.last_session_tokens, activeIds);
      commonState.last_turn_ts = Date.now();
      writeCommonState(commonState);
      writeState(state);
      return 'first_stop';
    }

    if (deltaTokens <= 0) {
      commonState.last_turn_ts = Date.now();
      writeCommonState(commonState);
      return 'no_delta';
    }

    // Rest bonus activation (before XP calc)
    const now = Date.now();
    const lastTurnTs = commonState.last_turn_ts ?? now;
    const elapsed = now - lastTurnTs;
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let restBonusJustActivated = false;

    if (!state.rest_bonus && elapsed >= TWO_HOURS) {
      if (elapsed >= ONE_DAY) {
        state.rest_bonus = { multiplier: 3.0, turns_remaining: 10 };
      } else if (elapsed >= SIX_HOURS) {
        state.rest_bonus = { multiplier: 2.0, turns_remaining: 5 };
      } else {
        state.rest_bonus = { multiplier: 1.5, turns_remaining: 3 };
      }
      restBonusJustActivated = true;
    }

    const restMult = state.rest_bonus?.multiplier ?? 1.0;

    // Volume tier based on tokens consumed this turn
    const tier = getVolumeTier(deltaTokens);

    // Calculate XP — common + gen xp_bonus, then tier multiplier
    const tokensPerXp = Math.max(1, config.tokens_per_xp);
    const xpBonus = Math.max(config.xp_bonus_multiplier, commonState.xp_bonus_multiplier + state.xp_bonus_multiplier);
    const xpTotal = Math.max(0, Math.floor((deltaTokens / tokensPerXp) * xpBonus * tier.xpMultiplier));
    // All party members receive the full XP (not divided)
    const xpPerPokemon = Math.max(1, xpTotal);

    const pokemonDB = getPokemonDB();
    let totalXpGranted = 0;

    // Ensure cross-gen evolved Pokemon are in the DB (e.g., Pikachu in gen2)
    for (const name of config.party) {
      if (name && !pokemonDB.pokemon[name]) ensurePokemonInDB(name);
    }

    for (const pokemonName of config.party) {
      if (!pokemonName) continue;

      // Ensure pokemon entry exists
      const pData = pokemonDB.pokemon[pokemonName];
      if (!state.pokemon[pokemonName]) {
        state.pokemon[pokemonName] = {
          id: pData?.id ?? 0,
          xp: 0,
          level: 1,
          friendship: 0,
          ev: 0,
        };
      }

      const expGroup: ExpGroup = pData?.exp_group ?? 'medium_fast';
      const currentXp = state.pokemon[pokemonName].xp;
      const currentLevel = state.pokemon[pokemonName].level;
      const floor = getTurnFloor(currentLevel);
      const finalXp = Math.floor(Math.max(floor, xpPerPokemon) * restMult);
      totalXpGranted += finalXp;
      const newXp = currentXp + finalXp;
      const newLevel = xpToLevel(newXp, expGroup);

      // Update state
      state.pokemon[pokemonName].xp = newXp;
      state.pokemon[pokemonName].level = newLevel;

      // Friendship gain per session
      addFriendship(state, pokemonName, FRIENDSHIP_PER_SESSION);

      // Level-up notification + friendship
      if (newLevel > currentLevel) {
        messages.push(t('hook.levelup', { pokemon: getPokemonName(pokemonName), from: currentLevel, to: newLevel, xp: finalXp }));
        addFriendship(state, pokemonName, FRIENDSHIP_PER_LEVELUP);
        playSfx('levelup');
      }

      // Check evolution with context
      const evoContext = {
        oldLevel: currentLevel,
        newLevel,
        friendship: state.pokemon[pokemonName]?.friendship ?? 0,
        currentRegion: config.current_region,
        unlockedAchievements: Object.keys(state.achievements).filter(k => state.achievements[k]),
        items: state.items ?? {},
      };
      const evolution = checkEvolution(pokemonName, evoContext, state);
      if (evolution) {
        applyEvolution(state, config, evolution, newXp);
        messages.push(t('hook.evolution', { pokemon: getPokemonName(pokemonName), newPokemon: getPokemonName(evolution.newPokemon) }));
        playSfx('gacha');

        // Check first_evolution achievement immediately
        const achEvents = checkAchievements(state, config, commonState);
        for (const achEvent of achEvents) {
          messages.push(formatAchievementMessage(achEvent));
        }
      }
    }

    // Record XP in stats (total XP earned across all party members)
    recordXp(state, totalXpGranted);

    // Update session tokens tracking & total
    state.last_session_tokens[sessionId] = totalTokens;
    const activeIds = new Set(Object.keys(readSessionGenMap()));
    state.last_session_tokens = pruneSessionTokens(state.last_session_tokens, activeIds);
    state.total_tokens_consumed += deltaTokens;

    // Sync common trigger counters
    commonState.total_tokens_consumed += deltaTokens;

    // Tier notification message (flavor text only, no numbers)
    if (tier.name !== 'normal') {
      messages.push(t(`tier.${tier.name}`));
    }

    // Check gen-specific achievements (pass commonState for cross-state encounter_rate_bonus writes)
    const achEvents = checkAchievements(state, config, commonState);
    for (const achEvent of achEvents) {
      messages.push(formatAchievementMessage(achEvent));
      if (achEvent.rewardPokemon) playSfx('gacha');
    }

    // Sync pokedex from unlocked pokemon
    syncPokedexFromUnlocked(state);

    // Snapshot counters before encounter for delta-based common sync
    const preBattleCount = state.battle_count ?? 0;
    const preBattleWins = state.battle_wins ?? 0;
    const preCatchCount = state.catch_count ?? 0;
    const preEvolutionCount = state.evolution_count ?? 0;

    // Random encounter + battle (with volume tier and commonState)
    try {
      const battleResult = processEncounter(state, config, tier, commonState, restMult);
      if (battleResult) {
        state.last_battle = battleResult;
        const battleMsg = formatEncounterMessage(battleResult);
        if (battleMsg) messages.push(battleMsg);

        // Record battle stats
        recordEncounter(state);
        recordBattle(state, battleResult.won);
        recordXp(state, battleResult.xpReward);
        if (battleResult.caught) recordCatch(state);

        // Record shiny stats
        if (battleResult.shiny) {
          recordShinyEncounter(state);
          if (battleResult.caught) {
            recordShinyCatch(state);
            markShinyCaught(state, battleResult.defender);
          } else {
            recordShinyEscaped(state);
          }
        }

        // Auto-add caught pokemon to party if below max
        if (battleResult.caught && config.party.length < config.max_party_size) {
          if (!config.party.includes(battleResult.defender)) {
            config.party.push(battleResult.defender);
            messages.push(t('hook.party_join', { pokemon: getPokemonName(battleResult.defender) }));
          }
        }
        battleResult.partyFull = config.party.length >= config.max_party_size;

        if (battleResult.won) {
          playSfx('victory');
          if (battleResult.caught) playSfx('gacha');
        } else {
          playSfx('defeat');
        }
      }
    } catch (err) {
      process.stderr.write(`tokenmon encounter error: ${err}\n`);
    }

    // Post-encounter counter sync to commonState (delta-based, not Math.max)
    commonState.battle_count += (state.battle_count ?? 0) - preBattleCount;
    commonState.battle_wins += (state.battle_wins ?? 0) - preBattleWins;
    commonState.catch_count += (state.catch_count ?? 0) - preCatchCount;
    commonState.evolution_count += (state.evolution_count ?? 0) - preEvolutionCount;

    // Check common achievements AFTER counter sync so battle/catch-based achievements
    // (battle_50, battle_wins_25, ten_catches etc.) unlock on the triggering turn
    const commonAchEvents = checkCommonAchievements(commonState, config, state);
    for (const achEvent of commonAchEvents) {
      messages.push(formatAchievementMessage(achEvent));
      if (achEvent.rewardPokemon) playSfx('gacha');
    }

    // Rest bonus activation tip (overrides random tip for this turn)
    if (restBonusJustActivated && state.rest_bonus) {
      const hours = Math.max(1, Math.floor(elapsed / (60 * 60 * 1000)));
      state.last_tip = {
        id: 'rest_activate',
        text: t('rest.activate', { hours, turns: state.rest_bonus.turns_remaining, mult: state.rest_bonus.multiplier }),
      };
    } else if (!state.last_battle && config.tips_enabled && getRandomTip) {
      // Show tip when no battle occurred
      const tip = getRandomTip(state, config);
      if (tip) state.last_tip = tip;
    }

    // Rest bonus countdown (XP-granting turns only)
    if (state.rest_bonus) {
      state.rest_bonus.turns_remaining--;
      if (state.rest_bonus.turns_remaining <= 0) {
        delete state.rest_bonus;
      }
    }

    // Update last_turn_ts on main XP path
    commonState.last_turn_ts = Date.now();

    // Refresh last_seen to prevent pruning of active sessions
    const genMap = readSessionGenMap();
    if (genMap[sessionId]) {
      genMap[sessionId].last_seen = new Date().toISOString();
      writeSessionGenMap(genMap);
    }

    // Migrate classic → claude voice_tone under lock (one-time, deferred from pre-lock read)
    if (needsVoiceToneMigration) {
      const gc = readGlobalConfig();
      gc.voice_tone = 'claude';
      writeGlobalConfig(gc);
    }

    writeState(state);
    writeConfig(config);
    writeCommonState(commonState);

    return 'done';
  }, 2, 3000);

  // Lock failed — skip gracefully (state not mutated)
  if (!result.acquired) {
    process.stderr.write(`tokenmon stop: lock timeout after retries, session ${sessionId} XP may be lost\n`);
    playCry();
    console.log(JSON.stringify(output));
    return;
  }

  if (result.value === 'first_stop' || result.value === 'no_delta') {
    playCry();
    console.log(JSON.stringify(output));
    return;
  }

  if (messages.length > 0) {
    output.system_message = messages.join('\n');
  }

  playCry();
  console.log(JSON.stringify(output));
}

main().catch((err) => {
  process.stderr.write(`tokenmon stop: ${err}\n`);
  console.log('{"continue": true}');
});
