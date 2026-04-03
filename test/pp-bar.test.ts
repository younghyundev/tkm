import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ppBar } from '../src/core/pp.js';
import { initLocale } from '../src/i18n/index.js';
import type { StdinData } from '../src/core/types.js';

describe('ppBar', () => {
  describe('ko locale', () => {
    beforeEach(() => { initLocale('ko'); });

    it('70% remaining shows bar + percentage + time', () => {
      const futureTs = Math.floor(Date.now() / 1000) + 7200; // +2h
      const data: StdinData = {
        rate_limits: {
          five_hour: { used_percentage: 30, resets_at: futureTs },
        },
      };
      const result = ppBar(data, 'ko');
      assert.ok(result);
      assert.ok(result.startsWith('AI\uB300\uD0C0\uCD9C\uB3D9'));  // AI대타출동
      assert.ok(result.includes('70%'));
      assert.ok(result.includes('(~2h)'));
      assert.match(result, /\[\u2588+\u2591*\]/);
    });

    it('0% remaining (used 100%) shows all empty blocks', () => {
      const data: StdinData = {
        rate_limits: {
          five_hour: { used_percentage: 100, resets_at: 0 },
        },
      };
      const result = ppBar(data, 'ko');
      assert.ok(result);
      assert.ok(result.includes('0%'));
      assert.ok(result.includes('\u2591\u2591\u2591\u2591\u2591\u2591'));  // 6 empty blocks
    });

    it('100% remaining (used 0%) shows all filled blocks', () => {
      const data: StdinData = {
        rate_limits: {
          five_hour: { used_percentage: 0, resets_at: 0 },
        },
      };
      const result = ppBar(data, 'ko');
      assert.ok(result);
      assert.ok(result.includes('100%'));
      assert.ok(result.includes('\u2588\u2588\u2588\u2588\u2588\u2588'));  // 6 filled blocks
    });

    it('returns null when rate_limits is missing', () => {
      const data: StdinData = {};
      const result = ppBar(data, 'ko');
      assert.equal(result, null);
    });

    it('returns null when five_hour is missing', () => {
      const data: StdinData = {
        rate_limits: { seven_day: { used_percentage: 29, resets_at: 0 } },
      };
      const result = ppBar(data, 'ko');
      assert.equal(result, null);
    });

    it('omits time when resets_at is in the past', () => {
      const pastTs = Math.floor(Date.now() / 1000) - 3600; // -1h
      const data: StdinData = {
        rate_limits: {
          five_hour: { used_percentage: 50, resets_at: pastTs },
        },
      };
      const result = ppBar(data, 'ko');
      assert.ok(result);
      assert.ok(result.includes('50%'));
      assert.ok(!result.includes('~'));
    });

    it('clamps to 0% when used_percentage > 100', () => {
      const data: StdinData = {
        rate_limits: {
          five_hour: { used_percentage: 150, resets_at: 0 },
        },
      };
      const result = ppBar(data, 'ko');
      assert.ok(result);
      assert.ok(result.includes('0%'));
    });
  });

  describe('en locale', () => {
    beforeEach(() => { initLocale('en'); });

    it('shows "Substitute" label in English', () => {
      const data: StdinData = {
        rate_limits: {
          five_hour: { used_percentage: 30, resets_at: 0 },
        },
      };
      const result = ppBar(data, 'en');
      assert.ok(result);
      assert.ok(result.startsWith('Substitute'));
      assert.ok(result.includes('70%'));
    });
  });
});
