import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultConfig } from '../src/core/config.js';

describe('config renderer field', () => {
  it('default config includes renderer: braille', () => {
    const config = getDefaultConfig();
    assert.equal(config.renderer, 'braille');
  });

  it('SpriteRenderer type accepts all valid values', () => {
    const valid: Array<import('../src/core/types.js').SpriteRenderer> = [
      'kitty', 'sixel', 'iterm2', 'braille',
    ];
    assert.equal(valid.length, 4);
  });
});
