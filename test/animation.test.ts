import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig, makeState } from './helpers.js';

const REPO_ROOT = process.cwd();
let entryScriptQueue: Promise<void> = Promise.resolve();
const sharedBattleTestRoot = mkdtempSync(join(tmpdir(), 'battle-animation-test-'));
const sharedBattleHomeDir = join(sharedBattleTestRoot, 'home');
const sharedClaudeDir = join(sharedBattleHomeDir, '.claude');
const sharedTokenmonDir = join(sharedClaudeDir, 'tokenmon');
const sharedGenDir = join(sharedTokenmonDir, 'gen4');
const sharedBattleStatePath = join(sharedTokenmonDir, 'battle-state.json');
let childRunCounter = 0;

mkdirSync(sharedGenDir, { recursive: true });
process.once('exit', () => {
  rmSync(sharedBattleTestRoot, { recursive: true, force: true });
});

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function makeBattleTestEnv(t: { after: (fn: () => void) => void }) {
  rmSync(sharedBattleStatePath, { force: true });

  const chimchar = {
    species: '390',
    name: 'Chimchar',
    nickname: null,
    level: 50,
    xp: 125000,
    shiny: false,
    nature: 'hardy',
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: ['Tackle', 'Flamethrower'],
    ability: null,
    friendship: 70,
    caughtAt: '2024-01-01T00:00:00.000Z',
    statusCondition: null,
    gender: 'male',
    heldItem: null,
    currentHp: 104,
    stats: { hp: 104, atk: 72, def: 55, spa: 80, spd: 55, spe: 80 },
    displayName: 'Chimchar',
  } as any;

  writeJson(join(sharedTokenmonDir, 'global-config.json'), {
    active_generation: 'gen4',
    language: 'en',
    voice_tone: 'claude',
    weather_enabled: false,
    weather_location: '',
  });

  writeJson(
    join(sharedGenDir, 'config.json'),
    makeConfig({
      language: 'en',
      party: ['390'],
      starter_chosen: true,
      current_region: '1',
      max_party_size: 6,
      renderer: 'braille',
    }),
  );

  writeJson(
    join(sharedGenDir, 'state.json'),
    makeState({
      pokemon: { 390: chimchar } as any,
      unlocked: ['390'],
    }),
  );

  return {
    battleStatePath: sharedBattleStatePath,
    genDir: sharedGenDir,
    env: {
      ...process.env,
      HOME: sharedBattleHomeDir,
      CLAUDE_CONFIG_DIR: sharedClaudeDir,
      CLAUDE_PLUGIN_ROOT: REPO_ROOT,
      COLUMNS: '120',
    } as NodeJS.ProcessEnv,
  };
}

async function runEntryScript(
  modulePath: string,
  env: NodeJS.ProcessEnv,
  args: string[],
  stdin: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null }> {
  const run = entryScriptQueue.then(async () => {
    const resolvedPath = resolve(REPO_ROOT, modulePath);
    return await new Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null }>(
      (resolveRun, rejectRun) => {
        const runId = childRunCounter++;
        const stdoutPath = join(sharedBattleTestRoot, `child-${runId}.stdout.log`);
        const stderrPath = join(sharedBattleTestRoot, `child-${runId}.stderr.log`);
        const stdoutFd = openSync(stdoutPath, 'w');
        const stderrFd = openSync(stderrPath, 'w');
        const child = spawn(process.execPath, [resolvedPath, ...args], {
          cwd: REPO_ROOT,
          env,
          stdio: ['pipe', stdoutFd, stderrFd],
        });

        closeSync(stdoutFd);
        closeSync(stderrFd);
        let settled = false;
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          rejectRun(new Error(`Timed out waiting for ${modulePath} ${args.join(' ')}`));
        }, 10_000);

        child.on('error', (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          rejectRun(error);
        });
        child.on('close', (exitCode, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          const stdout = readFileSync(stdoutPath, 'utf8');
          const stderr = readFileSync(stderrPath, 'utf8');
          resolveRun({ stdout, stderr, exitCode, signal });
        });
        child.stdin.end(stdin);
      },
    );
  });

  entryScriptQueue = run.then(() => undefined, () => undefined);
  return run;
}

function assertSuccessfulExit(
  label: string,
  result: { stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null },
): void {
  if (result.signal !== null || result.exitCode !== 0) {
    assert.fail(
      `${label} exited unexpectedly with code ${result.exitCode} signal ${result.signal}: ${result.stdout}${result.stderr ? `\n${result.stderr}` : ''}`,
    );
  }
}

function parseFirstJsonLine(
  label: string,
  result: { stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null },
): any {
  const lines = result.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  assert.ok(lines.length >= 1, `${label} should emit at least one JSON line: ${result.stderr || '<no stderr>'}`);
  const primary = JSON.parse(lines[0]) as { status?: string };

  return primary;
}

async function runBattleTurnCommand(
  env: NodeJS.ProcessEnv,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null }> {
  const result = await runEntryScript('dist/cli/battle-turn.js', env, args, '');
  assertSuccessfulExit(`battle-turn ${args.join(' ')}`, result);
  return result;
}

