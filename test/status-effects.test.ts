import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initLocale } from '../src/i18n/index.js';
import type { BattlePokemon, StatusCondition } from '../src/core/types.js';
import {
  isStatusImmune, tryApplyStatus, checkParalysisSkip,
  getBurnAttackMultiplier, getParalysisSpeedMultiplier,
  applyEndOfTurnEffects,
} from '../src/core/status-effects.js';

initLocale('ko');

function makePokemon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  return {
    id: 1, name: '1', displayName: 'Test', types: ['normal'], level: 50,
    maxHp: 160, currentHp: 160, attack: 60, defense: 50, spAttack: 55,
    spDefense: 50, speed: 70, moves: [], fainted: false,
    statusCondition: null, toxicCounter: 0, ...overrides,
  };
}

describe('isStatusImmune', () => {
  it('poison type immune to poison', () => { assert.equal(isStatusImmune(makePokemon({ types: ['poison'] }), 'poison'), true); });
  it('poison type immune to badly_poisoned', () => { assert.equal(isStatusImmune(makePokemon({ types: ['poison'] }), 'badly_poisoned'), true); });
  it('fire type immune to burn', () => { assert.equal(isStatusImmune(makePokemon({ types: ['fire'] }), 'burn'), true); });
  it('electric type immune to paralysis', () => { assert.equal(isStatusImmune(makePokemon({ types: ['electric'] }), 'paralysis'), true); });
  it('normal type not immune', () => {
    assert.equal(isStatusImmune(makePokemon({ types: ['normal'] }), 'burn'), false);
    assert.equal(isStatusImmune(makePokemon({ types: ['normal'] }), 'poison'), false);
    assert.equal(isStatusImmune(makePokemon({ types: ['normal'] }), 'paralysis'), false);
  });
  it('dual-type with immune type blocks', () => { assert.equal(isStatusImmune(makePokemon({ types: ['water', 'poison'] }), 'poison'), true); });
});

describe('tryApplyStatus', () => {
  it('applies to normal pokemon', () => {
    const mon = makePokemon(); const msgs: string[] = [];
    assert.equal(tryApplyStatus(mon, 'burn', msgs), true);
    assert.equal(mon.statusCondition, 'burn');
    assert.ok(msgs.length > 0);
  });
  it('fails when already has status', () => {
    const mon = makePokemon({ statusCondition: 'poison' }); const msgs: string[] = [];
    assert.equal(tryApplyStatus(mon, 'burn', msgs), false);
    assert.equal(mon.statusCondition, 'poison');
  });
  it('fails when type-immune', () => {
    const mon = makePokemon({ types: ['fire'] }); const msgs: string[] = [];
    assert.equal(tryApplyStatus(mon, 'burn', msgs), false);
    assert.equal(mon.statusCondition, null);
  });
  it('inits toxicCounter for badly_poisoned', () => {
    const mon = makePokemon();
    tryApplyStatus(mon, 'badly_poisoned', []);
    assert.equal(mon.statusCondition, 'badly_poisoned');
    assert.equal(mon.toxicCounter, 1);
  });
  it('does not apply to fainted', () => {
    assert.equal(tryApplyStatus(makePokemon({ fainted: true }), 'burn', []), false);
  });
});

describe('getBurnAttackMultiplier', () => {
  it('0.5 for burned', () => { assert.equal(getBurnAttackMultiplier(makePokemon({ statusCondition: 'burn' })), 0.5); });
  it('1.0 for normal', () => { assert.equal(getBurnAttackMultiplier(makePokemon()), 1.0); });
});

describe('getParalysisSpeedMultiplier', () => {
  it('0.5 for paralyzed', () => { assert.equal(getParalysisSpeedMultiplier(makePokemon({ statusCondition: 'paralysis' })), 0.5); });
  it('1.0 for normal', () => { assert.equal(getParalysisSpeedMultiplier(makePokemon()), 1.0); });
});

describe('applyEndOfTurnEffects', () => {
  it('burn deals 1/16 max HP', () => {
    const mon = makePokemon({ maxHp: 160, currentHp: 160, statusCondition: 'burn' }); const msgs: string[] = [];
    applyEndOfTurnEffects(mon, msgs);
    assert.equal(mon.currentHp, 150);
  });
  it('poison deals 1/8 max HP', () => {
    const mon = makePokemon({ maxHp: 160, currentHp: 160, statusCondition: 'poison' }); const msgs: string[] = [];
    applyEndOfTurnEffects(mon, msgs);
    assert.equal(mon.currentHp, 140);
  });
  it('badly_poisoned escalates', () => {
    const mon = makePokemon({ maxHp: 160, currentHp: 160, statusCondition: 'badly_poisoned', toxicCounter: 1 }); const msgs: string[] = [];
    applyEndOfTurnEffects(mon, msgs);
    assert.equal(mon.currentHp, 150); assert.equal(mon.toxicCounter, 2);
    applyEndOfTurnEffects(mon, msgs);
    assert.equal(mon.currentHp, 130); assert.equal(mon.toxicCounter, 3);
  });
  it('can faint from status', () => {
    const mon = makePokemon({ maxHp: 160, currentHp: 5, statusCondition: 'poison' });
    assert.equal(applyEndOfTurnEffects(mon, []), true);
    assert.equal(mon.fainted, true);
  });
  it('paralysis no damage', () => {
    const mon = makePokemon({ statusCondition: 'paralysis' });
    assert.equal(applyEndOfTurnEffects(mon, []), false);
    assert.equal(mon.currentHp, 160);
  });
  it('skip fainted', () => {
    const msgs: string[] = [];
    applyEndOfTurnEffects(makePokemon({ fainted: true, statusCondition: 'burn' }), msgs);
    assert.equal(msgs.length, 0);
  });
});

describe('checkParalysisSkip', () => {
  it('never skips non-paralyzed', () => {
    const mon = makePokemon();
    for (let i = 0; i < 50; i++) assert.equal(checkParalysisSkip(mon, []), false);
  });
  it('~25% skip rate for paralyzed', () => {
    const mon = makePokemon({ statusCondition: 'paralysis' });
    let skips = 0;
    for (let i = 0; i < 1000; i++) if (checkParalysisSkip(mon, [])) skips++;
    assert.ok(skips > 150 && skips < 350, `Expected ~250 skips, got ${skips}`);
  });
});
