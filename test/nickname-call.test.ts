import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveNameToId, getDisplayName, getPokemonName } from '../src/core/pokemon-data.js';

describe('resolveNameToId', () => {
  it('resolves numeric ID string', () => {
    const id = resolveNameToId('390');
    assert.equal(id, '390');
  });

  it('resolves Korean name', () => {
    const id = resolveNameToId('비버니');
    assert.equal(id, '399');
  });

  it('resolves English name', () => {
    const id = resolveNameToId('Bidoof');
    assert.equal(id, '399');
  });

  it('returns null for unknown name', () => {
    const id = resolveNameToId('nonexistent_pokemon_xyz');
    assert.equal(id, null);
  });

  it('resolves nickname when state is provided', () => {
    const mockState = { pokemon: { '390': { nickname: '파이숭이' } } };
    const id = resolveNameToId('파이숭이', mockState as any);
    assert.equal(id, '390');
  });

  it('prefers ID match over nickname', () => {
    const mockState = { pokemon: { '399': { nickname: '390' } } };
    const id = resolveNameToId('390', mockState as any);
    assert.equal(id, '390'); // direct ID match, not nickname
  });

  it('returns null for unknown nickname when state provided', () => {
    const mockState = { pokemon: { '390': { nickname: '파이숭이' } } };
    const id = resolveNameToId('없는별명', mockState as any);
    assert.equal(id, null);
  });
});

describe('getDisplayName', () => {
  it('returns nickname when provided', () => {
    assert.equal(getDisplayName('390', '파이숭이'), '파이숭이');
  });

  it('returns species name when no nickname', () => {
    const species = getPokemonName('390');
    assert.equal(getDisplayName('390'), species);
    assert.equal(getDisplayName('390', undefined), species);
  });
});

describe('cmdCall EV logic', () => {
  const CALLS_PER_EV = 5;

  it('5 calls = +1 EV', () => {
    let callCount = 0;
    let ev = 0;
    for (let i = 0; i < 5; i++) {
      callCount++;
      if (callCount >= CALLS_PER_EV) {
        ev = Math.min(252, ev + 1);
        callCount = 0;
      }
    }
    assert.equal(ev, 1);
    assert.equal(callCount, 0);
  });

  it('4 calls = no EV gain', () => {
    let callCount = 0;
    let ev = 0;
    for (let i = 0; i < 4; i++) {
      callCount++;
      if (callCount >= CALLS_PER_EV) {
        ev = Math.min(252, ev + 1);
        callCount = 0;
      }
    }
    assert.equal(ev, 0);
    assert.equal(callCount, 4);
  });

  it('EV caps at 252', () => {
    let callCount = 0;
    let ev = 251;
    for (let i = 0; i < 10; i++) {
      callCount++;
      if (callCount >= CALLS_PER_EV) {
        ev = Math.min(252, ev + 1);
        callCount = 0;
      }
    }
    assert.equal(ev, 252);
  });

  it('evGained is false when already at cap (252)', () => {
    let callCount = 0;
    let ev = 252;
    let evGained = false;
    for (let i = 0; i < 5; i++) {
      callCount++;
      if (callCount >= CALLS_PER_EV) {
        const prevEv = ev;
        ev = Math.min(252, ev + 1);
        callCount = 0;
        evGained = ev > prevEv;
      }
    }
    assert.equal(ev, 252);
    assert.equal(evGained, false, 'evGained should be false when already at cap');
  });

  it('10 calls = +2 EV', () => {
    let callCount = 0;
    let ev = 0;
    for (let i = 0; i < 10; i++) {
      callCount++;
      if (callCount >= CALLS_PER_EV) {
        ev = Math.min(252, ev + 1);
        callCount = 0;
      }
    }
    assert.equal(ev, 2);
    assert.equal(callCount, 0);
  });
});
