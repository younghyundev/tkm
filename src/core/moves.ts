import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MoveData, PokemonMovePool } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let movesDB: Record<string, MoveData> | null = null;
let pokemonMovesDB: Record<string, PokemonMovePool> | null = null;

function loadMovesDB(): Record<string, MoveData> {
  if (movesDB) return movesDB;
  const dataPath = join(__dirname, '..', '..', 'data', 'moves.json');
  if (!existsSync(dataPath)) {
    movesDB = {};
    return movesDB;
  }
  movesDB = JSON.parse(readFileSync(dataPath, 'utf-8'));
  return movesDB!;
}

function loadPokemonMovesDB(): Record<string, PokemonMovePool> {
  if (pokemonMovesDB) return pokemonMovesDB;
  const dataPath = join(__dirname, '..', '..', 'data', 'pokemon-moves.json');
  if (!existsSync(dataPath)) {
    pokemonMovesDB = {};
    return pokemonMovesDB;
  }
  pokemonMovesDB = JSON.parse(readFileSync(dataPath, 'utf-8'));
  return pokemonMovesDB!;
}

/** Return full move data for a given move ID. */
export function getMoveData(moveId: number): MoveData | undefined {
  return loadMovesDB()[String(moveId)];
}

/** Return the learnable move pool for a pokemon species. */
export function getPokemonMovePool(
  pokemonId: number,
): Array<{ moveId: number; learnLevel: number }> {
  return loadPokemonMovesDB()[String(pokemonId)]?.pool ?? [];
}

/**
 * Assign default moves for a pokemon at a given level.
 * Picks up to 4 moves from its pool whose learnLevel <= level,
 * preferring higher-power moves when more than 4 are eligible.
 */
export function assignDefaultMoves(pokemonId: number, level: number): number[] {
  const pool = getPokemonMovePool(pokemonId);
  const eligible = pool.filter((m) => m.learnLevel <= level);
  if (eligible.length <= 4) return eligible.map((m) => m.moveId);

  const db = loadMovesDB();
  const sorted = [...eligible].sort(
    (a, b) => (db[String(b.moveId)]?.power ?? 0) - (db[String(a.moveId)]?.power ?? 0),
  );
  return sorted.slice(0, 4).map((m) => m.moveId);
}

/** Reset cached data (for testing). */
export function _resetMovesCache(): void {
  movesDB = null;
  pokemonMovesDB = null;
}

/** Inject mock data directly into the cache (for testing). */
export function _injectMovesData(
  moves: Record<string, MoveData>,
  pokemonMoves: Record<string, PokemonMovePool>,
): void {
  movesDB = moves;
  pokemonMovesDB = pokemonMoves;
}
