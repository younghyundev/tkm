import { getTypeEffectiveness } from './type-chart.js';
import { isStatusImmune } from './status-effects.js';
import type { BattlePokemon, TurnAction } from './types.js';

/** Base score for a status move (equivalent to a ~60-power move with neutral typing). */
const STATUS_MOVE_BASE_SCORE = 60;

function getHpRatio(pokemon: BattlePokemon): number {
  return pokemon.maxHp > 0 ? pokemon.currentHp / pokemon.maxHp : 0;
}

function averageStages(mon: BattlePokemon, stats: Array<keyof BattlePokemon['statStages']>): number {
  return stats.reduce((sum, stat) => sum + mon.statStages[stat], 0) / stats.length;
}

function scoreStatChangeMove(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattlePokemon['moves'][number],
): number {
  const changes = move.data.statChanges ?? [];
  if (changes.length === 0) return 0;

  const selfChanges = changes.filter((c) => c.target === 'self' && c.stages > 0);
  if (selfChanges.length > 0) {
    const stats = selfChanges.map((c) => c.stat);
    if (stats.every((stat) => attacker.statStages[stat] >= 6)) return 0;
    const currentStageAverage = averageStages(attacker, stats);
    return Math.max(0, (STATUS_MOVE_BASE_SCORE + 10) * (1 - currentStageAverage / 6));
  }

  const opponentChanges = changes.filter((c) => c.target === 'opponent' && c.stages < 0);
  if (opponentChanges.length > 0) {
    if (getHpRatio(defender) <= 0.5) return 0;
    const targetStat = opponentChanges[0].stat;
    if (defender.statStages[targetStat] <= -6) return 0;
    const normalized = Math.max(0, Math.min(1, defender.statStages[targetStat] / 6));
    return 40 * (1 - normalized);
  }

  return 0;
}

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
    // Compute move-type effectiveness once — shared by status and damage branches
    let typeEff = 1.0;
    for (const defType of defender.types) {
      typeEff *= getTypeEffectiveness(move.data.type, defType);
    }

    if (move.data.power === 0 && move.data.statChanges?.length) {
      return { index, score: scoreStatChangeMove(attacker, defender, move) };
    }

    // Status move scoring
    if (move.data.effect && move.data.power === 0) {
      if (defender.statusCondition !== null) {
        return { index, score: 0 };
      }
      if (isStatusImmune(defender, move.data.effect.type)) {
        return { index, score: 0 };
      }
      // Move-type immunity also blocks status (e.g., Thunder Wave vs Ground)
      if (typeEff === 0) {
        return { index, score: 0 };
      }
      return { index, score: STATUS_MOVE_BASE_SCORE };
    }

    // Damaging move scoring (unchanged)
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
