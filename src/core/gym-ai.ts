import { getTypeEffectiveness } from './type-chart.js';
import { isStatusImmune } from './status-effects.js';
import type { BattlePokemon, TurnAction } from './types.js';

/** Base score for a status move (equivalent to a ~60-power move with neutral typing). */
const STATUS_MOVE_BASE_SCORE = 60;

/**
 * Select the best move index for the AI.
 *
 * Strategy: score each usable move by power × stab × typeEffectiveness,
 * with status moves scored by a fixed heuristic.
 * Pick the highest-scored move 80% of the time, random 20%.
 * Returns 0 (struggle) when no moves have PP remaining.
 */
export function selectAiMove(attacker: BattlePokemon, defender: BattlePokemon): number {
  const usableMoves = attacker.moves
    .map((m, i) => ({ move: m, index: i }))
    .filter((m) => m.move.currentPp > 0);

  if (usableMoves.length === 0) return 0;

  const scored = usableMoves.map(({ move, index }) => {
    // Status move scoring
    if (move.data.effect && move.data.power === 0) {
      if (defender.statusCondition !== null) {
        return { index, score: 0 };
      }
      if (isStatusImmune(defender, move.data.effect.type)) {
        return { index, score: 0 };
      }
      return { index, score: STATUS_MOVE_BASE_SCORE };
    }

    // Damaging move scoring (unchanged)
    let typeEff = 1.0;
    for (const defType of defender.types) {
      typeEff *= getTypeEffectiveness(move.data.type, defType);
    }
    const stab = attacker.types.includes(move.data.type) ? 1.5 : 1.0;
    const power = move.data.power || 0;
    return { index, score: power * stab * typeEff };
  });

  // Filter out zero-scored moves so they are never selected
  const viable = scored.filter((s) => s.score > 0);
  if (viable.length === 0) return scored[0].index;

  viable.sort((a, b) => b.score - a.score);

  if (Math.random() < 0.8 || viable.length === 1) {
    return viable[0].index;
  }
  return viable[Math.floor(Math.random() * viable.length)].index;
}

/**
 * Select an AI action for the current turn.
 * v1: always picks a move (no switching logic).
 */
export function selectAiAction(attacker: BattlePokemon, defender: BattlePokemon): TurnAction {
  return { type: 'move', moveIndex: selectAiMove(attacker, defender) };
}
