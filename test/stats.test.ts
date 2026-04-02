import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import {
  updateStreak,
  resetWeeklyStats,
  getISOWeek,
  getTodayDate,
  recordXp,
  recordBattle,
  recordCatch,
  recordEncounter,
} from '../src/core/stats.js';

describe('stats', () => {
  describe('getTodayDate', () => {
    it('returns YYYY-MM-DD format', () => {
      const today = getTodayDate();
      assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getISOWeek', () => {
    it('returns ISO week string format', () => {
      const week = getISOWeek('2026-01-05');
      assert.match(week, /^\d{4}-W\d{2}$/);
    });

    it('different weeks return different strings', () => {
      const w1 = getISOWeek('2026-01-05');
      const w2 = getISOWeek('2026-01-12');
      assert.notEqual(w1, w2);
    });

    it('same week returns same string', () => {
      // Mon and Fri of same week
      const w1 = getISOWeek('2026-01-05'); // Monday
      const w2 = getISOWeek('2026-01-09'); // Friday
      assert.equal(w1, w2);
    });
  });

  describe('updateStreak', () => {
    it('initializes streak to 1 on first session', () => {
      const state = makeState();
      updateStreak(state);
      assert.equal(state.stats.streak_days, 1);
      assert.equal(state.stats.longest_streak, 1);
      assert.equal(state.stats.last_active_date, getTodayDate());
    });

    it('no change on same day', () => {
      const today = getTodayDate();
      const state = makeState({
        stats: {
          ...makeState().stats,
          streak_days: 5,
          longest_streak: 10,
          last_active_date: today,
        },
      });
      updateStreak(state);
      assert.equal(state.stats.streak_days, 5);
    });

    it('increments on consecutive day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      const yesterdayStr = `${y}-${m}-${d}`;

      const state = makeState({
        stats: {
          ...makeState().stats,
          streak_days: 3,
          longest_streak: 5,
          last_active_date: yesterdayStr,
        },
      });
      updateStreak(state);
      assert.equal(state.stats.streak_days, 4);
    });

    it('resets on gap (2+ days)', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const dateStr = threeDaysAgo.toISOString().slice(0, 10);

      const state = makeState({
        stats: {
          ...makeState().stats,
          streak_days: 10,
          longest_streak: 15,
          last_active_date: dateStr,
        },
      });
      updateStreak(state);
      assert.equal(state.stats.streak_days, 1);
      // longest_streak preserved
      assert.equal(state.stats.longest_streak, 15);
    });

    it('updates longest_streak when current exceeds it', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      const yesterdayStr = `${y}-${m}-${d}`;

      const state = makeState({
        stats: {
          ...makeState().stats,
          streak_days: 9,
          longest_streak: 9,
          last_active_date: yesterdayStr,
        },
      });
      updateStreak(state);
      assert.equal(state.stats.streak_days, 10);
      assert.equal(state.stats.longest_streak, 10);
    });
  });

  describe('resetWeeklyStats', () => {
    it('resets weekly stats when week changes', () => {
      const state = makeState({
        stats: {
          ...makeState().stats,
          weekly_xp: 500,
          weekly_battles_won: 3,
          weekly_catches: 2,
          last_reset_week: '2020-W01', // old week
        },
      });
      resetWeeklyStats(state);
      assert.equal(state.stats.weekly_xp, 0);
      assert.equal(state.stats.weekly_battles_won, 0);
      assert.equal(state.stats.weekly_catches, 0);
      assert.notEqual(state.stats.last_reset_week, '2020-W01');
    });

    it('does not reset when same week', () => {
      const currentWeek = getISOWeek(getTodayDate());
      const state = makeState({
        stats: {
          ...makeState().stats,
          weekly_xp: 500,
          last_reset_week: currentWeek,
        },
      });
      resetWeeklyStats(state);
      assert.equal(state.stats.weekly_xp, 500);
    });
  });

  describe('record functions', () => {
    it('recordXp accumulates weekly and total', () => {
      const state = makeState();
      recordXp(state, 100);
      assert.equal(state.stats.weekly_xp, 100);
      assert.equal(state.stats.total_xp_earned, 100);
      recordXp(state, 50);
      assert.equal(state.stats.weekly_xp, 150);
      assert.equal(state.stats.total_xp_earned, 150);
    });

    it('recordBattle tracks wins and losses', () => {
      const state = makeState();
      recordBattle(state, true);
      assert.equal(state.stats.weekly_battles_won, 1);
      assert.equal(state.stats.total_battles_won, 1);
      recordBattle(state, false);
      assert.equal(state.stats.weekly_battles_lost, 1);
      assert.equal(state.stats.total_battles_lost, 1);
    });

    it('recordCatch increments counters', () => {
      const state = makeState();
      recordCatch(state);
      assert.equal(state.stats.weekly_catches, 1);
      assert.equal(state.stats.total_catches, 1);
    });

    it('recordEncounter increments counters', () => {
      const state = makeState();
      recordEncounter(state);
      assert.equal(state.stats.weekly_encounters, 1);
      assert.equal(state.stats.total_encounters, 1);
    });
  });
});
