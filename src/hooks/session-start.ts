import { readFileSync } from 'fs';
import { readState, writeState, writeSession } from '../core/state.js';
import { readConfig, writeConfig } from '../core/config.js';
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import { refreshNotifications, getActiveNotifications, updateKnownRegions } from '../core/notifications.js';
import { updateStreak, resetWeeklyStats } from '../core/stats.js';
import { getActiveEvents } from '../core/encounter.js';
import { checkMilestoneRewards, checkTypeMasters, checkChainCompletion } from '../core/pokedex-rewards.js';
import { syncPokedexFromUnlocked } from '../core/pokedex.js';
import { getPokemonName } from '../core/pokemon-data.js';
import { playCry } from '../audio/play-cry.js';
import { initLocale, t } from '../i18n/index.js';
import { withLock } from '../core/lock.js';
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

  const messages: string[] = [];

  const result = withLock(() => {
    const state = readState();
    const config = readConfig();
    initLocale(config.language ?? 'ko');

    // Reset session.json for new session
    writeSession({
      session_id: sessionId,
      agent_assignments: [],
      evolution_events: [],
      achievement_events: [],
    });

    // Increment session_count
    state.session_count += 1;
    state.last_session_id = sessionId;

    // Update streak and reset weekly stats if needed
    updateStreak(state);
    resetWeeklyStats(state);

    // Check achievements (first_session, ten_sessions)
    const achEvents = checkAchievements(state, config);
    for (const achEvent of achEvents) {
      messages.push(formatAchievementMessage(achEvent));
    }

    // Sync pokedex and check pokedex rewards
    syncPokedexFromUnlocked(state);
    const locale = config.language ?? 'ko';

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
      writeConfig(config);
    }

    const newTypeMasters = checkTypeMasters(state);
    for (const type of newTypeMasters) {
      messages.push(t('rewards.type_master', { type }));
    }
    if (newTypeMasters.length > 0 && state.legendary_pending.length > 0) {
      messages.push(t('rewards.type_master_legendary', { count: state.type_masters.length }));
    }

    const chainCompletions = checkChainCompletion(state);
    if (chainCompletions > 0) {
      messages.push(t('rewards.chain_complete', { count: chainCompletions * 2 }));
    }

    // Refresh notifications and include active ones in output
    updateKnownRegions(state);
    refreshNotifications(state, config);
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
    ];
    for (const label of eventLabels) {
      messages.push(`🎪 ${label}`);
    }

    // GitHub star prompt (after 5+ sessions, not dismissed, no blocking network call)
    if (state.session_count >= 5 && !state.star_dismissed) {
      messages.push(t('star.prompt'));
    }

    writeState(state);
  });

  // Lock failed — skip gracefully (state not mutated)
  if (result === null) {
    // no-op: proceed without state changes
  }

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

main();
