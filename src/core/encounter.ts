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
 * Get the minimum wild level for a pokemon based on its evolution stage.
 * Stage 0 → 1 (no restriction).
 * Stage N → evolves_at of the previous stage entry in the line.
 * Cross-gen evolutions (line is incomplete or loops back to self) → falls back to 1.
 */
export function getMinWildLevel(name: string): number {
  const db = getPokemonDB();
  const pData = db.pokemon[name];
  if (!pData || pData.stage === 0) return 1;

  const prevId = pData.line[pData.stage - 1];
  // Guard: cross-gen evolutions where line doesn't include pre-evos from prior gen
  if (!prevId || prevId === name) return 1;

  const prevData = db.pokemon[prevId];
  // Guard: prevData loops back to same or higher stage (malformed line)
  if (!prevData || prevData.stage >= pData.stage) return 1;

  return prevData.evolves_at ?? 1;
}

/**
 * Roll a wild level for a pokemon, respecting evolution minimum level.
 */
function rollWildLevel(name: string, regionMin: number, regionMax: number): number {
  const evoMin = getMinWildLevel(name);
  const effectiveMin = Math.max(regionMin, evoMin);
  const effectiveMax = Math.max(regionMax, effectiveMin);
  return effectiveMin + Math.floor(Math.random() * (effectiveMax - effectiveMin + 1));
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
  const [minLv, maxLv] = region.level_range;
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { name: entry.name, level: rollWildLevel(entry.name, minLv, maxLv) };
    }
  }

  // Fallback
  const fallback = weighted[0];
  return { name: fallback.name, level: rollWildLevel(fallback.name, minLv, maxLv) };
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
