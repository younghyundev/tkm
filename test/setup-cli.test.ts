import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dirname, '../src/cli/tokenmon.ts');
const run = (args: string) => {
  try {
    return execSync(`node --import tsx ${CLI} ${args}`, {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, TOKENMON_TEST: '1' },
    });
  } catch (e: any) {
    return (e.stdout ?? '') + (e.stderr ?? '');
  }
};

describe('setup CLI validation', () => {
  it('shows usage when no flags are given', () => {
    const out = run('setup');
    assert.match(out, /Usage.*tokenmon setup/i);
  });

  it('shows usage when --starter is missing', () => {
    const out = run('setup --gen gen4 --lang ko');
    assert.match(out, /Usage.*tokenmon setup/i);
  });

  it('shows usage when --lang is missing', () => {
    const out = run('setup --gen gen4 --starter 387');
    assert.match(out, /Usage.*tokenmon setup/i);
  });

  it('shows usage when --gen is missing', () => {
    const out = run('setup --lang ko --starter 387');
    assert.match(out, /Usage.*tokenmon setup/i);
  });

  it('errors on invalid language', () => {
    const out = run('setup --gen gen4 --lang fr --starter 387');
    assert.match(out, /invalid language|must be.*en.*ko/i);
  });

  it('errors on invalid generation', () => {
    const out = run('setup --gen gen99 --lang ko --starter 387');
    assert.match(out, /invalid generation/i);
  });
});
