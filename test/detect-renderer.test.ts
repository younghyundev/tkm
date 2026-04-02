import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectRenderer, formatDetectionChoices } from '../src/core/detect-renderer.js';

describe('detectRenderer', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      TERM: process.env.TERM,
      TERM_PROGRAM: process.env.TERM_PROGRAM,
    };
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('always includes braille in supported', () => {
    const result = detectRenderer({ TERM: 'dumb' });
    assert.ok(result.supported.includes('braille'));
  });

  it('returns braille as recommended for unknown terminal', () => {
    const result = detectRenderer({ TERM: 'dumb', TERM_PROGRAM: '' });
    assert.deepStrictEqual(result.supported, ['braille']);
    assert.equal(result.recommended, 'braille');
  });

  it('detects kitty for xterm-kitty', () => {
    const result = detectRenderer({ TERM: 'xterm-kitty' });
    assert.ok(result.supported.includes('kitty'));
    assert.equal(result.recommended, 'braille');
  });

  it('detects kitty for ghostty', () => {
    const result = detectRenderer({ TERM_PROGRAM: 'ghostty', TERM: 'xterm-256color' });
    assert.ok(result.supported.includes('kitty'));
  });

  it('detects iterm2 for iTerm.app', () => {
    const result = detectRenderer({ TERM_PROGRAM: 'iTerm.app', TERM: 'xterm-256color' });
    assert.ok(result.supported.includes('iterm2'));
    assert.equal(result.recommended, 'braille');
  });

  it('detects kitty, sixel, iterm2 for WezTerm', () => {
    const result = detectRenderer({ TERM_PROGRAM: 'WezTerm', TERM: 'xterm-256color' });
    assert.ok(result.supported.includes('kitty'));
    assert.ok(result.supported.includes('sixel'));
    assert.ok(result.supported.includes('iterm2'));
    assert.equal(result.recommended, 'braille');
  });

  it('detects sixel for mintty', () => {
    const result = detectRenderer({ TERM_PROGRAM: 'mintty', TERM: 'xterm' });
    assert.ok(result.supported.includes('sixel'));
  });

  it('braille is always recommended regardless of supported protocols', () => {
    const result = detectRenderer({ TERM: 'xterm-kitty', TERM_PROGRAM: 'iTerm.app' });
    assert.equal(result.recommended, 'braille');
  });
});

describe('formatDetectionChoices', () => {
  it('marks braille as recommended', () => {
    const result = detectRenderer({ TERM: 'xterm-kitty' });
    const choices = formatDetectionChoices(result);
    const brailleChoice = choices.find(c => c.value === 'braille');
    assert.ok(brailleChoice?.recommended);
    const kittyChoice = choices.find(c => c.value === 'kitty');
    assert.ok(!kittyChoice?.recommended);
  });

  it('returns all supported renderers as choices', () => {
    const result = detectRenderer({ TERM_PROGRAM: 'WezTerm', TERM: 'xterm-256color' });
    const choices = formatDetectionChoices(result);
    assert.equal(choices.length, result.supported.length);
  });
});
