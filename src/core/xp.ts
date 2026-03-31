import type { ExpGroup } from './types.js';

/**
 * 6-group experience formula matching original Pokemon games.
 * Returns cumulative XP needed to reach the given level.
 */
export function levelToXp(level: number, group: ExpGroup = 'medium_fast'): number {
  const n = Math.max(1, level);

  let xp: number;
  switch (group) {
    case 'medium_slow':
      xp = Math.floor(6 * n ** 3 / 5 - 15 * n ** 2 + 100 * n - 140);
      break;
    case 'slow':
      xp = Math.floor(5 * n ** 3 / 4);
      break;
    case 'fast':
      xp = Math.floor(4 * n ** 3 / 5);
      break;
    case 'erratic':
      if (n <= 50) xp = Math.floor(n ** 3 * (100 - n) / 50);
      else if (n <= 68) xp = Math.floor(n ** 3 * (150 - n) / 100);
      else if (n <= 98) xp = Math.floor(n ** 3 * ((1911 - 10 * n) / 3) / 500);
      else if (n <= 100) xp = Math.floor(n ** 3 * (160 - n) / 100);
      else {
        // Erratic formula decreases past ~100; extrapolate linearly to keep monotonic
        const xp100 = Math.floor(100 ** 3 * (160 - 100) / 100); // 600000
        const xp99 = Math.floor(99 ** 3 * (160 - 99) / 100);   // 592118
        xp = xp100 + (n - 100) * (xp100 - xp99);
      }
      break;
    case 'fluctuating':
      if (n <= 15) xp = Math.floor(n ** 3 * ((n + 1) / 3 + 24) / 50);
      else if (n <= 36) xp = Math.floor(n ** 3 * (n + 14) / 50);
      else xp = Math.floor(n ** 3 * (n / 2 + 32) / 50);
      break;
    default: // medium_fast
      xp = n ** 3;
      break;
  }

  return Math.max(0, xp);
}

/**
 * Binary search: given cumulative XP, find the level.
 */
export function xpToLevel(xp: number, group: ExpGroup = 'medium_fast'): number {
  if (xp <= 0) return 1;

  let lo = 1;
  let hi = 10000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const midXp = levelToXp(mid, group);
    // Reject levels where formula returns 0 (clamped from negative, e.g. erratic >160)
    if (midXp <= xp && (midXp > 0 || mid <= 1)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return Math.max(1, lo);
}
