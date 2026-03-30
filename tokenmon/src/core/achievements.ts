import { getPokemonDB, getAchievementsDB } from './pokemon-data.js';
import type { State, Config, AchievementEvent } from './types.js';

/**
 * Check all achievements against current state.
 * Returns list of newly unlocked achievements.
 */
export function checkAchievements(state: State, config: Config): AchievementEvent[] {
  const db = getAchievementsDB();
  const pokemonDB = getPokemonDB();
  const events: AchievementEvent[] = [];

  for (const ach of db.achievements) {
    // Skip if already achieved
    if (state.achievements[ach.id]) continue;

    let triggered = false;
    switch (ach.trigger_type) {
      case 'session_count':
        triggered = state.session_count >= ach.trigger_value;
        break;
      case 'error_count':
        triggered = state.error_count >= ach.trigger_value;
        break;
      case 'evolution_count':
        triggered = state.evolution_count >= ach.trigger_value;
        break;
      case 'total_tokens':
        triggered = state.total_tokens_consumed >= ach.trigger_value;
        break;
      case 'permission_count':
        triggered = state.permission_count >= ach.trigger_value;
        break;
    }

    if (!triggered) continue;

    // Mark achieved
    state.achievements[ach.id] = true;

    const event: AchievementEvent = {
      id: ach.id,
      name: ach.name,
    };

    // Handle reward pokemon
    if (ach.reward_pokemon) {
      const rewardName = ach.reward_pokemon;
      if (!state.unlocked.includes(rewardName)) {
        state.unlocked.push(rewardName);
        const pData = pokemonDB.pokemon[rewardName];
        if (pData && !state.pokemon[rewardName]) {
          state.pokemon[rewardName] = { id: pData.id, xp: 0, level: 1 };
        }
        event.rewardPokemon = rewardName;
      }
    }

    // Handle special rewards
    if (ach.reward_message) {
      event.rewardMessage = ach.reward_message;
    }

    // Apply special effects
    applyAchievementEffects(ach.id, state, config);

    events.push(event);
  }

  return events;
}

function applyAchievementEffects(achievementId: string, state: State, config: Config): void {
  switch (achievementId) {
    case 'ten_sessions':
      state.xp_bonus_multiplier += 0.2;
      break;
    case 'permission_master':
      config.max_party_size = Math.min(7, config.max_party_size + 1);
      break;
  }
}

/**
 * Format achievement event as a notification message.
 */
export function formatAchievementMessage(event: AchievementEvent): string {
  if (event.rewardPokemon) {
    return `🏆 업적 달성: ${event.name}! ${event.rewardPokemon}을(를) 얻었습니다!`;
  }
  if (event.rewardMessage) {
    return `🏆 업적 달성: ${event.name}! ${event.rewardMessage}`;
  }
  return `🏆 업적 달성: ${event.name}!`;
}
