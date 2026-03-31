import { getPokemonDB } from './pokemon-data.js';

/**
 * Get raw type effectiveness multiplier for attacker type vs defender type.
 * Returns: 1.5 (super effective), 0.67 (not effective), 0.25 (immune), 1.0 (neutral)
 */
export function getTypeEffectiveness(attackType: string, defendType: string): number {
  const db = getPokemonDB();
  const chart = db.type_chart[attackType];
  if (!chart) return 1.0;

  if (chart.immune.includes(defendType)) return 0.25;
  if (chart.strong.includes(defendType)) return 1.5;
  if (chart.weak.includes(defendType)) return 0.67;
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
 * Apply dampening to compress extreme dual-type stacking.
 * Formula: 1 + (raw - 1) * 0.4
 */
export function applyTypeDampening(rawMultiplier: number): number {
  return 1 + (rawMultiplier - 1) * 0.4;
}
