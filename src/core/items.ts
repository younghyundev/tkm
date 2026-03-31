import type { State, Config } from './types.js';

const RETRY_DROP_RATE_ON_VICTORY = 0.20;
const RETRY_DROP_RATE_ON_BATTLE = 0.05;

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
 * Roll for retry token drop after a battle.
 */
export function rollItemDrop(state: State, won: boolean): boolean {
  const rate = won ? RETRY_DROP_RATE_ON_VICTORY : RETRY_DROP_RATE_ON_BATTLE;
  if (Math.random() < rate) {
    addItem(state, 'retry_token');
    return true;
  }
  return false;
}

/**
 * Check if auto-retry should trigger on defeat.
 */
export function shouldAutoRetry(state: State, config: Config, winRate: number): boolean {
  if (!config.auto_retry_enabled) return false;
  if (winRate < config.auto_retry_threshold) return false;
  return getItemCount(state, 'retry_token') > 0;
}
