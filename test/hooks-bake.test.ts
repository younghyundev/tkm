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
});
