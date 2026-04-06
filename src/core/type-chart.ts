import { getPokemonDB } from './pokemon-data.js';

/**
 * Get raw type effectiveness multiplier for attacker type vs defender type.
 * Returns: 1.5 (super effective), 0.67 (not effective), 0.25 (immune), 1.0 (neutral)
 */
export function getTypeEffectiveness(attackType: string, defendType: string): number {
  const db = getPokemonDB();
  const chart = db.type_chart[attackType];
  if (!chart) return 1.0;

  if (chart.immune.includes(defendType)) return 0;
  if (chart.strong.includes(defendType)) return 2.0;
  if (chart.weak.includes(defendType)) return 0.5;
  return 1.0;
}

/**
 * Calculate raw type multiplier for all attacker types vs all defender types.
 */
export function getRawTypeMultiplier(attackerTypes: string[], defenderTypes: string[]): number {
  let multiplier = 1.0;
  for (const atkType of attackerTypes) {
    for (const defType of defenderTypes) {
      multiplier *= getTypeEffectiveness(atkType, defType);
    }
  }
  return multiplier;
}

/**
 * Pass-through: no dampening applied.
 * Type multipliers use real game values (2x/0.5x/0x).
 */
export function applyTypeDampening(rawMultiplier: number): number {
  return rawMultiplier;
}
