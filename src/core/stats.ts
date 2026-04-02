import type { State } from './types.js';

/**
 * Get current ISO date string (YYYY-MM-DD) in local timezone.
 */
export function getTodayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get ISO week string (e.g., "2026-W14") for a given date.
 * Week starts on Monday (ISO 8601).
 */
export function getISOWeek(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay() || 7; // Sunday = 7
  date.setDate(date.getDate() + 4 - day); // Thursday of the week
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Update streak based on last active date.
 * - Same day: no change
 * - Consecutive day: increment streak
 * - Gap: reset streak to 1
 */
export function updateStreak(state: State): void {
  const today = getTodayDate();
  const lastDate = state.stats.last_active_date;

  if (lastDate === today) {
    // Same day, no streak change
    return;
  }

  if (lastDate) {
    const last = new Date(lastDate + 'T00:00:00');
    const now = new Date(today + 'T00:00:00');
    const diffMs = now.getTime() - last.getTime();
    const diffDays = Math.round(diffMs / 86400000);

    if (diffDays === 1) {
      // Consecutive day
      state.stats.streak_days += 1;
    } else {
      // Gap — reset (no penalty, just reset counter)
      state.stats.streak_days = 1;
    }
  } else {
    // First session ever
    state.stats.streak_days = 1;
  }

  if (state.stats.streak_days > state.stats.longest_streak) {
    state.stats.longest_streak = state.stats.streak_days;
  }

  state.stats.last_active_date = today;
}

/**
 * Reset weekly stats if current week differs from last recorded week.
 */
export function resetWeeklyStats(state: State): void {
  const today = getTodayDate();
  const currentWeek = getISOWeek(today);

  if (state.stats.last_reset_week !== currentWeek) {
    state.stats.weekly_xp = 0;
    state.stats.weekly_battles_won = 0;
    state.stats.weekly_battles_lost = 0;
    state.stats.weekly_catches = 0;
    state.stats.weekly_encounters = 0;
    state.stats.last_reset_week = currentWeek;
  }
}

/**
 * Record XP earned (both weekly and total).
 */
export function recordXp(state: State, xp: number): void {
  state.stats.weekly_xp += xp;
  state.stats.total_xp_earned += xp;
}

/**
 * Record a battle result in stats.
 */
export function recordBattle(state: State, won: boolean): void {
  if (won) {
    state.stats.weekly_battles_won += 1;
    state.stats.total_battles_won += 1;
  } else {
    state.stats.weekly_battles_lost += 1;
    state.stats.total_battles_lost += 1;
  }
}

/**
 * Record a catch in stats.
 */
export function recordCatch(state: State): void {
  state.stats.weekly_catches += 1;
  state.stats.total_catches += 1;
}

/**
 * Record an encounter in stats.
 */
export function recordEncounter(state: State): void {
  state.stats.weekly_encounters += 1;
  state.stats.total_encounters += 1;
}
