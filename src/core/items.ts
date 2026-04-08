import type { State } from './types.js';

/**
 * Returns a random integer in [min, max] inclusive.
 */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function addItem(state: State, item: string, count: number = 1): void {
  if (!state.items) state.items = {};
  state.items[item] = (state.items[item] ?? 0) + count;
}

export function useItem(state: State, item: string): boolean {
  if (!state.items) return false;
  if ((state.items[item] ?? 0) <= 0) return false;
  state.items[item]--;
  return true;
}

export function getItemCount(state: State, item: string): number {
  return state.items?.[item] ?? 0;
}

/**
 * Soft-cap multiplier for ball drop rate based on current inventory.
 * 0-49: 2.0x (recovery boost), 50-149: 1.0x, 150-299: 0.3x, 300+: 0.1x
 */
export function getDropRateMultiplier(state: State): number {
  const count = getItemCount(state, 'pokeball');
  if (count >= 300) return 0.1;
  if (count >= 150) return 0.3;
  if (count >= 50) return 1.0;
  return 2.0;
}
