import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ppBar } from '../src/core/pp.js';
import type { StdinData } from '../src/core/types.js';

function withMockedNow<T>(nowMs: number, run: () => T): T {
  const realNow = Date.now;
  Date.now = () => nowMs;
  try {
    return run();
  } finally {
    Date.now = realNow;
  }
}

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

  it('returns null when used_percentage is not a number', () => {
    const data: StdinData = {
      rate_limits: {
        five_hour: { used_percentage: undefined as any, resets_at: 0 },
      },
    };
    assert.equal(ppBar(data), null);
  });

  it('shows minutes when remaining time < 1h', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 2700; // +45m
    const data: StdinData = {
      rate_limits: {
        five_hour: { used_percentage: 80, resets_at: futureTs },
      },
    };
    const result = ppBar(data);
    assert.ok(result);
    assert.ok(result.includes('(~45m)'));
  });

  it('shows hours and minutes for > 1h remaining', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 7260; // 2h01m
    const data: StdinData = {
      rate_limits: {
        five_hour: { used_percentage: 30, resets_at: futureTs },
      },
    };
    const result = ppBar(data);
    assert.ok(result);
    assert.ok(result.includes('(~2h1m)'));
  });

  it('rounds 1h59m30s up to 2h instead of showing 1h60m', () => {
    const result = withMockedNow(0, () => ppBar({
      rate_limits: {
        five_hour: { used_percentage: 30, resets_at: 7170 },
      },
    }));
    assert.ok(result);
    assert.ok(result.includes('(~2h)'));
    assert.ok(!result.includes('1h60m'));
  });

  it('keeps exact 2h remaining formatted without minutes', () => {
    const result = withMockedNow(0, () => ppBar({
      rate_limits: {
        five_hour: { used_percentage: 30, resets_at: 7200 },
      },
    }));
    assert.ok(result);
    assert.ok(result.includes('(~2h)'));
    assert.ok(!result.includes('2h0m'));
  });
});
