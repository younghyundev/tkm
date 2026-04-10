import { getTypeEffectiveness } from './type-chart.js';
import type { BattlePokemon, TurnAction } from './types.js';

/**
 * Select the best move index for the AI.
 *
 * Strategy: score each usable move by `power × stab × typeEffectiveness`,
 * pick the highest-scored move 80% of the time, random 20%.
 * Returns 0 (struggle) when no moves have PP remaining.
 */
export function selectAiMove(attacker: BattlePokemon, defender: BattlePokemon): number {
  const usableMoves = attacker.moves
    .map((m, i) => ({ move: m, index: i }))
    .filter((m) => m.move.currentPp > 0);

  if (usableMoves.length === 0) return 0;

  const scored = usableMoves.map(({ move, index }) => {
    let typeEff = 1.0;
    for (const defType of defender.types) {
      typeEff *= getTypeEffectiveness(move.data.type, defType);
    }
    const stab = attacker.types.includes(move.data.type) ? 1.5 : 1.0;
    const power = move.data.power || 0;
    return { index, score: power * stab * typeEff };
  });

  scored.sort((a, b) => b.score - a.score);

  if (Math.random() < 0.8 || scored.length === 1) {
    return scored[0].index;
  }
  return scored[Math.floor(Math.random() * scored.length)].index;
}

/**
 * Select an AI action for the current turn.
 * v1: always picks a move (no switching logic).
 */
export function selectAiAction(attacker: BattlePokemon, defender: BattlePokemon): TurnAction {
  return { type: 'move', moveIndex: selectAiMove(attacker, defender) };
}
