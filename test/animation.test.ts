import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('animProgress', () => {
  const animProgress = (timestamp: number | undefined, durationMs: number): number | null => {
    if (timestamp == null) return null;
    const elapsed = Date.now() - timestamp;
    if (elapsed < 0 || elapsed >= durationMs) return null;
    return Math.min(1, elapsed / durationMs);
  };

  it('returns null for undefined timestamp', () => {
    assert.equal(animProgress(undefined, 1000), null);
  });

  it('returns null when animation has expired', () => {
    const old = Date.now() - 2000;
    assert.equal(animProgress(old, 1000), null);
  });

  it('returns progress between 0 and 1 during animation', () => {
    const now = Date.now();
    const progress = animProgress(now, 1000);
    assert.notEqual(progress, null);
    assert.ok(progress! >= 0 && progress! <= 1);
  });

  it('returns ~0.5 at midpoint', () => {
    const mid = Date.now() - 500;
    const progress = animProgress(mid, 1000);
    assert.notEqual(progress, null);
    assert.ok(progress! >= 0.45 && progress! <= 0.55);
  });
});

describe('HP drain interpolation', () => {
  const interpolateHp = (prevHp: number, currentHp: number, progress: number): number => {
    return Math.round(prevHp - (prevHp - currentHp) * progress);
  };

  it('returns prevHp at progress=0', () => {
    assert.equal(interpolateHp(100, 60, 0), 100);
  });

  it('returns currentHp at progress=1', () => {
    assert.equal(interpolateHp(100, 60, 1), 60);
  });

  it('returns midpoint at progress=0.5', () => {
    assert.equal(interpolateHp(100, 60, 0.5), 80);
  });

  it('handles zero damage (prevHp === currentHp)', () => {
    assert.equal(interpolateHp(100, 100, 0.5), 100);
  });

  it('handles KO (currentHp=0)', () => {
    assert.equal(interpolateHp(80, 0, 0.5), 40);
    assert.equal(interpolateHp(80, 0, 1), 0);
  });
});

describe('sprite collapse row calculation', () => {
  const calcEmptyRows = (totalRows: number, progress: number): number => {
    return Math.floor(totalRows * progress);
  };

  it('returns 0 at start', () => {
    assert.equal(calcEmptyRows(14, 0), 0);
  });

  it('returns all rows at progress=1', () => {
    assert.equal(calcEmptyRows(14, 1), 14);
  });

  it('returns half at progress=0.5', () => {
    assert.equal(calcEmptyRows(14, 0.5), 7);
  });
});
