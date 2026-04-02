import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readState, writeState, pruneSessionTokens, readSessionGenMap, writeSessionGenMap } from '../core/state.js';
import { readConfig, writeConfig } from '../core/config.js';
import { getPokemonDB, getPokemonName } from '../core/pokemon-data.js';
import { levelToXp, xpToLevel } from '../core/xp.js';
import { checkEvolution, applyEvolution, addFriendship, FRIENDSHIP_PER_LEVELUP, FRIENDSHIP_PER_SESSION } from '../core/evolution.js';
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import { t, initLocale } from '../i18n/index.js';
import type { HookInput, HookOutput, ExpGroup } from '../core/types.js';
import { playCry } from '../audio/play-cry.js';
import { playSfx } from '../audio/play-sfx.js';
import { syncPokedexFromUnlocked } from '../core/pokedex.js';
import { processEncounter, formatEncounterMessage } from '../core/encounter.js';
import { withLock, withLockRetry } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache, getActiveGeneration } from '../core/paths.js';
import { recordXp, recordBattle, recordCatch, recordEncounter } from '../core/stats.js';

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
    // Session exists but no gen binding — fail closed, skip mutations
    process.stderr.write(`tokenmon stop: no gen binding for session ${sessionId}, skipping XP to prevent cross-gen corruption\n`);
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
  initLocale(configCheck.language ?? 'en');

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

    // Delta tracking
    const isFirstStop = !(sessionId in state.last_session_tokens);
    const prevSessionTokens = state.last_session_tokens[sessionId] ?? 0;
    const deltaTokens = totalTokens - prevSessionTokens;

    if (isFirstStop) {
      // First stop in this session: record baseline, no XP yet
      state.last_session_tokens[sessionId] = totalTokens;
      state.last_session_tokens = pruneSessionTokens(state.last_session_tokens);
      writeState(state);
      return 'first_stop';
    }

    if (deltaTokens <= 0) {
      return 'no_delta';
    }

    // Calculate XP
    const tokensPerXp = Math.max(1, config.tokens_per_xp);
    const xpBonus = Math.max(config.xp_bonus_multiplier, state.xp_bonus_multiplier);
    const xpTotal = Math.max(0, Math.floor((deltaTokens / tokensPerXp) * xpBonus));
    // All party members receive the full XP (not divided)
    const xpPerPokemon = Math.max(1, xpTotal);

    const pokemonDB = getPokemonDB();

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
      const newXp = currentXp + xpPerPokemon;
      const newLevel = xpToLevel(newXp, expGroup);

      // Update state
      state.pokemon[pokemonName].xp = newXp;
      state.pokemon[pokemonName].level = newLevel;

      // Friendship gain per session
      addFriendship(state, pokemonName, FRIENDSHIP_PER_SESSION);

      // Level-up notification + friendship
      if (newLevel > currentLevel) {
        messages.push(t('hook.levelup', { pokemon: getPokemonName(pokemonName), from: currentLevel, to: newLevel, xp: xpPerPokemon }));
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
        const achEvents = checkAchievements(state, config);
        for (const achEvent of achEvents) {
          messages.push(formatAchievementMessage(achEvent));
        }
      }
    }

    // Record XP in stats (total XP earned across all party members)
    recordXp(state, xpPerPokemon * config.party.length);

    // Update session tokens tracking & total
    state.last_session_tokens[sessionId] = totalTokens;
    state.last_session_tokens = pruneSessionTokens(state.last_session_tokens);
    state.total_tokens_consumed += deltaTokens;

    // Check token-based achievements
    const achEvents = checkAchievements(state, config);
    for (const achEvent of achEvents) {
      messages.push(formatAchievementMessage(achEvent));
      if (achEvent.rewardPokemon) playSfx('gacha');
    }

    // Sync pokedex from unlocked pokemon
    syncPokedexFromUnlocked(state);

    // Random encounter + battle
    try {
      const battleResult = processEncounter(state, config);
      if (battleResult) {
        state.last_battle = battleResult;
        const battleMsg = formatEncounterMessage(battleResult);
        if (battleMsg) messages.push(battleMsg);

        // Record battle stats
        recordEncounter(state);
        recordBattle(state, battleResult.won);
        recordXp(state, battleResult.xpReward);
        if (battleResult.caught) recordCatch(state);

        // Auto-add caught pokemon to party if below max
        if (battleResult.caught && config.party.length < config.max_party_size) {
          if (!config.party.includes(battleResult.defender)) {
            config.party.push(battleResult.defender);
            messages.push(t('hook.party_join', { pokemon: getPokemonName(battleResult.defender) }));
          }
        }

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

    // Show tip when no battle occurred
    if (!state.last_battle && config.tips_enabled && getRandomTip) {
      const tip = getRandomTip(state, config);
      if (tip) state.last_tip = tip;
    }

    // Refresh last_seen to prevent pruning of active sessions
    const genMap = readSessionGenMap();
    if (genMap[sessionId]) {
      genMap[sessionId].last_seen = new Date().toISOString();
      writeSessionGenMap(genMap);
    }

    writeState(state);
    writeConfig(config);

    return 'done';
  });

  // Lock failed — skip gracefully (state not mutated)
  if (result === null) {
    process.stderr.write(`tokenmon stop: lock timeout after retries, session ${sessionId} XP may be lost\n`);
    playCry();
    console.log(JSON.stringify(output));
    return;
  }

  if (result === 'first_stop' || result === 'no_delta') {
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
