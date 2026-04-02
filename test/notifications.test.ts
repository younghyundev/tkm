import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';
import {
  checkPendingNotifications,
  getActiveNotifications,
  dismissNotification,
  dismissAll,
  refreshNotifications,
  updateKnownRegions,
} from '../src/core/notifications.js';

describe('notifications', () => {
  describe('checkPendingNotifications', () => {
    it('returns evolution_ready notification for party pokemon', () => {
      const state = makeState({
        pokemon: {
          '281': { id: 281, xp: 5000, level: 30, friendship: 0, ev: 0, evolution_ready: true, evolution_options: ['282', '475'] },
        },
      });
      const config = makeConfig({ party: ['281'] });
      const notifs = checkPendingNotifications(state, config);
      const evoNotifs = notifs.filter(n => n.type === 'evolution_ready');
      assert.equal(evoNotifs.length, 1);
      assert.ok(evoNotifs[0].id.includes('281'));
    });

    it('does not notify for evolution_ready pokemon not in party', () => {
      const state = makeState({
        pokemon: {
          '281': { id: 281, xp: 5000, level: 30, friendship: 0, ev: 0, evolution_ready: true, evolution_options: ['282'] },
        },
      });
      const config = makeConfig({ party: ['387'] }); // different pokemon in party
      const notifs = checkPendingNotifications(state, config);
      const evoNotifs = notifs.filter(n => n.type === 'evolution_ready');
      assert.equal(evoNotifs.length, 0);
    });

    it('does not notify for dismissed notifications', () => {
      const state = makeState({
        pokemon: {
          '281': { id: 281, xp: 5000, level: 30, friendship: 0, ev: 0, evolution_ready: true, evolution_options: ['282'] },
        },
        dismissed_notifications: ['evolution_ready:281'],
      });
      const config = makeConfig({ party: ['281'] });
      const notifs = checkPendingNotifications(state, config);
      const evoNotifs = notifs.filter(n => n.type === 'evolution_ready');
      assert.equal(evoNotifs.length, 0);
    });

    it('returns empty when notifications disabled', () => {
      const state = makeState({
        pokemon: {
          '281': { id: 281, xp: 5000, level: 30, friendship: 0, ev: 0, evolution_ready: true, evolution_options: ['282'] },
        },
      });
      const config = makeConfig({ party: ['281'], notifications_enabled: false });
      const notifs = checkPendingNotifications(state, config);
      assert.equal(notifs.length, 0);
    });

    it('detects achievement_near at 90%+ progress', () => {
      // first_session trigger_value=1, so 0 sessions = 0% (not near)
      // ten_sessions trigger_value=10, so 9 sessions = 90% (near)
      const state = makeState({ session_count: 9 });
      const config = makeConfig();
      const notifs = checkPendingNotifications(state, config);
      const achNotifs = notifs.filter(n => n.type === 'achievement_near');
      assert.ok(achNotifs.length >= 1, 'Should have at least one achievement_near notification');
    });

    it('achievement_near message contains localized name, not raw ID', () => {
      const state = makeState({ session_count: 9 });
      const config = makeConfig();
      const notifs = checkPendingNotifications(state, config);
      const achNotifs = notifs.filter(n => n.type === 'achievement_near');
      assert.ok(achNotifs.length >= 1);
      for (const notif of achNotifs) {
        // Raw IDs contain underscores (e.g., "ten_sessions"), localized names should not
        const idMatch = notif.id.match(/achievement_near:(.+)/);
        if (idMatch) {
          const rawId = idMatch[1];
          assert.ok(
            !notif.message.includes(rawId),
            `Notification message should use localized name, not raw ID "${rawId}": ${notif.message}`
          );
        }
      }
    });

    it('does not detect achievement_near below 90%', () => {
      const state = makeState({ session_count: 5 });
      const config = makeConfig();
      const notifs = checkPendingNotifications(state, config);
      const achNotifs = notifs.filter(n => n.type === 'achievement_near' && n.id.includes('ten_sessions'));
      assert.equal(achNotifs.length, 0);
    });

    it('skips already-achieved achievements', () => {
      const state = makeState({
        session_count: 10,
        achievements: { ten_sessions: true },
      });
      const config = makeConfig();
      const notifs = checkPendingNotifications(state, config);
      const achNotifs = notifs.filter(n => n.id === 'achievement_near:ten_sessions');
      assert.equal(achNotifs.length, 0);
    });

    it('detects region_unlocked when more regions available than last_known', () => {
      // Build pokedex with enough caught pokemon to unlock additional regions
      // Region 2 requires 5 caught, region 3 requires 10 caught
      const pokedex: Record<string, any> = {};
      for (let i = 387; i < 400; i++) {
        pokedex[String(i)] = { seen: true, caught: true, first_seen: '2026-01-01' };
      }
      const state = makeState({
        last_known_regions: 1, // pretend we only knew about 1 region
        pokedex,
      });
      const config = makeConfig();
      const notifs = checkPendingNotifications(state, config);
      const regionNotifs = notifs.filter(n => n.type === 'region_unlocked');
      assert.ok(regionNotifs.length >= 1, 'Should detect newly unlocked regions');
    });

    it('does not notify when regions match last_known', () => {
      const state = makeState({ last_known_regions: 99 }); // impossibly high
      const config = makeConfig();
      const notifs = checkPendingNotifications(state, config);
      const regionNotifs = notifs.filter(n => n.type === 'region_unlocked');
      assert.equal(regionNotifs.length, 0);
    });
  });

  describe('getActiveNotifications', () => {
    it('filters out dismissed notifications', () => {
      const state = makeState({
        notifications: [
          { id: 'a', type: 'evolution_ready', message: 'test1', created: '2026-01-01' },
          { id: 'b', type: 'region_unlocked', message: 'test2', created: '2026-01-01' },
        ],
        dismissed_notifications: ['a'],
      });
      const active = getActiveNotifications(state);
      assert.equal(active.length, 1);
      assert.equal(active[0].id, 'b');
    });

    it('returns all when none dismissed', () => {
      const state = makeState({
        notifications: [
          { id: 'a', type: 'evolution_ready', message: 'test1', created: '2026-01-01' },
        ],
      });
      const active = getActiveNotifications(state);
      assert.equal(active.length, 1);
    });
  });

  describe('dismissNotification', () => {
    it('adds id to dismissed list', () => {
      const state = makeState();
      dismissNotification(state, 'test_id');
      assert.ok(state.dismissed_notifications.includes('test_id'));
    });

    it('is idempotent', () => {
      const state = makeState({ dismissed_notifications: ['test_id'] });
      dismissNotification(state, 'test_id');
      assert.equal(state.dismissed_notifications.filter(id => id === 'test_id').length, 1);
    });
  });

  describe('dismissAll', () => {
    it('dismisses all current notifications', () => {
      const state = makeState({
        notifications: [
          { id: 'a', type: 'evolution_ready', message: 'test1', created: '2026-01-01' },
          { id: 'b', type: 'region_unlocked', message: 'test2', created: '2026-01-01' },
        ],
      });
      dismissAll(state);
      assert.ok(state.dismissed_notifications.includes('a'));
      assert.ok(state.dismissed_notifications.includes('b'));
    });
  });

  describe('refreshNotifications', () => {
    it('replaces notifications with fresh scan', () => {
      const state = makeState({
        notifications: [
          { id: 'old', type: 'evolution_ready', message: 'stale', created: '2026-01-01' },
        ],
        pokemon: {
          '281': { id: 281, xp: 5000, level: 30, friendship: 0, ev: 0, evolution_ready: true, evolution_options: ['282'] },
        },
      });
      const config = makeConfig({ party: ['281'] });
      refreshNotifications(state, config);
      assert.ok(state.notifications.some(n => n.id === 'evolution_ready:281'));
      assert.ok(!state.notifications.some(n => n.id === 'old'));
    });
  });

  describe('updateKnownRegions', () => {
    it('sets last_known_regions to current unlocked count', () => {
      const state = makeState({ last_known_regions: 1 });
      updateKnownRegions(state);
      // At minimum, region 1 should be unlocked
      assert.ok(state.last_known_regions >= 1);
    });
  });
});
