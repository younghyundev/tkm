import type { State } from './types.js';

const BALL_DROP_RATE_ON_VICTORY = 0.30;
const BALL_DROP_RATE_ON_BATTLE = 0.12;

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
 * Roll for pokeball drop after a battle.
 * Returns the number of balls dropped (0 if no drop).
 */
export function rollItemDrop(state: State, won: boolean): number {
  const rate = won ? BALL_DROP_RATE_ON_VICTORY : BALL_DROP_RATE_ON_BATTLE;
  if (Math.random() < rate) {
    const count = won ? randInt(1, 5) : randInt(1, 2);
    addItem(state, 'pokeball', count);
    return count;
  }
  return 0;
}
