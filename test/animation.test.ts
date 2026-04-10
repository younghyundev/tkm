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

  it('returns null for negative elapsed (future timestamp)', () => {
    const future = Date.now() + 5000;
    assert.equal(animProgress(future, 1000), null);
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

  it('handles prevHp < currentHp gracefully (corrupted state)', () => {
    // Should still interpolate linearly even if prevHp < currentHp
    const result = interpolateHp(50, 100, 0.5);
    assert.equal(result, 75);
  });
});

describe('hpBar edge cases', () => {
  it('handles maxHp=0 without division error', () => {
    // ratio = max(0, min(1, 0/0)) = NaN → max(0, min(1, NaN)) → max(0, NaN) = NaN
    // This means filled = NaN → '█'.repeat(NaN) = ''
    // So it degrades to all empty. Verify no crash.
    const hpBar = (current: number, max: number, width: number = 10): string => {
      const ratio = Math.max(0, Math.min(1, current / max));
      const filled = Math.round(ratio * width);
      const empty = width - filled;
      const color = ratio > 0.5 ? '\x1b[32m' : ratio > 0.2 ? '\x1b[33m' : '\x1b[31m';
      return `${color}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m`;
    };
    // Should not throw
    const result = hpBar(0, 0);
    assert.ok(typeof result === 'string');
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

describe('detectLastHit effectiveness attribution', () => {
  // Reimplements the core logic of detectLastHit to test effectiveness coupling
  type Eff = 'super' | 'normal' | 'not_very' | 'immune';
  function detectEffectiveness(
    messages: string[],
    opponentDamage: number,
    playerDamage: number,
  ): { target: string; effectiveness: Eff } | null {
    if (opponentDamage > 0 && playerDamage > 0) {
      // Both sides hit — effectiveness is ambiguous, default to normal
      return { target: 'opponent', effectiveness: 'normal' };
    }
    let effectiveness: Eff = 'normal';
    for (const msg of messages) {
      if (msg.includes('효과가 굉장했다')) { effectiveness = 'super'; break; }
      if (msg.includes('효과가 별로인')) { effectiveness = 'not_very'; break; }
      if (msg.includes('효과가 없는')) { effectiveness = 'immune'; break; }
    }
    if (opponentDamage > 0) return { target: 'opponent', effectiveness };
    if (playerDamage > 0) return { target: 'player', effectiveness };
    return null;
  }

  it('single hit: correctly attributes super effective', () => {
    const result = detectEffectiveness(['효과가 굉장했다!'], 40, 0);
    assert.deepEqual(result, { target: 'opponent', effectiveness: 'super' });
  });

  it('single hit: correctly attributes not very effective', () => {
    const result = detectEffectiveness(['효과가 별로인 듯하다'], 0, 20);
    assert.deepEqual(result, { target: 'player', effectiveness: 'not_very' });
  });

  it('both sides hit: defaults to normal even if super effective message exists', () => {
    // This is the key regression test — previously this would wrongly return 'super'
    const result = detectEffectiveness(
      ['효과가 굉장했다!', 'some other message'],
      30, 25,  // both sides deal damage
    );
    assert.deepEqual(result, { target: 'opponent', effectiveness: 'normal' });
  });

  it('no damage: returns null', () => {
    assert.equal(detectEffectiveness(['some message'], 0, 0), null);
  });
});

describe('defeat state lifecycle', () => {
  it('defeatTimestamp marks battle as ended', () => {
    // Verify the guard logic: a battle with defeatTimestamp should be treated as finished
    const isDefeated = (bsf: { defeatTimestamp?: number; battleState: { phase: string } }) => {
      return !!(bsf.defeatTimestamp || bsf.battleState.phase === 'battle_end');
    };

    assert.equal(isDefeated({ battleState: { phase: 'select_action' } }), false);
    assert.equal(isDefeated({ battleState: { phase: 'battle_end' } }), true);
    assert.equal(isDefeated({ defeatTimestamp: Date.now(), battleState: { phase: 'battle_end' } }), true);
    assert.equal(isDefeated({ defeatTimestamp: Date.now(), battleState: { phase: 'select_action' } }), true);
  });
});
