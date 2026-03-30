import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { levelToXp, xpToLevel } from '../src/core/xp.js';

describe('levelToXp', () => {
  describe('medium_fast (default)', () => {
    it('Lv.1 = 1', () => assert.equal(levelToXp(1, 'medium_fast'), 1));
    it('Lv.5 = 125', () => assert.equal(levelToXp(5, 'medium_fast'), 125));
    it('Lv.10 = 1000', () => assert.equal(levelToXp(10, 'medium_fast'), 1000));
    it('Lv.50 = 125000', () => assert.equal(levelToXp(50, 'medium_fast'), 125000));
    it('Lv.100 = 1000000', () => assert.equal(levelToXp(100, 'medium_fast'), 1000000));
    it('defaults to medium_fast', () => assert.equal(levelToXp(10), 1000));
  });

  describe('medium_slow', () => {
    it('Lv.1 = 0 (clamped)', () => assert.equal(levelToXp(1, 'medium_slow'), 0));
    it('Lv.16 = 2535 (spec)', () => assert.equal(levelToXp(16, 'medium_slow'), 2535));
    it('Lv.50 = 117360', () => assert.equal(levelToXp(50, 'medium_slow'), 117360));
    it('Lv.100 = 1059860', () => assert.equal(levelToXp(100, 'medium_slow'), 1059860));
  });

  describe('slow', () => {
    it('Lv.1 = 1', () => assert.equal(levelToXp(1, 'slow'), 1));
    it('Lv.14 = 3430 (spec)', () => assert.equal(levelToXp(14, 'slow'), 3430));
    it('Lv.50 = 156250', () => assert.equal(levelToXp(50, 'slow'), 156250));
    it('Lv.100 = 1250000', () => assert.equal(levelToXp(100, 'slow'), 1250000));
  });

  describe('fast', () => {
    it('Lv.1 = 0', () => assert.equal(levelToXp(1, 'fast'), 0));
    it('Lv.10 = 800', () => assert.equal(levelToXp(10, 'fast'), 800));
    it('Lv.50 = 100000', () => assert.equal(levelToXp(50, 'fast'), 100000));
    it('Lv.100 = 800000', () => assert.equal(levelToXp(100, 'fast'), 800000));
  });

  describe('erratic', () => {
    it('Lv.1 = 1', () => assert.equal(levelToXp(1, 'erratic'), 1));
    it('Lv.50 = 125000', () => assert.equal(levelToXp(50, 'erratic'), 125000));
    it('Lv.68 = 257834', () => assert.equal(levelToXp(68, 'erratic'), 257834));
    it('Lv.98 = 584166', () => assert.equal(levelToXp(98, 'erratic'), 584166));
    it('Lv.100 = 600000', () => assert.equal(levelToXp(100, 'erratic'), 600000));
  });

  describe('fluctuating', () => {
    it('Lv.1 = 0', () => assert.equal(levelToXp(1, 'fluctuating'), 0));
    it('Lv.15 = 1980', () => assert.equal(levelToXp(15, 'fluctuating'), 1980));
    it('Lv.36 = 46656', () => assert.equal(levelToXp(36, 'fluctuating'), 46656));
    it('Lv.100 = 1640000', () => assert.equal(levelToXp(100, 'fluctuating'), 1640000));
  });

  describe('edge cases', () => {
    it('Lv.0 treated as 1', () => assert.equal(levelToXp(0, 'medium_fast'), 1));
    it('negative treated as 1', () => assert.equal(levelToXp(-5, 'medium_fast'), 1));
    it('never returns negative', () => {
      for (let lv = 0; lv <= 100; lv++) {
        for (const g of ['medium_fast', 'medium_slow', 'slow', 'fast', 'erratic', 'fluctuating'] as const) {
          assert.ok(levelToXp(lv, g) >= 0, `levelToXp(${lv}, ${g}) >= 0`);
        }
      }
    });
  });
});

describe('xpToLevel', () => {
  it('0 XP = Lv.1', () => assert.equal(xpToLevel(0, 'medium_fast'), 1));
  it('negative XP = Lv.1', () => assert.equal(xpToLevel(-100, 'medium_fast'), 1));
  it('medium_slow 2535 XP = Lv.16', () => assert.equal(xpToLevel(2535, 'medium_slow'), 16));
  it('slow 3430 XP = Lv.14', () => assert.equal(xpToLevel(3430, 'slow'), 14));
  it('medium_fast 1000 XP = Lv.10', () => assert.equal(xpToLevel(1000, 'medium_fast'), 10));
  it('medium_fast 999 XP = Lv.9', () => assert.equal(xpToLevel(999, 'medium_fast'), 9));
  it('medium_fast 1001 XP = Lv.10', () => assert.equal(xpToLevel(1001, 'medium_fast'), 10));
  it('defaults to medium_fast', () => assert.equal(xpToLevel(1000), 10));

  it('roundtrip: levelToXp → xpToLevel for all groups', () => {
    for (const g of ['medium_fast', 'medium_slow', 'slow', 'fast', 'erratic', 'fluctuating'] as const) {
      for (const lv of [1, 5, 10, 16, 25, 50, 75, 100]) {
        const xp = levelToXp(lv, g);
        assert.equal(xpToLevel(xp, g), lv, `roundtrip(${lv}, ${g})`);
      }
    }
  });
});
