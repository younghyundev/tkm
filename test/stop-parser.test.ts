import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We can't easily test the full stop hook (it reads stdin), but we can
// extract and test the JSONL parser logic directly.
// For now, we re-implement the parser inline to verify the parsing logic.

function parseJsonl(content: string): number {
  let total = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const msg = obj.message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, unknown> | undefined;
      if (usage) {
        total += (usage.input_tokens as number) || 0;
        total += (usage.output_tokens as number) || 0;
        // Must NOT count cache tokens
      }
    } catch {
      // Skip malformed
    }
  }
  return total;
}

describe('JSONL parser', () => {
  it('sums input_tokens + output_tokens', () => {
    const jsonl = [
      JSON.stringify({ message: { usage: { input_tokens: 100, output_tokens: 50 } } }),
      JSON.stringify({ message: { usage: { input_tokens: 200, output_tokens: 75 } } }),
    ].join('\n');

    assert.equal(parseJsonl(jsonl), 425);
  });

  it('excludes cache tokens', () => {
    const jsonl = JSON.stringify({
      message: {
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 300,
        },
      },
    });

    assert.equal(parseJsonl(jsonl), 150, 'should only count input + output, not cache');
  });

  it('skips lines without usage', () => {
    const jsonl = [
      JSON.stringify({ type: 'metadata', session_id: 'abc' }),
      JSON.stringify({ message: { usage: { input_tokens: 100, output_tokens: 50 } } }),
      JSON.stringify({ message: { content: 'hello' } }),
    ].join('\n');

    assert.equal(parseJsonl(jsonl), 150);
  });

  it('skips malformed lines', () => {
    const jsonl = [
      'not json at all',
      JSON.stringify({ message: { usage: { input_tokens: 100, output_tokens: 50 } } }),
      '{broken json',
    ].join('\n');

    assert.equal(parseJsonl(jsonl), 150);
  });

  it('handles empty input', () => {
    assert.equal(parseJsonl(''), 0);
  });

  it('handles missing fields gracefully', () => {
    const jsonl = JSON.stringify({ message: { usage: { input_tokens: 100 } } });
    assert.equal(parseJsonl(jsonl), 100, 'missing output_tokens treated as 0');
  });
});

describe('delta tracking logic', () => {
  it('computes correct delta', () => {
    const totalTokens = 5000;
    const prevSessionTokens = 3000;
    const delta = totalTokens - prevSessionTokens;
    assert.equal(delta, 2000);
  });

  it('delta <= 0 means no XP awarded', () => {
    const totalTokens = 3000;
    const prevSessionTokens = 3000;
    const delta = totalTokens - prevSessionTokens;
    assert.ok(delta <= 0);
  });

  it('XP distribution: total / partySize', () => {
    const deltaTokens = 2000;
    const tokensPerXp = 100;
    const xpBonus = 1.0;
    const partySize = 2;
    const xpTotal = Math.floor((deltaTokens / tokensPerXp) * xpBonus);
    const xpPerPokemon = Math.max(1, Math.floor(xpTotal / partySize));
    assert.equal(xpTotal, 20);
    assert.equal(xpPerPokemon, 10);
  });

  it('XP bonus multiplier applies correctly', () => {
    const deltaTokens = 1000;
    const tokensPerXp = 100;
    const xpBonus = 1.2; // 20% bonus from ten_sessions
    const xpTotal = Math.floor((deltaTokens / tokensPerXp) * xpBonus);
    assert.equal(xpTotal, 12);
  });

  it('minimum 1 XP per pokemon', () => {
    const xpTotal = 1;
    const partySize = 6;
    const xpPerPokemon = Math.max(1, Math.floor(xpTotal / partySize));
    assert.equal(xpPerPokemon, 1);
  });
});
