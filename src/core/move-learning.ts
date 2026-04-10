import { getPokemonMovePool, getMoveData, assignDefaultMoves } from './moves.js';

export interface MoveLearnResult {
  moves: number[];
  learned: number | null;
  replaced: number | null;
}

/**
 * Check whether a pokemon should learn new moves after levelling up.
 *
 * 1. Find moves in the pokemon's pool with learnLevel in (oldLevel, newLevel].
 * 2. Skip moves already known.
 * 3. If the pokemon knows fewer than 4 moves, add the new move.
 * 4. If the pokemon already knows 4 moves, replace the weakest (lowest power)
 *    only when the new move has strictly higher power.
 *
 * Returns the updated move list together with what was learned/replaced.
 * Only the *last* successfully learned move is recorded in learned/replaced
 * (multiple level-ups in one go are possible).
 */
export function checkMoveLearn(
  pokemonId: number,
  oldLevel: number,
  newLevel: number,
  currentMoves: number[],
  generation?: string,
): MoveLearnResult {
  const pool = getPokemonMovePool(pokemonId, generation);
  const moves = [...currentMoves];
  let learned: number | null = null;
  let replaced: number | null = null;

  // Moves eligible in the levelled range, ordered by learnLevel ascending
  const newMoves = pool
    .filter((m) => m.learnLevel > oldLevel && m.learnLevel <= newLevel)
    .sort((a, b) => a.learnLevel - b.learnLevel);

  for (const entry of newMoves) {
    if (moves.includes(entry.moveId)) continue;

    if (moves.length < 4) {
      moves.push(entry.moveId);
      learned = entry.moveId;
    } else {
      // Find the weakest move currently known
      const movesWithPower = moves.map((id) => ({
        id,
        power: getMoveData(id, generation)?.power ?? 0,
      }));
      const newPower = getMoveData(entry.moveId, generation)?.power ?? 0;
      const weakest = movesWithPower.reduce((min, m) =>
        m.power < min.power ? m : min,
      );

      if (newPower > weakest.power) {
        const idx = moves.indexOf(weakest.id);
        replaced = weakest.id;
        moves[idx] = entry.moveId;
        learned = entry.moveId;
      }
    }
  }

  return { moves, learned, replaced };
}

/**
 * Assign initial moves to a pokemon that has none.
 * Wrapper around assignDefaultMoves from moves.ts.
 */
export function initializeMoves(pokemonId: number, level: number, generation?: string): number[] {
  return assignDefaultMoves(pokemonId, level, generation);
}
