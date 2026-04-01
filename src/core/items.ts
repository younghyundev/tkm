import type { State } from './types.js';

const BALL_DROP_RATE_ON_VICTORY = 0.20;
const BALL_DROP_RATE_ON_BATTLE = 0.05;

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
 */
export function rollItemDrop(state: State, won: boolean): boolean {
  const rate = won ? BALL_DROP_RATE_ON_VICTORY : BALL_DROP_RATE_ON_BATTLE;
  if (Math.random() < rate) {
    addItem(state, 'pokeball');
    return true;
  }
  return false;
}
