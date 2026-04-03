import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getVolumeTier, getLegendaryPoolMultiplier } from '../src/core/volume-tier.js';

describe('getVolumeTier', () => {
  describe('boundary: Normal (0–9999)', () => {
    it('0 → normal', () => assert.equal(getVolumeTier(0).name, 'normal'));
    it('-100 → normal', () => assert.equal(getVolumeTier(-100).name, 'normal'));
    it('9999 → normal', () => assert.equal(getVolumeTier(9999).name, 'normal'));
  });

  describe('boundary: Heated (10000–39999)', () => {
    it('10000 → heated', () => assert.equal(getVolumeTier(10000).name, 'heated'));
    it('39999 → heated', () => assert.equal(getVolumeTier(39999).name, 'heated'));
  });

  describe('boundary: Intense (40000–99999)', () => {
    it('40000 → intense', () => assert.equal(getVolumeTier(40000).name, 'intense'));
    it('99999 → intense', () => assert.equal(getVolumeTier(99999).name, 'intense'));
  });

  describe('boundary: Legendary (100000+)', () => {
    it('100000 → legendary', () => assert.equal(getVolumeTier(100000).name, 'legendary'));
    it('1000000 → legendary', () => assert.equal(getVolumeTier(1000000).name, 'legendary'));
  });
});

describe('multiplier values', () => {
  it('Normal: xpMultiplier=1.0', () => assert.equal(getVolumeTier(0).xpMultiplier, 1.0));
  it('Normal: encounterMultiplier=1.0', () => assert.equal(getVolumeTier(0).encounterMultiplier, 1.0));

  it('Heated: xpMultiplier=1.5', () => assert.equal(getVolumeTier(10000).xpMultiplier, 1.5));
  it('Heated: encounterMultiplier=1.5', () => assert.equal(getVolumeTier(10000).encounterMultiplier, 1.5));

  it('Intense: xpMultiplier=2.5', () => assert.equal(getVolumeTier(40000).xpMultiplier, 2.5));
  it('Intense: encounterMultiplier=2.5', () => assert.equal(getVolumeTier(40000).encounterMultiplier, 2.5));

  it('Legendary: xpMultiplier=5.0', () => assert.equal(getVolumeTier(100000).xpMultiplier, 5.0));
  it('Legendary: encounterMultiplier=4.0', () => assert.equal(getVolumeTier(100000).encounterMultiplier, 4.0));
});

describe('rarity weights', () => {
  it('Normal: common=0.55', () => assert.equal(getVolumeTier(0).rarityWeights.common, 0.55));
  it('Legendary: common=0.05', () => assert.equal(getVolumeTier(100000).rarityWeights.common, 0.05));
  it('Legendary: rare=1.04', () => assert.equal(getVolumeTier(100000).rarityWeights.rare, 1.04));
  it('Legendary: legendary=0.30', () => assert.equal(getVolumeTier(100000).rarityWeights.legendary, 0.30));
  it('Legendary: mythical=0.10', () => assert.equal(getVolumeTier(100000).rarityWeights.mythical, 0.10));
});

describe('getLegendaryPoolMultiplier', () => {
  it('Normal → 1.0', () => assert.equal(getLegendaryPoolMultiplier(getVolumeTier(0)), 1.0));
  it('Heated → 3.0', () => assert.equal(getLegendaryPoolMultiplier(getVolumeTier(10000)), 3.0));
  it('Intense → 10.0', () => assert.equal(getLegendaryPoolMultiplier(getVolumeTier(40000)), 10.0));
  it('Legendary → 20.0', () => assert.equal(getLegendaryPoolMultiplier(getVolumeTier(100000)), 20.0));
});