async function runBattleTurn(env: NodeJS.ProcessEnv, args: string[]): Promise<any> {
  const result = await runBattleTurnCommand(env, args);
  return parseFirstJsonLine(`battle-turn ${args.join(' ')}`, result);
}

async function runStatusLine(env: NodeJS.ProcessEnv): Promise<string> {
  const result = await runEntryScript('dist/status-line.js', env, [], '{}');
  assertSuccessfulExit('status-line', result);
  return result.stdout;
}

function readBattleState(path: string): any {
  return readJson<any>(path);
}

function writeBattleState(path: string, nextState: any): void {
  writeJson(path, nextState);
}

function setupAnimatingBattle(
  t: { after: (fn: () => void) => void },
  sessionId: string = 'test-session',
): Promise<{
  battleStatePath: string;
  env: NodeJS.ProcessEnv;
  actionResult: { stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null };
}> {
  const fixture = makeBattleTestEnv(t);
  const env = { ...fixture.env, CLAUDE_SESSION_ID: sessionId };
  return runBattleTurnCommand(env, ['--init', '--gym', '1', '--gen', 'gen4']).then(async () => {
    const actionResult = await runBattleTurnCommand(env, ['--action', '1']);
    return { battleStatePath: fixture.battleStatePath, env, actionResult };
  });
}

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

describe('battle-mode render gating', () => {
  const ANIM_COLLAPSE_MS = 2000;

  const shouldRenderBattleMode = (
    battleData: { defeatTimestamp?: number; battleState: { phase: string } },
    now: number,
  ) => {
    const isExpiredDefeat = !!(
      battleData.defeatTimestamp
      && (now - battleData.defeatTimestamp) >= ANIM_COLLAPSE_MS + 500
    );
    const isEndedWithoutTimestamp = battleData.battleState.phase === 'battle_end'
      && !battleData.defeatTimestamp;

    return !isExpiredDefeat && !isEndedWithoutTimestamp;
  };

  it('does not render legacy terminal states without timestamp', () => {
    assert.equal(
      shouldRenderBattleMode({ battleState: { phase: 'battle_end' } }, Date.now()),
      false,
    );
  });

  it('renders fresh terminal states with timestamp during the grace window', () => {
    const now = Date.now();
    assert.equal(
      shouldRenderBattleMode(
        { defeatTimestamp: now - 500, battleState: { phase: 'battle_end' } },
        now,
      ),
      true,
    );
  });

  it('skips expired terminal states with timestamp', () => {
    const now = Date.now();
    assert.equal(
      shouldRenderBattleMode(
        { defeatTimestamp: now - 3000, battleState: { phase: 'battle_end' } },
        now,
      ),
      false,
    );
  });

  it('renders active battles normally', () => {
    assert.equal(
      shouldRenderBattleMode({ battleState: { phase: 'select_action' } }, Date.now()),
      true,
    );
  });
});

