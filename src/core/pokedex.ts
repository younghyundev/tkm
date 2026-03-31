import { getPokemonDB } from './pokemon-data.js';
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
 * Auto-populate pokedex from unlocked/owned pokemon.
 * Call this on state load to sync existing data.
 */
export function syncPokedexFromUnlocked(state: State): void {
  for (const name of state.unlocked) {
    markCaught(state, name);
  }
}

export interface PokedexCompletion {
  total: number;
  seen: number;
  caught: number;
  seenPct: number;
  caughtPct: number;
}

/**
 * Get pokedex completion stats.
 */
export function getCompletion(state: State): PokedexCompletion {
  const db = getPokemonDB();
  const total = Object.keys(db.pokemon).length;
  let seen = 0;
  let caught = 0;

  for (const entry of Object.values(state.pokedex ?? {})) {
    if (entry.seen) seen++;
    if (entry.caught) caught++;
  }

  return {
    total,
    seen,
    caught,
    seenPct: total > 0 ? Math.round(seen / total * 1000) / 10 : 0,
    caughtPct: total > 0 ? Math.round(caught / total * 1000) / 10 : 0,
  };
}

export interface PokedexListEntry {
  name: string;
  id: number;
  types: string[];
  rarity: string;
  region: string;
  status: 'caught' | 'seen' | 'unknown';
}

/**
 * Get all pokemon with their pokedex status.
 * Optionally filter by type, region, or rarity.
 */
export function getPokedexList(
  state: State,
  filters?: { type?: string; region?: string; rarity?: string },
): PokedexListEntry[] {
  const db = getPokemonDB();
  const entries: PokedexListEntry[] = [];

  for (const [name, pData] of Object.entries(db.pokemon)) {
    // Apply filters
    if (filters?.type && !pData.types.includes(filters.type)) continue;
    if (filters?.region && pData.region !== filters.region) continue;
    if (filters?.rarity && pData.rarity !== filters.rarity) continue;

    const pdex = state.pokedex?.[name];
    let status: 'caught' | 'seen' | 'unknown' = 'unknown';
    if (pdex?.caught) status = 'caught';
    else if (pdex?.seen) status = 'seen';

    entries.push({
      name,
      id: pData.id,
      types: pData.types,
      rarity: pData.rarity,
      region: pData.region,
      status,
    });
  }

  return entries;
}
