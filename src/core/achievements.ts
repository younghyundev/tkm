import { getPokemonDB, getAchievementsDB, getAchievementName, getPokemonName } from './pokemon-data.js';
import { markCaught } from './pokedex.js';
import { t } from '../i18n/index.js';
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
      case 'battle_wins':
        triggered = (state.battle_wins ?? 0) >= ach.trigger_value;
        break;
      case 'battle_count':
        triggered = (state.battle_count ?? 0) >= ach.trigger_value;
        break;
      case 'catch_count':
        triggered = (state.catch_count ?? 0) >= ach.trigger_value;
        break;
    }

    if (!triggered) continue;

    state.achievements[ach.id] = true;

    const event: AchievementEvent = {
      id: ach.id,
      name: getAchievementName(ach.id),
    };

    // Handle reward pokemon
    if (ach.reward_pokemon) {
      const rewardName = ach.reward_pokemon;
      if (!state.unlocked.includes(rewardName)) {
        state.unlocked.push(rewardName);
        const pData = pokemonDB.pokemon[rewardName];
        if (pData && !state.pokemon[rewardName]) {
          state.pokemon[rewardName] = { id: pData.id, xp: 0, level: 1, friendship: 0, ev: 0 };
        }
        markCaught(state, rewardName);
        event.rewardPokemon = rewardName;
      }
    }

    applyAchievementEffects(ach.id, state, config);

    events.push(event);
  }

  return events;
}

function applyAchievementEffects(achievementId: string, state: State, config: Config): void {
  const db = getAchievementsDB();
  const ach = db.achievements.find(a => a.id === achievementId);

  // Process structured reward_effects from achievements.json
  if (ach?.reward_effects) {
    for (const effect of ach.reward_effects as Array<{ type: string; item?: string; count?: number; value?: number }>) {
      switch (effect.type) {
        case 'add_item':
          state.items[effect.item as string] = (state.items[effect.item as string] ?? 0) + (effect.count ?? 1);
          break;
        case 'xp_bonus':
          state.xp_bonus_multiplier += (effect.value ?? 0);
          break;
        case 'party_slot':
          config.max_party_size = Math.min(8, config.max_party_size + (effect.count ?? 1));
          break;
        case 'unlock_legendary':
          // Flag-only effect — no direct state change needed
          break;
      }
    }
  }
}

/**
 * Format achievement event as a notification message.
 */
export function formatAchievementMessage(event: AchievementEvent): string {
  if (event.rewardPokemon) {
    return t('achievement.unlocked_pokemon', { name: event.name, pokemon: getPokemonName(event.rewardPokemon) });
  }
  return t('achievement.unlocked', { name: event.name }) + '!';
}
