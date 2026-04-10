/**
 * Shared battle setup helpers — used by both battle-turn CLI and battle-tui.
 *
 * Extracted to eliminate code duplication between:
 *   src/cli/battle-turn.ts
 *   src/battle-tui/index.ts
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createBattlePokemon } from './turn-battle.js';
import { getPokemonName, speciesIdToGeneration } from './pokemon-data.js';
import type { MoveData, BattlePokemon } from './types.js';

// ── Internal DB State ──

interface MovesDB {
  [id: string]: MoveData;
}

interface PokemonMovesDB {
  [speciesId: string]: { pool: Array<{ moveId: number; learnLevel: number }> };
}

let movesDB: MovesDB | null = null;
let pokemonMovesDB: PokemonMovesDB | null = null;

// ── Public API ──

/** Generate fallback type-matching moves when no move data is available. */
export function fallbackMoves(types: string[], level: number): MoveData[] {
  return types.map((t, i) => ({
    id: 9000 + i,
    name: `${t}-attack`,
    nameKo: `${t} 공격`,
    nameEn: `${t} Attack`,
    type: t,
    category: 'physical' as const,
    power: Math.min(40 + level, 100),
    accuracy: 100,
    pp: 20,
  }));
}

/** Load moves.json and pokemon-moves.json from the plugin data directory. */
export function loadMovesData(pluginRoot: string): void {
  const movesPath = join(pluginRoot, 'data', 'moves.json');
  const pokemonMovesPath = join(pluginRoot, 'data', 'pokemon-moves.json');

  if (existsSync(movesPath)) {
    try {
      movesDB = JSON.parse(readFileSync(movesPath, 'utf-8'));
    } catch (err) {
      console.error(`Warning: failed to parse ${movesPath}: ${err}`);
    }
  }

  if (existsSync(pokemonMovesPath)) {
    try {
      pokemonMovesDB = JSON.parse(readFileSync(pokemonMovesPath, 'utf-8'));
    } catch (err) {
      console.error(`Warning: failed to parse ${pokemonMovesPath}: ${err}`);
    }
  }
}

/** Return the raw loaded moves DB (or null if not loaded). */
export function getLoadedMovesDB(): MovesDB | null {
  return movesDB;
}

/**
 * Select up to 4 moves for a pokemon at a given level.
 * Guarantees at least 2 moves when the pool has entries (pulls from full pool if needed).
 * Falls back to type-based generated moves when no data is available.
 */
export function getMovesForPokemon(speciesId: number, level: number, types: string[]): MoveData[] {
  if (!movesDB || !pokemonMovesDB) {
    return fallbackMoves(types, level);
  }

  const pool = pokemonMovesDB[String(speciesId)];
  if (!pool || !pool.pool || pool.pool.length === 0) {
    return fallbackMoves(types, level);
  }

  // Get moves learnable at or below current level, sorted by learn level desc
  const learnable = pool.pool
    .filter((entry) => entry.learnLevel <= level)
    .sort((a, b) => b.learnLevel - a.learnLevel);

  const moves: MoveData[] = [];
  const seen = new Set<number>();

  for (const entry of learnable) {
    if (seen.has(entry.moveId)) continue;
    const moveData = movesDB[String(entry.moveId)];
    if (!moveData) continue;
    seen.add(entry.moveId);
    moves.push(moveData);
    if (moves.length >= 4) break;
  }

  // Minimum 2 moves guarantee — pull from full pool if needed
  if (moves.length < 2) {
    const allByLevel = [...pool.pool].sort((a, b) => a.learnLevel - b.learnLevel);
    for (const entry of allByLevel) {
      if (seen.has(entry.moveId)) continue;
      const moveData = movesDB[String(entry.moveId)];
      if (!moveData) continue;
      seen.add(entry.moveId);
      moves.push(moveData);
      if (moves.length >= 4) break;
    }
  }

  return moves.length > 0 ? moves : fallbackMoves(types, level);
}

/** Resolve display name for a pokemon, falling back to its native generation if needed. */
export function getDisplayName(speciesId: number, currentGen: string): string {
  let name = getPokemonName(speciesId, currentGen);
  if (name === String(speciesId)) {
    name = getPokemonName(speciesId, speciesIdToGeneration(speciesId));
  }
  return name;
}
