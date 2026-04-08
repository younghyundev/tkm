import { getPokemonDB, getPokemonName } from './pokemon-data.js';
import { isShinyKey, toBaseId } from './shiny-utils.js';
import type { State, PokedexEntry } from './types.js';

/**
 * Mark a pokemon as seen in the pokedex.
 * Sets seen=true, preserves caught status.
 * first_seen is set only on first sight.
 */
export function markSeen(state: State, name: string): void {
  if (!state.pokedex) state.pokedex = {};
  const existing = state.pokedex[name];
  if (existing) {
    existing.seen = true;
    return;
  }
  state.pokedex[name] = {
    seen: true,
    caught: false,
    first_seen: new Date().toISOString().split('T')[0],
  };
}

/**
 * Mark a pokemon as caught in the pokedex.
 * Sets both seen=true and caught=true.
 * first_seen is set only on first sight.
 */
export function markCaught(state: State, name: string): void {
  if (!state.pokedex) state.pokedex = {};
  const existing = state.pokedex[name];
  if (existing) {
    existing.seen = true;
    existing.caught = true;
    return;
  }
  state.pokedex[name] = {
    seen: true,
    caught: true,
    first_seen: new Date().toISOString().split('T')[0],
  };
}

/**
 * Mark a pokemon species as shiny-caught in the pokedex.
 */
export function markShinyCaught(state: State, name: string): void {
  if (!state.pokedex) state.pokedex = {};
  const existing = state.pokedex[name];
  if (existing) {
    existing.shiny_caught = true;
    return;
  }
  markCaught(state, name);
  state.pokedex[name].shiny_caught = true;
}

/**
 * Auto-populate pokedex from unlocked/owned pokemon.
 * Call this on state load to sync existing data.
 */
export function syncPokedexFromUnlocked(state: State): void {
  for (const name of state.unlocked) {
    // Pokedex tracks by base species ID, not shiny key
    const baseId = toBaseId(name);
    markCaught(state, baseId);
    if (isShinyKey(name)) {
      markShinyCaught(state, baseId);
    }
  }
}

export interface PokedexCompletion {
  total: number;
  seen: number;
  caught: number;
  seenPct: number;
  caughtPct: number;
  shinyCaught: number;
}

/**
 * Get pokedex completion stats.
 */
export function getCompletion(state: State): PokedexCompletion {
  const db = getPokemonDB();
  const total = Object.keys(db.pokemon).length;
  let seen = 0;
  let caught = 0;
  let shinyCaught = 0;

  for (const entry of Object.values(state.pokedex ?? {})) {
    if (entry.seen) seen++;
    if (entry.caught) caught++;
    if (entry.shiny_caught) shinyCaught++;
  }

  return {
    total,
    seen,
    caught,
    seenPct: total > 0 ? Math.round(seen / total * 1000) / 10 : 0,
    caughtPct: total > 0 ? Math.round(caught / total * 1000) / 10 : 0,
    shinyCaught,
  };
}

export interface PokedexFilter {
  type?: string;
  region?: string;
  rarity?: string;
  stage?: number;
  status?: 'caught' | 'uncaught';
  shiny?: boolean;
  keyword?: string;
}

export interface PokedexListEntry {
  name: string;
  id: number;
  types: string[];
  rarity: string;
  region: string;
  stage: number;
  shinyCaught: boolean;
  status: 'caught' | 'seen' | 'unknown';
}

/**
 * Get all pokemon with their pokedex status.
 * Optionally filter by type, region, rarity, stage, status, shiny, keyword.
 * All filters combine with AND logic.
 */
export function getPokedexList(
  state: State,
  filters?: PokedexFilter,
): PokedexListEntry[] {
  const db = getPokemonDB();
  const entries: PokedexListEntry[] = [];

  for (const [name, pData] of Object.entries(db.pokemon)) {
    // Apply filters
    if (filters?.type && !pData.types.includes(filters.type)) continue;
    if (filters?.region && pData.region !== filters.region) continue;
    if (filters?.rarity && pData.rarity !== filters.rarity) continue;
    if (filters?.stage !== undefined && pData.stage !== filters.stage) continue;
    if (filters?.keyword) {
      const kw = filters.keyword.toLowerCase();
      const displayName = getPokemonName(name).toLowerCase();
      if (!name.includes(kw) && !displayName.includes(kw)) continue;
    }

    const pdex = state.pokedex?.[name];
    let status: 'caught' | 'seen' | 'unknown' = 'unknown';
    if (pdex?.caught) status = 'caught';
    else if (pdex?.seen) status = 'seen';

    if (filters?.status === 'caught' && status !== 'caught') continue;
    if (filters?.status === 'uncaught' && status === 'caught') continue;
    if (filters?.shiny && !pdex?.shiny_caught) continue;

    entries.push({
      name,
      id: pData.id,
      types: pData.types,
      rarity: pData.rarity,
      region: pData.region,
      stage: pData.stage,
      shinyCaught: pdex?.shiny_caught ?? false,
      status,
    });
  }

  return entries;
}

export interface RegionSummaryEntry {
  regionId: string;
  total: number;
  seen: number;
  caught: number;
}

/**
 * Get per-region pokedex completion summary.
 */
export function getRegionSummary(state: State): RegionSummaryEntry[] {
  const db = getPokemonDB();
  const regionMap = new Map<string, { total: number; seen: number; caught: number }>();

  for (const [name, pData] of Object.entries(db.pokemon)) {
    const r = pData.region;
    if (!regionMap.has(r)) regionMap.set(r, { total: 0, seen: 0, caught: 0 });
    const entry = regionMap.get(r)!;
    entry.total++;
    const pdex = state.pokedex?.[name];
    if (pdex?.seen) entry.seen++;
    if (pdex?.caught) entry.caught++;
  }

  return Array.from(regionMap.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([regionId, counts]) => ({ regionId, ...counts }));
}
