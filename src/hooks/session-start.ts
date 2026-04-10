import { readFileSync } from 'fs';
import { readState, writeState, writeSession, readSession, readSessionGenMap, writeSessionGenMap, pruneSessionGenMap, readCommonState, writeCommonState, commonStateExists } from '../core/state.js';
import { readConfig, writeConfig, readGlobalConfig } from '../core/config.js';
import { getActiveGeneration, setActiveGenerationCache } from '../core/paths.js';
import { checkAchievements, formatAchievementMessage, checkCommonAchievements } from '../core/achievements.js';
import { migrateToCommonState, recalculateCommonEffects } from '../core/migration.js';
import { refreshNotifications, getActiveNotifications, updateKnownRegions } from '../core/notifications.js';
import { updateStreak, resetWeeklyStats } from '../core/stats.js';
import { getActiveEvents } from '../core/encounter.js';
import { checkMilestoneRewards, checkTypeMasters, checkChainCompletion } from '../core/pokedex-rewards.js';
import { syncPokedexFromUnlocked } from '../core/pokedex.js';
import { addItem, randInt } from '../core/items.js';
import { getPokemonName, getAchievementsDB } from '../core/pokemon-data.js';
import { playCry } from '../audio/play-cry.js';
import { initLocale, t } from '../i18n/index.js';
import { withLockRetry } from '../core/lock.js';
import { loadGymData } from '../core/gym.js';
import type { HookInput, HookOutput } from '../core/types.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function main(): void {
  const input = JSON.parse(readStdin()) as HookInput;
  const sessionId = input.session_id ?? '';

  if (!sessionId) {
    // No session_id — can't register binding or track session
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Resolve generation: use existing binding on reconnect, active gen for new sessions
  const existingGenMap = readSessionGenMap();
  const existingBinding = existingGenMap[sessionId]?.generation;
  // Use a mutable variable so gen resolution inside the lock can update it for new sessions
  let gen = existingBinding ?? getActiveGeneration();
  setActiveGenerationCache(gen);

  const messages: string[] = [];

  const result = withLockRetry(() => {
    const state = readState(gen);

    // Common state migration (first time only)
    if (!commonStateExists()) {
      migrateToCommonState();
    }

    // Migrate legacy "Champion Badge" → champion_<region> for ALL gens
    // so the aggregate recomputation below sees the correct badge IDs.
    const legacyChampionMap: Record<string, string> = {
      gen1: 'champion_kanto', gen2: 'champion_johto', gen3: 'champion_hoenn',
      gen4: 'champion_sinnoh', gen5: 'champion_unova', gen6: 'champion_kalos',
      gen7: 'champion_alola', gen8: 'champion_galar', gen9: 'champion_paldea',
    };
    for (const [genKey, newBadge] of Object.entries(legacyChampionMap)) {
      const genState = genKey === gen ? state : readState(genKey);
      const badges = genState.gym_badges ?? [];
      const legacyIdx = badges.indexOf('Champion Badge');
      if (legacyIdx !== -1) {
        badges[legacyIdx] = newBadge;
        genState.gym_badges = badges;
        if (genKey === gen) {
          // Current gen state will be written at the end
        } else {
          writeState(genState, genKey);
        }
      }
    }

    // Consistency recalculation (every session start)
    const commonState = readCommonState();
    recalculateCommonEffects(commonState);

    // Recompute badge aggregates from per-gen state (idempotent, every session start)
    {
      let totalBadges = 0;
      let completedGens = 0;
      for (const genKey of ['gen1','gen2','gen3','gen4','gen5','gen6','gen7','gen8','gen9']) {
        const genState = readState(genKey);
        const genBadges = genState.gym_badges ?? [];
        totalBadges += genBadges.length;
        const gyms = loadGymData(genKey);
        if (gyms.length > 0 && gyms.every(g => genBadges.includes(g.badge))) {
          completedGens++;
        }
      }
      commonState.total_gym_badges = totalBadges;
      commonState.completed_gym_gens = completedGens;
    }

    const config = readConfig(gen);

    // Materialize common rewards into gen config/state on first session of a gen only.
    // Subsequent sessions already have these persisted. This handles new gen onboarding
    // where config/state start at defaults and need common party_slot + items applied once.
    if (!existingBinding && state.session_count === 0) {
      if (commonState.max_party_size_bonus > 0) {
        config.max_party_size = Math.min(6, config.max_party_size + commonState.max_party_size_bonus);
      }
      for (const [item, count] of Object.entries(commonState.items)) {
        if (count > 0) {
          state.items[item] = (state.items[item] ?? 0) + count;
        }
      }
    }

    // Materialize cross-gen title and rare_weight_multiplier on every session start
    // so all gens see common achievement effects
    if (commonState.titles && commonState.titles.length > 0) {
      for (const title of commonState.titles) {
        if (!state.titles.includes(title)) state.titles.push(title);
      }
    }
    // Rebuild per-gen rare_weight_multiplier from per-gen achievements to avoid
    // compounding on repeated session starts, then multiply common on top.
    {
      let perGenRareMultiplier = 1.0;
      try {
        const genAchDB = getAchievementsDB(gen);
        for (const ach of genAchDB.achievements) {
          if (!state.achievements[ach.id]) continue;
          for (const effect of (ach.reward_effects ?? []) as Array<{ type: string; value?: number }>) {
            if (effect.type === 'rare_weight_multiplier') {
              perGenRareMultiplier *= (effect.value ?? 1.0);
            }
          }
        }
      } catch { /* ignore — keep perGenRareMultiplier at 1.0 */ }
      state.rare_weight_multiplier = perGenRareMultiplier * (commonState.rare_weight_multiplier ?? 1.0);
    }
    // Rebuild per-gen encounter_rate_bonus from per-gen achievements to avoid
    // compounding on repeated session starts, then add common on top.
    {
      let perGenEncounterBonus = 0;
      try {
        const genAchDB = getAchievementsDB(gen);
        for (const ach of genAchDB.achievements) {
          if (!state.achievements[ach.id]) continue;
          for (const effect of (ach.reward_effects ?? []) as Array<{ type: string; value?: number }>) {
            if (effect.type === 'encounter_rate_bonus') {
              perGenEncounterBonus += (effect.value ?? 0);
            }
          }
        }
      } catch { /* ignore — keep perGenEncounterBonus at 0 */ }
      state.encounter_rate_bonus = perGenEncounterBonus + (commonState.encounter_rate_bonus ?? 0);
    }
    initLocale(config.language ?? 'en', readGlobalConfig().voice_tone);

    // Re-resolve gen inside lock for new sessions (avoids stale gen if gen switch happened before lock)
    if (!existingBinding) {
      gen = getActiveGeneration();
      setActiveGenerationCache(gen);
    }

    // Reset session file for new session (keyed by session_id)
    const existingSession = readSession(undefined, sessionId);
    if (existingSession.session_id === sessionId) {
      // Same session reconnecting (crash recovery) — keep existing data
      writeSession(existingSession, undefined, sessionId);
    } else {
      // New session — always start fresh
      writeSession({
        session_id: sessionId,
        agent_assignments: [],
        evolution_events: [],
        achievement_events: [],
      }, undefined, sessionId);
    }

    // Register session → generation binding (only for new sessions); refresh last_seen on reconnect
    const genMap = readSessionGenMap();
    if (!existingBinding) {
      genMap[sessionId] = { generation: gen, created: new Date().toISOString(), last_seen: new Date().toISOString() };
      const pruned = pruneSessionGenMap(genMap);
      writeSessionGenMap(pruned);
    } else {
      // Reconnect: refresh last_seen so prune doesn't evict long-running sessions
      if (genMap[sessionId]) {
        genMap[sessionId].last_seen = new Date().toISOString();
        writeSessionGenMap(genMap);
      }
    }

    // Increment session_count (only for new sessions, not reconnects)
    if (!existingBinding) {
      state.session_count += 1;
      commonState.session_count += 1;

      // New session ball bonus: random 0~10 balls
      const sessionBalls = randInt(0, 10);
      if (sessionBalls > 0) {
        addItem(state, 'pokeball', sessionBalls);
        messages.push(t('item_drop.session_end', { n: sessionBalls }));
      }
    }
    state.last_session_id = sessionId;

    // Update streak and reset weekly stats if needed
    updateStreak(state);
    resetWeeklyStats(state);

    // Check achievements (first_session, ten_sessions)
    const achEvents = checkAchievements(state, config, commonState, gen);
    for (const achEvent of achEvents) {
      messages.push(formatAchievementMessage(achEvent));
    }

    // Backfill common badge achievements for upgraded saves
    // (aggregates were recomputed above; per-gen achievements just ran)
    const backfillCommonAchEvents = checkCommonAchievements(commonState, config, state);
    for (const achEvent of backfillCommonAchEvents) {
      messages.push(formatAchievementMessage(achEvent));
    }

    // Sync pokedex and check pokedex rewards
    syncPokedexFromUnlocked(state);
    const locale = config.language ?? 'en';

    const milestones = checkMilestoneRewards(state, config);
    for (const claim of milestones) {
      const label = claim.milestone.label[locale] ?? claim.milestone.label.en;
      messages.push(t('rewards.milestone_reached', { label }));
      switch (claim.milestone.reward_type) {
        case 'pokeball':
          messages.push(t('rewards.pokeball_reward', { count: claim.milestone.reward_value }));
          break;
        case 'xp_multiplier':
          messages.push(t('rewards.xp_multiplier_reward', { value: Math.round((claim.milestone.reward_value as number) * 100) }));
          break;
        case 'legendary_unlock':
          messages.push(t('rewards.legendary_unlock'));
          break;
        case 'party_slot':
          messages.push(t('rewards.party_slot', { count: claim.milestone.reward_value }));
          break;
        case 'title':
          messages.push(t('rewards.title_earned', { title: claim.milestone.reward_value }));
          break;
      }
      if (claim.legendaryBonus) {
        messages.push(t('rewards.legendary_bonus', { pokemon: getPokemonName(claim.legendaryBonus) }));
      }
    }
    // Save config if party_slot was awarded
    if (milestones.some(c => c.milestone.reward_type === 'party_slot')) {
      writeConfig(config, gen);
    }

    const newTypeMasters = checkTypeMasters(state);
    for (const type of newTypeMasters) {
      messages.push(t('rewards.type_master', { type }));
    }
    if (newTypeMasters.length > 0 && state.legendary_pending.length > 0) {
      messages.push(t('rewards.type_master_legendary', { count: state.type_masters.length }));
    }

    const chainResult = checkChainCompletion(state);
    if (chainResult.chains > 0) {
      messages.push(t('rewards.chain_complete', { count: chainResult.ballsAwarded }));
    }

    // Refresh notifications and include active ones in output
    updateKnownRegions(state);
    refreshNotifications(state, config, commonState);
    const activeNotifs = getActiveNotifications(state);
    if (activeNotifs.length > 0) {
      const icons: Record<string, string> = {
        evolution_ready: '✨',
        region_unlocked: '🗺️',
        achievement_near: '🏆',
        legendary_unlocked: '⭐',
      };
      for (const n of activeNotifs) {
        const icon = icons[n.type] ?? '📢';
        messages.push(`${icon} ${n.message}`);
      }
    }

    // Show active events
    const activeEvts = getActiveEvents(state);
    const eventLabels = [
      ...activeEvts.timeEvents.map(e => e.label[locale] ?? e.label.en),
      ...activeEvts.dayEvents.map(e => e.label[locale] ?? e.label.en),
      ...activeEvts.streakEvents.map(e => e.label[locale] ?? e.label.en),
      ...activeEvts.weatherEvents.map(e => `${e.emoji} ${e.label[locale] ?? e.label.en}`),
    ];
    for (const label of eventLabels) {
      messages.push(`🎪 ${label}`);
    }

    // GitHub star prompt (after 5+ sessions, not dismissed, no blocking network call)
    if (state.session_count >= 5 && !state.star_dismissed) {
      messages.push(t('star.prompt'));
    }

    // Check common achievements
    const commonAchEvents = checkCommonAchievements(commonState, config, state);
    for (const achEvent of commonAchEvents) {
      messages.push(formatAchievementMessage(achEvent));
    }
    writeCommonState(commonState);

    writeState(state, gen);
  });

  // Lock failed — skip gracefully (state not mutated)
  if (!result.acquired) {
    process.stderr.write(`tokenmon session-start: lock timeout, session ${sessionId} not registered. XP may not be tracked.\n`);
  }

  // Refresh weather cache (async, fire-and-forget)
  try {
    const gc = readGlobalConfig();
    if (gc.weather_enabled && gc.weather_location) {
      import('../core/weather.js').then(({ refreshWeatherIfStale }) => {
        refreshWeatherIfStale(gc.weather_location).catch(() => {});
      }).catch(() => {});
    }
  } catch { /* ignore weather errors */ }

  // Play cry async (fire and forget)
  try {
    playCry();
  } catch {
    // Ignore audio errors
  }

  const output: HookOutput = { continue: true };
  if (messages.length > 0) {
    output.system_message = messages.join('\n');
  }
  console.log(JSON.stringify(output));
}

try {
  main();
} catch (err: any) {
  process.stderr.write(`tokenmon session-start: ${err}\n`);
  // Surface data loading errors to user
  const output: any = { continue: true };
  if (err.message) {
    output.system_message = `⚠ tokenmon: ${err.message}`;
  }
  console.log(JSON.stringify(output));
}