describe('battle animation + refresh flow', { concurrency: false }, () => {
  it('emits animationFrames with valid frame shape after an action', async (t) => {
    const { actionResult } = await setupAnimatingBattle(t);
    const actionOutput = parseFirstJsonLine('battle-turn --action 1', actionResult);

    assert.equal(actionOutput.phase, 'animating');
    assert.ok(Array.isArray(actionOutput.animationFrames));
    assert.ok(actionOutput.animationFrames.length >= 1);

    for (const frame of actionOutput.animationFrames as Array<Record<string, unknown>>) {
      assert.equal(typeof frame.kind, 'string');
      assert.equal(typeof frame.durationMs, 'number');
      assert.ok((frame.durationMs as number) > 0);
      if (frame.kind === 'drain' || frame.kind === 'collapse') {
        assert.equal(typeof frame.playerHp, 'number');
        assert.equal(typeof frame.opponentHp, 'number');
      }
    }
  });

  it('rejects frame refreshes from the wrong session without mutating battle state', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t, 'expected-session');
    const before = readFileSync(battleStatePath, 'utf8');

    const response = await runBattleTurn(
      { ...env, CLAUDE_SESSION_ID: 'wrong-session' },
      ['--refresh', '--frame', '0', '--session', 'wrong-session'],
    );

    assert.equal(response.status, 'rejected');
    assert.equal(response.reason, 'session_mismatch');
    assert.equal(readFileSync(battleStatePath, 'utf8'), before);
  });

  it('rejects frame refreshes when the persisted phase is not animating', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t);
    const state = readBattleState(battleStatePath);
    state.battleState.phase = 'select_action';
    writeBattleState(battleStatePath, state);
    const before = readFileSync(battleStatePath, 'utf8');

    const response = await runBattleTurn(env, ['--refresh', '--frame', '0', '--session', 'test-session']);

    assert.equal(response.status, 'rejected');
    assert.equal(response.reason, 'not_animating');
    assert.equal(readFileSync(battleStatePath, 'utf8'), before);
  });

  it('rejects rewind attempts without mutating battle state', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t);
    const state = readBattleState(battleStatePath);
    state.currentFrameIndex = 2;
    writeBattleState(battleStatePath, state);
    const before = readFileSync(battleStatePath, 'utf8');

    const response = await runBattleTurn(env, ['--refresh', '--frame', '1', '--session', 'test-session']);

    assert.equal(response.status, 'rejected');
    assert.equal(response.reason, 'frame_rewind_forbidden');
    assert.equal(readFileSync(battleStatePath, 'utf8'), before);
  });

  it('rejects out-of-bounds frame refreshes without mutating battle state', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t);
    const before = readFileSync(battleStatePath, 'utf8');

    const response = await runBattleTurn(env, ['--refresh', '--frame', '999', '--session', 'test-session']);

    assert.equal(response.status, 'rejected');
    assert.equal(response.reason, 'frame_out_of_range');
    assert.equal(readFileSync(battleStatePath, 'utf8'), before);
  });

  it('treats refreshing the same frame twice as idempotent', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t);

    await runBattleTurnCommand(env, ['--refresh', '--frame', '0', '--session', 'test-session']);
    const afterFirst = readFileSync(battleStatePath, 'utf8');
    const firstState = readBattleState(battleStatePath);
    await runBattleTurnCommand(env, ['--refresh', '--frame', '0', '--session', 'test-session']);
    const afterSecond = readFileSync(battleStatePath, 'utf8');
    const secondState = readBattleState(battleStatePath);

    assert.equal(firstState.currentFrameIndex, 0);
    assert.equal(secondState.currentFrameIndex, 0);
    assert.equal(afterSecond, afterFirst);
  });

  it('keeps the persisted phase animating until finalize, then returns to select_action', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t);
    let state = readBattleState(battleStatePath);
    assert.equal(state.battleState.phase, 'animating');

    await runBattleTurn(env, ['--refresh', '--frame', '0', '--session', 'test-session']);
    state = readBattleState(battleStatePath);
    assert.equal(state.battleState.phase, 'animating');

    await runBattleTurn(env, ['--refresh', '--finalize', '--session', 'test-session']);
    state = readBattleState(battleStatePath);
    assert.equal(state.battleState.phase, 'select_action');
  });

  it('finalize clears animation state and lastHit', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t);

    await runBattleTurnCommand(env, ['--refresh', '--finalize', '--session', 'test-session']);
    const state = readBattleState(battleStatePath);

    assert.equal(state.battleState.phase, 'select_action');
    assert.ok(!('animationFrames' in state) || state.animationFrames == null);
    assert.equal(state.currentFrameIndex, null);
    assert.equal(state.lastHit, null);
  });
});

describe('status-line battle animation rendering', { concurrency: false }, () => {
  it('prefers animationFrames[currentFrameIndex] HP over legacy lastHit interpolation', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t, 'same-session');
    const state = readBattleState(battleStatePath);
    const playerMaxHp = state.battleState.player.pokemon[state.battleState.player.activeIndex].maxHp;
    state.currentFrameIndex = 0;
    state.animationFrames = [{ kind: 'drain', durationMs: 800, playerHp: 30 }];
    state.lastHit = {
      target: 'player',
      damage: 40,
      effectiveness: 'super',
      timestamp: Date.now(),
      prevHp: 110,
    };
    writeBattleState(battleStatePath, state);

    const output = await runStatusLine(env);

    assert.match(output, new RegExp(`30/${playerMaxHp}`));
    assert.doesNotMatch(output, new RegExp(`110/${playerMaxHp}`));
  });

  it('drops stale lastHit animation and renders the same steady state as no lastHit', async (t) => {
    const { battleStatePath, env } = await setupAnimatingBattle(t, 'same-session');
    const stateWithStaleHit = readBattleState(battleStatePath);
    delete stateWithStaleHit.animationFrames;
    stateWithStaleHit.currentFrameIndex = null;
    stateWithStaleHit.battleState.phase = 'select_action';
    stateWithStaleHit.lastHit = {
      target: 'player',
      damage: 40,
      effectiveness: 'super',
      timestamp: Date.now() - 10000,
      prevHp: 110,
    };
    writeBattleState(battleStatePath, stateWithStaleHit);

    const staleOutput = await runStatusLine(env);

    const steadyState = readBattleState(battleStatePath);
    delete steadyState.lastHit;
    writeBattleState(battleStatePath, steadyState);

    const baselineOutput = await runStatusLine(env);

    assert.equal(staleOutput, baselineOutput);
  });

  it('suppresses battle UI when the battle-state sessionId does not match the current session', async (t) => {
    const fixture = makeBattleTestEnv(t);
    const normalOutput = await runStatusLine(fixture.env);
    assert.ok(normalOutput.length > 0);
    assert.doesNotMatch(normalOutput, /⚔️/);

    const { battleStatePath } = await setupAnimatingBattle(t, 'stale-session');
    const staleBattleState = readBattleState(battleStatePath);

    writeBattleState(fixture.battleStatePath, {
      ...staleBattleState,
      sessionId: 'stale',
    });

    const guardedOutput = await runStatusLine({ ...fixture.env, CLAUDE_SESSION_ID: 'fresh' });

    assert.equal(guardedOutput, normalOutput);
    assert.doesNotMatch(guardedOutput, /⚔️/);
  });
});
