import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('plugin-root resolution', () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'tkm-root-test-'));
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  function resolve(env: Record<string, string> = {}): string {
    // Replicates the resolution pattern from skills
    const script = `
      MKT_ROOT=$(ls -d ${tempHome}/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1 | sed 's|/$||')
      CACHE_ROOT=$(ls -d ${tempHome}/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
      P="${env.CLAUDE_PLUGIN_ROOT || ''}"
      P="\${P:-$MKT_ROOT}"
      P="\${P:-$CACHE_ROOT}"
      echo "$P"
    `;
    return execSync(`bash -c '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf-8' }).trim();
  }

  function mkInstall(path: string): void {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), '{"name":"tkm","version":"0.2.2"}');
  }

  it('prefers CLAUDE_PLUGIN_ROOT when set', () => {
    const explicit = join(tempHome, 'explicit');
    mkInstall(explicit);
    mkInstall(join(tempHome, '.claude/plugins/marketplaces/tkm'));
    assert.equal(resolve({ CLAUDE_PLUGIN_ROOT: explicit }), explicit);
  });

  it('uses marketplace when no env var', () => {
    const mkt = join(tempHome, '.claude/plugins/marketplaces/tkm');
    mkInstall(mkt);
    assert.equal(resolve(), mkt);
  });

  it('falls back to cache when no marketplace', () => {
    const cache = join(tempHome, '.claude/plugins/cache/tkm/tkm/0.2.2');
    mkInstall(cache);
    const result = resolve();
    assert.ok(result.includes('0.2.2'), `Expected path with 0.2.2, got: ${result}`);
  });

  it('prefers marketplace over cache', () => {
    const mkt = join(tempHome, '.claude/plugins/marketplaces/tkm');
    const cache = join(tempHome, '.claude/plugins/cache/tkm/tkm/0.2.2');
    mkInstall(mkt);
    mkInstall(cache);
    assert.equal(resolve(), mkt);
  });

  it('picks latest cache version when multiple exist', () => {
    mkInstall(join(tempHome, '.claude/plugins/cache/tkm/tkm/0.1.0'));
    mkInstall(join(tempHome, '.claude/plugins/cache/tkm/tkm/0.2.0'));
    mkInstall(join(tempHome, '.claude/plugins/cache/tkm/tkm/0.2.2'));
    const result = resolve();
    assert.ok(result.includes('0.2.2'), `Expected 0.2.2 but got: ${result}`);
  });

  it('returns empty when nothing exists', () => {
    assert.equal(resolve(), '');
  });
});

describe('bakeHookPaths integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tkm-bake-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('replaces template vars in actual hooks.json', () => {
    const hooksDir = join(tempDir, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const template = JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/hooks/stop.ts"' }] }],
      },
    });
    const hooksPath = join(hooksDir, 'hooks.json');
    writeFileSync(hooksPath, template);

    const root = '/test/plugin/root';
    let content = readFileSync(hooksPath, 'utf-8');
    content = content.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, root);
    writeFileSync(hooksPath, content);

    const result = readFileSync(hooksPath, 'utf-8');
    assert.ok(!result.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(result.includes(root));
    const parsed = JSON.parse(result);
    assert.ok(parsed.hooks.Stop[0].hooks[0].command.includes(root));
  });
});
