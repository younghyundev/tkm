import { getPokemonDB, getRegionsDB } from './pokemon-data.js';
import { resolveBattle, formatBattleMessage } from './battle.js';
import type { State, Config, EncounterResult, BattleResult } from './types.js';

const BASE_ENCOUNTER_RATE = 0.15;

/**
 * Roll whether an encounter happens.
 * Returns true if an encounter should occur.
 */
export function rollEncounter(state: State, config: Config): boolean {
  const regionsDB = getRegionsDB();
  const region = regionsDB.regions[config.current_region];
  if (!region) return false;

  // Calculate average party level
  const partyLevels = config.party
    .map(name => state.pokemon[name]?.level ?? 1)
    .filter(l => l > 0);
  const avgLevel = partyLevels.length > 0
    ? partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length
    : 1;

  // Region level penalty
  const penalty = avgLevel < region.level_range[0] ? -0.05 : 0;
  const rate = Math.max(0.05, Math.min(0.25, BASE_ENCOUNTER_RATE + penalty));

  return Math.random() < rate;
}

/**
 * Select a wild pokemon from the current region's pool, weighted by rarity.
 */
export function selectWildPokemon(config: Config): { name: string; level: number } | null {
  const pokemonDB = getPokemonDB();
  const regionsDB = getRegionsDB();
  const region = regionsDB.regions[config.current_region];
  if (!region) return null;

  const weights = pokemonDB.rarity_weights;
  const pool = region.pokemon_pool
    .map(name => pokemonDB.pokemon[name])
    .filter(Boolean);

  if (pool.length === 0) return null;

  // Build weighted selection by rarity
  const weighted: Array<{ name: string; weight: number }> = [];
  for (const p of pool) {
    const w = weights[p.rarity as keyof typeof weights] ?? 0.1;
    weighted.push({ name: p.name, weight: w });
  }

  // Normalize and select
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      // Random level within region range
      const [minLv, maxLv] = region.level_range;
      const level = minLv + Math.floor(Math.random() * (maxLv - minLv + 1));
      return { name: entry.name, level };
    }
  }

  // Fallback
  const fallback = weighted[0];
  const [minLv, maxLv] = region.level_range;
  return { name: fallback.name, level: minLv + Math.floor(Math.random() * (maxLv - minLv + 1)) };
}

/**
 * Process an encounter: roll, select wild pokemon, trigger battle.
 * Returns battle result for system_message.
 */
export function processEncounter(
  state: State,
  config: Config,
): BattleResult | null {
  if (!rollEncounter(state, config)) return null;

  const wild = selectWildPokemon(config);
  if (!wild) return null;

  state.encounter_count++;

  // Resolve battle (handles seen/caught/XP internally)
  return resolveBattle(state, config, wild.name, wild.level);
}

// Re-export for stop hook
export { formatBattleMessage as formatEncounterMessage } from './battle.js';
