import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ppBar } from '../src/core/pp.js';
import type { StdinData } from '../src/core/types.js';

describe('ppBar', () => {
  it('70% remaining shows battery bar + percentage + time', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 7200; // +2h
    const data: StdinData = {
      rate_limits: {
        five_hour: { used_percentage: 30, resets_at: futureTs },
      },
    };
    const result = ppBar(data);
    assert.ok(result);
    assert.ok(result.startsWith('\u{1F50B}'));  // 🔋
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
    const result = ppBar(data);
    assert.ok(result);
    assert.ok(result.includes('0%'));
    assert.ok(result.includes('\u2591\u2591\u2591\u2591\u2591\u2591'));
  });

  it('100% remaining (used 0%) shows all filled blocks', () => {
    const data: StdinData = {
      rate_limits: {
        five_hour: { used_percentage: 0, resets_at: 0 },
      },
    };
    const result = ppBar(data);
    assert.ok(result);
    assert.ok(result.includes('100%'));
    assert.ok(result.includes('\u2588\u2588\u2588\u2588\u2588\u2588'));
  });

  it('returns null when rate_limits is missing', () => {
    const data: StdinData = {};
    assert.equal(ppBar(data), null);
  });

  it('returns null when five_hour is missing', () => {
    const data: StdinData = {
      rate_limits: { seven_day: { used_percentage: 29, resets_at: 0 } },
    };
    assert.equal(ppBar(data), null);
  });

  it('omits time when resets_at is in the past', () => {
    const pastTs = Math.floor(Date.now() / 1000) - 3600;
    const data: StdinData = {
      rate_limits: {
        five_hour: { used_percentage: 50, resets_at: pastTs },
      },
    };
    const result = ppBar(data);
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
    const result = ppBar(data);
    assert.ok(result);
    assert.ok(result.includes('0%'));
  });
});
