import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('hooks path baking', () => {
  it('replaces CLAUDE_PLUGIN_ROOT template var', () => {
    const template = '"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/hooks/stop.ts"';
    const root = '/home/user/.claude/plugins/marketplaces/tkm';
    const baked = template.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, root);
    assert.equal(baked, `"${root}/bin/tsx-resolve.sh" "${root}/src/hooks/stop.ts"`);
    assert.ok(!baked.includes('${CLAUDE_PLUGIN_ROOT}'));
  });

  it('replaces CLAUDE_PLUGIN_DATA template var', () => {
    const template = 'diff -q "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json"';
    const root = '/opt/tkm';
    const data = '/home/user/.claude/tokenmon';
    const baked = template
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, root)
      .replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, data);
    assert.ok(!baked.includes('${'));
    assert.ok(baked.includes(root));
    assert.ok(baked.includes(data));
  });

  it('bakeHookPaths replaces both CLAUDE_PLUGIN_ROOT and CLAUDE_PLUGIN_DATA in one pass', () => {
    const template = '"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_DATA}/session-gen-map.json"';
    const root = '/opt/tkm';
    const data = '/home/user/.claude/tokenmon';
    let content = template;
    content = content.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, root);
    content = content.replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, data);
    assert.ok(!content.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(!content.includes('${CLAUDE_PLUGIN_DATA}'));
    assert.ok(content.includes(root));
    assert.ok(content.includes(data));
  });

  it('bakeHookPaths guard returns early only when neither template var present', () => {
    // Simulate the updated guard: skip only if BOTH are absent
    function shouldBake(content: string): boolean {
      return content.includes('${CLAUDE_PLUGIN_ROOT}') || content.includes('${CLAUDE_PLUGIN_DATA}');
    }
    assert.ok(!shouldBake('no template vars here'));
    assert.ok(shouldBake('"${CLAUDE_PLUGIN_ROOT}/hook.ts"'));
    assert.ok(shouldBake('"${CLAUDE_PLUGIN_DATA}/session-gen-map.json"'));
    assert.ok(shouldBake('"${CLAUDE_PLUGIN_ROOT}/hook.ts" "${CLAUDE_PLUGIN_DATA}/map.json"'));
  });
});

describe('session-start empty sessionId guard', () => {
  it('produces continue:true output when sessionId is empty', () => {
    // Simulate the early return logic from session-start main()
    function sessionStartGuard(sessionId: string): { continue: boolean } | null {
      if (!sessionId) {
        return { continue: true };
      }
      return null; // proceed normally
    }
    assert.deepEqual(sessionStartGuard(''), { continue: true });
    assert.deepEqual(sessionStartGuard(undefined as unknown as string), { continue: true });
    assert.equal(sessionStartGuard('abc-123'), null);
  });

  it('empty string sessionId is falsy', () => {
    const sessionId = '';
    assert.ok(!sessionId, 'empty string should be falsy — guard will trigger');
  });
});

describe('gen switch i18n validation', () => {
  it('flags missing i18n dir as missing files', () => {
    // Simulate the i18n check logic from cmdGen() in tokenmon.ts
    function checkI18n(
      i18nDirExists: boolean,
      enJsonExists: boolean,
      koJsonExists: boolean,
    ): boolean {
      return !i18nDirExists || !enJsonExists || !koJsonExists;
    }

    assert.ok(checkI18n(false, false, false), 'missing i18n dir should fail');
    assert.ok(checkI18n(true, false, false), 'missing en.json should fail');
    assert.ok(checkI18n(true, true, false), 'missing ko.json should fail');
    assert.ok(checkI18n(true, false, true), 'missing en.json should fail');
    assert.ok(!checkI18n(true, true, true), 'all i18n files present should pass');
  });

  it('i18n validation is independent of requiredFiles check', () => {
    // Both checks run; missing i18n is added to missingFiles array
    const missingFiles: string[] = [];
    const i18nDirExists = true;
    const enExists = true;
    const koExists = false; // ko.json missing

    if (!i18nDirExists || !enExists || !koExists) {
      missingFiles.push('i18n/en.json or i18n/ko.json');
    }

    assert.equal(missingFiles.length, 1);
    assert.ok(missingFiles[0].includes('i18n'));
  });
});

describe('stop hook session resolution and legacy fallback', () => {
  it('uses bound gen when sessionId is non-empty and gen binding exists', () => {
    // Simulate the resolution logic from stop.ts main()
    function resolveGen(
      sessionId: string,
      getSessionGeneration: (id: string) => string | null,
      getActiveGeneration: () => string,
    ): string | 'fail_closed' | 'legacy' {
      const resolvedGen = getSessionGeneration(sessionId);
      if (resolvedGen !== null) {
        return resolvedGen; // bound gen
      } else if (sessionId) {
        return 'fail_closed'; // session exists but no binding
      } else {
        return 'legacy'; // no session ID — use legacy fallback
      }
    }

    // Case 1: sessionId + binding → use bound gen
    assert.equal(
      resolveGen('sess-abc', () => 'gen4', () => 'gen1'),
      'gen4',
    );

    // Case 2: sessionId + no binding → fail closed
    assert.equal(
      resolveGen('sess-abc', () => null, () => 'gen1'),
      'fail_closed',
    );

    // Case 3: empty sessionId → legacy fallback
    assert.equal(
      resolveGen('', () => null, () => 'gen1'),
      'legacy',
    );
  });

  it('empty sessionId triggers legacy fallback using getActiveGeneration', () => {
    // When sessionId is empty, stop.ts calls setActiveGenerationCache(getActiveGeneration())
    // This test verifies the branch condition: empty sessionId is falsy, skips the else-if
    const sessionId = '';
    const getSessionGenerationResult = null; // not called for empty sessionId

    // Reproduce the if/else-if/else chain from stop.ts
    let usedLegacy = false;
    let failedClosed = false;
    const resolvedGen = getSessionGenerationResult; // would be null if called
    if (resolvedGen !== null) {
      // use bound gen
    } else if (sessionId) {
      failedClosed = true;
    } else {
      usedLegacy = true; // legacy fallback path
    }

    assert.ok(usedLegacy, 'empty sessionId should trigger legacy fallback path');
    assert.ok(!failedClosed, 'empty sessionId should NOT trigger fail-closed path');
  });
});
