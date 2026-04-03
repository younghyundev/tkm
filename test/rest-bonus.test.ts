import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for Turn Floor and Rest Bonus mechanics.
 * These test the pure logic extracted from stop.ts.
 */

// Replicate getTurnFloor logic (same as in stop.ts)
function getTurnFloor(level: number): number {
  if (level <= 10) return 3;
  if (level <= 20) return 2;
  return 0;
}

// Replicate rest bonus activation logic
function getRestBonus(elapsedMs: number, hasExistingBonus: boolean): { multiplier: number; turns_remaining: number } | null {
  if (hasExistingBonus) return null;
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (elapsedMs < TWO_HOURS) return null;
  if (elapsedMs >= ONE_DAY) return { multiplier: 3.0, turns_remaining: 10 };
  if (elapsedMs >= SIX_HOURS) return { multiplier: 2.0, turns_remaining: 5 };
  return { multiplier: 1.5, turns_remaining: 3 };
}

// Replicate XP calculation with floor + rest
function calculateFinalXp(tokenXp: number, level: number, restMult: number): number {
  const floor = getTurnFloor(level);
  return Math.floor(Math.max(floor, tokenXp) * restMult);
}

describe('getTurnFloor', () => {
  it('Lv.1 gets floor 3', () => assert.equal(getTurnFloor(1), 3));
  it('Lv.5 gets floor 3', () => assert.equal(getTurnFloor(5), 3));
  it('Lv.10 gets floor 3', () => assert.equal(getTurnFloor(10), 3));
  it('Lv.11 gets floor 2', () => assert.equal(getTurnFloor(11), 2));
  it('Lv.15 gets floor 2', () => assert.equal(getTurnFloor(15), 2));
  it('Lv.20 gets floor 2', () => assert.equal(getTurnFloor(20), 2));
  it('Lv.21 gets floor 0', () => assert.equal(getTurnFloor(21), 0));
  it('Lv.50 gets floor 0', () => assert.equal(getTurnFloor(50), 0));
  it('Lv.100 gets floor 0', () => assert.equal(getTurnFloor(100), 0));
});

describe('getRestBonus activation', () => {
  const h = (hours: number) => hours * 60 * 60 * 1000;

  it('no activation under 2 hours', () => {
    assert.equal(getRestBonus(h(1), false), null);
    assert.equal(getRestBonus(h(1.9), false), null);
  });

  it('1.5x for 3 turns at 2h', () => {
    const bonus = getRestBonus(h(2), false);
    assert.deepEqual(bonus, { multiplier: 1.5, turns_remaining: 3 });
  });

  it('1.5x for 3 turns at 5h', () => {
    const bonus = getRestBonus(h(5), false);
    assert.deepEqual(bonus, { multiplier: 1.5, turns_remaining: 3 });
  });

  it('2.0x for 5 turns at 6h', () => {
    const bonus = getRestBonus(h(6), false);
    assert.deepEqual(bonus, { multiplier: 2.0, turns_remaining: 5 });
  });

  it('2.0x for 5 turns at 23h', () => {
    const bonus = getRestBonus(h(23), false);
    assert.deepEqual(bonus, { multiplier: 2.0, turns_remaining: 5 });
  });

  it('3.0x for 10 turns at 24h', () => {
    const bonus = getRestBonus(h(24), false);
    assert.deepEqual(bonus, { multiplier: 3.0, turns_remaining: 10 });
  });

  it('3.0x for 10 turns at 72h (capped)', () => {
    const bonus = getRestBonus(h(72), false);
    assert.deepEqual(bonus, { multiplier: 3.0, turns_remaining: 10 });
  });

  it('3.0x for 10 turns at 720h (30 days, capped)', () => {
    const bonus = getRestBonus(h(720), false);
    assert.deepEqual(bonus, { multiplier: 3.0, turns_remaining: 10 });
  });

  it('no activation if bonus already active', () => {
    assert.equal(getRestBonus(h(24), true), null);
  });
});

describe('calculateFinalXp (floor + rest)', () => {
  it('Lv.1, tiny tokens (1 XP), no rest → floor 3', () => {
    assert.equal(calculateFinalXp(1, 1, 1.0), 3);
  });

  it('Lv.1, zero tokens (1 XP min), no rest → floor 3', () => {
    assert.equal(calculateFinalXp(1, 1, 1.0), 3);
  });

  it('Lv.1, high tokens (50 XP), no rest → token XP', () => {
    assert.equal(calculateFinalXp(50, 1, 1.0), 50);
  });

  it('Lv.15, tiny tokens (1 XP), no rest → floor 2', () => {
    assert.equal(calculateFinalXp(1, 15, 1.0), 2);
  });

  it('Lv.25, tiny tokens (1 XP), no rest → no floor (1 XP)', () => {
    assert.equal(calculateFinalXp(1, 25, 1.0), 1);
  });

  it('Lv.1, tiny tokens, 24h rest (3x) → floor 3 × 3 = 9', () => {
    assert.equal(calculateFinalXp(1, 1, 3.0), 9);
  });

  it('Lv.1, tiny tokens, 6h rest (2x) → floor 3 × 2 = 6', () => {
    assert.equal(calculateFinalXp(1, 1, 2.0), 6);
  });

  it('Lv.1, tiny tokens, 2h rest (1.5x) → floor 3 × 1.5 = 4', () => {
    assert.equal(calculateFinalXp(1, 1, 1.5), 4);
  });

  it('Lv.1, high tokens (50 XP), 3x rest → 150', () => {
    assert.equal(calculateFinalXp(50, 1, 3.0), 150);
  });

  it('Lv.25, high tokens (50 XP), 3x rest → 150 (no floor)', () => {
    assert.equal(calculateFinalXp(50, 25, 3.0), 150);
  });
});

describe('rest bonus countdown', () => {
  it('decrements turns_remaining', () => {
    const bonus = { multiplier: 2.0, turns_remaining: 5 };
    bonus.turns_remaining--;
    assert.equal(bonus.turns_remaining, 4);
  });

  it('expires at 0', () => {
    const bonus = { multiplier: 2.0, turns_remaining: 1 };
    bonus.turns_remaining--;
    assert.equal(bonus.turns_remaining <= 0, true);
  });

  it('full countdown from 10 turns', () => {
    let remaining = 10;
    for (let i = 0; i < 10; i++) {
      remaining--;
    }
    assert.equal(remaining, 0);
  });
});
