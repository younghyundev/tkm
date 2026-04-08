import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { awardGymVictory, loadGymData, _resetGymCache } from '../src/core/gym.js';
import type { GymData, State } from '../src/core/types.js';

// ── Helpers ──

function makeState(): State {
  return {
    pokemon: {},
    generation: 'gen1',
    gym_badges: [],
  } as unknown as State;
}

function makeGymWithEmptyTeam(): GymData {
  return {
    id: 99,
    leader: 'TestLeader',
    leaderKo: '테스트리더',
    type: 'normal',
    badge: 'TestBadge',
    badgeKo: '테스트배지',
    team: [],
    region: 'test',
  };
}

// ── Tests ──

describe('awardGymVictory', () => {
  it('returns 0 XP and no badge when team is empty', () => {
    const state = makeState();
    const gym = makeGymWithEmptyTeam();
    const result = awardGymVictory(state, gym, ['pikachu']);

    assert.equal(result.xpAwarded, 0, 'XP should be 0 for empty team');
    assert.equal(result.badgeEarned, false, 'No badge should be earned');
    assert.equal(result.badge, 'TestBadge');
    assert.deepEqual(state.gym_badges, [], 'No badge should be added to state');
  });
});

describe('loadGymData', () => {
  beforeEach(() => {
    _resetGymCache();
  });

  it('returns empty array for non-existent generation', () => {
    const gyms = loadGymData('gen999-nonexistent');
    assert.deepEqual(gyms, [], 'Should return empty array when generation file does not exist');
  });
});
