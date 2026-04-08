import { getPokemonDB, getPokemonName } from './pokemon-data.js';
import { isShinyKey, toBaseId } from './shiny-utils.js';
import type { Rarity, State, Config } from './types.js';

export interface BoxFilter {
  type?: string;
  rarity?: string;
  stage?: number;
  shiny?: boolean;
  keyword?: string;
}

export interface BoxListEntry {
  name: string;
  level: number;
  types: string[];
  rarity: Rarity;
  stage: number;
  evolutionReady: boolean;
  isShiny: boolean;
}

const RARITY_RANK: Record<string, number> = {
  mythical: 5,
  legendary: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

/**
 * Get box pokemon (unlocked minus party) with optional filters and sorting.
 * All filters combine with AND logic.
 */
export function getBoxList(
  state: State,
  config: Config,
  filters?: BoxFilter,
  sortBy?: string,
): BoxListEntry[] {
  const pokemonDB = getPokemonDB();

  const entries: BoxListEntry[] = [];
  for (const name of state.unlocked) {
    if (config.party.includes(name)) continue;
    if (!state.pokemon[name]) continue;

    const baseId = toBaseId(name);
    const pData = pokemonDB.pokemon[baseId];
    if (!pData) continue;

    const ps = state.pokemon[name];
    const shiny = isShinyKey(name);

    // Apply filters
    if (filters?.type && !pData.types.includes(filters.type)) continue;
    if (filters?.rarity && pData.rarity !== filters.rarity) continue;
    if (filters?.stage !== undefined && pData.stage !== filters.stage) continue;
    if (filters?.shiny && !shiny) continue;
    if (filters?.keyword) {
      const kw = filters.keyword.toLowerCase();
      const displayName = getPokemonName(name).toLowerCase();
      if (!name.includes(kw) && !displayName.includes(kw)) continue;
    }

    entries.push({
      name,
      level: ps.level ?? 1,
      types: pData.types,
      rarity: pData.rarity,
      stage: pData.stage,
      evolutionReady: ps.evolution_ready ?? false,
      isShiny: shiny,
    });
  }

  // Sort
  if (sortBy === 'level') {
    entries.sort((a, b) => b.level - a.level);
  } else if (sortBy === 'type') {
    entries.sort((a, b) => (a.types[0] ?? '').localeCompare(b.types[0] ?? ''));
  } else if (sortBy === 'name') {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'rarity') {
    entries.sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0));
  }

  return entries;
}
