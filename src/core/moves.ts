import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MoveData, PokemonMovePool } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let globalMovesDB: Record<string, MoveData> | null = null;
let globalPokemonMovesDB: Record<string, PokemonMovePool> | null = null;
const movesDBCache = new Map<string, Record<string, MoveData>>();
const pokemonMovesDBCache = new Map<string, Record<string, PokemonMovePool>>();

function loadMovesDB(generation?: string): Record<string, MoveData> {
  // Try gen-specific first: data/<generation>/moves.json
  if (generation) {
    const cached = movesDBCache.get(generation);
    if (cached) return cached;
    const genPath = join(__dirname, '..', '..', 'data', generation, 'moves.json');
    if (existsSync(genPath)) {
      const data = JSON.parse(readFileSync(genPath, 'utf-8'));
      movesDBCache.set(generation, data);
      return data;
    }
  }
  // Fall back to global
  if (globalMovesDB) return globalMovesDB;
  const dataPath = join(__dirname, '..', '..', 'data', 'moves.json');
  if (!existsSync(dataPath)) {
    globalMovesDB = {};
    return globalMovesDB;
  }
  globalMovesDB = JSON.parse(readFileSync(dataPath, 'utf-8'));
  return globalMovesDB!;
}

function loadPokemonMovesDB(generation?: string): Record<string, PokemonMovePool> {
  // Try gen-specific first: data/<generation>/pokemon-moves.json
  if (generation) {
    const cached = pokemonMovesDBCache.get(generation);
    if (cached) return cached;
    const genPath = join(__dirname, '..', '..', 'data', generation, 'pokemon-moves.json');
    if (existsSync(genPath)) {
      const data = JSON.parse(readFileSync(genPath, 'utf-8'));
      pokemonMovesDBCache.set(generation, data);
      return data;
    }
  }
  // Fall back to global
  if (globalPokemonMovesDB) return globalPokemonMovesDB;
  const dataPath = join(__dirname, '..', '..', 'data', 'pokemon-moves.json');
  if (!existsSync(dataPath)) {
    globalPokemonMovesDB = {};
    return globalPokemonMovesDB;
  }
  globalPokemonMovesDB = JSON.parse(readFileSync(dataPath, 'utf-8'));
  return globalPokemonMovesDB!;
}

/** Return full move data for a given move ID. */
export function getMoveData(moveId: number, generation?: string): MoveData | undefined {
  return loadMovesDB(generation)[String(moveId)];
}

/** Return the learnable move pool for a pokemon species. */
export function getPokemonMovePool(
  pokemonId: number,
  generation?: string,
): Array<{ moveId: number; learnLevel: number }> {
  return loadPokemonMovesDB(generation)[String(pokemonId)]?.pool ?? [];
}

/**
 * Assign default moves for a pokemon at a given level.
 * Picks up to 4 moves from its pool whose learnLevel <= level,
 * preferring higher-power moves when more than 4 are eligible.
 */
export function assignDefaultMoves(pokemonId: number, level: number, generation?: string): number[] {
  const pool = getPokemonMovePool(pokemonId, generation);
  const eligible = pool.filter((m) => m.learnLevel <= level);
  if (eligible.length <= 4) return eligible.map((m) => m.moveId);

  const db = loadMovesDB(generation);
  const sorted = [...eligible].sort(
    (a, b) => (db[String(b.moveId)]?.power ?? 0) - (db[String(a.moveId)]?.power ?? 0),
  );
  return sorted.slice(0, 4).map((m) => m.moveId);
}

/** Reset cached data (for testing). */
export function _resetMovesCache(): void {
  globalMovesDB = null;
  globalPokemonMovesDB = null;
  movesDBCache.clear();
  pokemonMovesDBCache.clear();
}

/** Inject mock data directly into the cache (for testing). */
export function _injectMovesData(
  moves: Record<string, MoveData>,
  pokemonMoves: Record<string, PokemonMovePool>,
): void {
  globalMovesDB = moves;
  globalPokemonMovesDB = pokemonMoves;
}
