import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determineTier } from '../src/core/layout.js';

// SPRITE_COL_WIDTH = 21 (braille = 1-wide per Unicode EAW:N)
// Tier 1: floor(termWidth/21) >= partySize → 6 party needs 126+ cols
// Tier 2: floor(termWidth/21) >= 3 → 63+ cols
// Tier 3: floor(termWidth/21) >= 1 → 21+ cols
// Tier 4: < 21 cols

describe('determineTier', () => {
  describe('sprite_mode=all', () => {
    it('tier 1: wide terminal (termWidth=140, party=6)', () => {
      assert.equal(determineTier(140, 6, 'all'), 1);
    });

    it('tier 1: exact boundary (termWidth=126, party=6 — floor(126/21)=6)', () => {
      assert.equal(determineTier(126, 6, 'all'), 1);
    });

    it('tier 2: just below tier 1 (termWidth=125, party=6)', () => {
      assert.equal(determineTier(125, 6, 'all'), 2);
    });

    it('tier 2: standard 80-col (floor(80/21)=3)', () => {
      assert.equal(determineTier(80, 6, 'all'), 2);
    });

    it('tier 2: exact boundary (termWidth=63 — floor(63/21)=3)', () => {
      assert.equal(determineTier(63, 6, 'all'), 2);
    });

    it('tier 3: just below tier 2 (termWidth=62)', () => {
      assert.equal(determineTier(62, 6, 'all'), 3);
    });

    it('tier 3: narrow terminal (termWidth=40, floor(40/21)=1)', () => {
      assert.equal(determineTier(40, 6, 'all'), 3);
    });

    it('tier 3: exact boundary (termWidth=21)', () => {
      assert.equal(determineTier(21, 6, 'all'), 3);
    });

    it('tier 4: below sprite width (termWidth=20)', () => {
      assert.equal(determineTier(20, 6, 'all'), 4);
    });

    it('tier 4: very narrow (termWidth=10)', () => {
      assert.equal(determineTier(10, 6, 'all'), 4);
    });

    it('tier 4: zero width (piped output)', () => {
      assert.equal(determineTier(0, 6, 'all'), 4);
    });
  });

  describe('small party', () => {
    it('tier 1: single pokemon (termWidth=25, party=1)', () => {
      assert.equal(determineTier(25, 1, 'all'), 1);
    });

    it('tier 1: 3 pokemon in 80-col (floor(80/21)=3 >= 3)', () => {
      assert.equal(determineTier(80, 3, 'all'), 1);
    });

    it('tier 2: 4 pokemon in 80-col (floor(80/21)=3 < 4)', () => {
      assert.equal(determineTier(80, 4, 'all'), 2);
    });
  });

  describe('sprite_mode=ace_only', () => {
    it('tier 3: wide terminal still capped', () => {
      assert.equal(determineTier(200, 6, 'ace_only'), 3);
    });

    it('tier 3: standard terminal', () => {
      assert.equal(determineTier(80, 6, 'ace_only'), 3);
    });

    it('tier 4: below sprite width', () => {
      assert.equal(determineTier(15, 6, 'ace_only'), 4);
    });
  });

  describe('sprite_mode=emoji_all', () => {
    it('tier 4: always, regardless of width', () => {
      assert.equal(determineTier(200, 6, 'emoji_all'), 4);
    });

    it('tier 4: narrow too', () => {
      assert.equal(determineTier(20, 6, 'emoji_all'), 4);
    });
  });

  describe('sprite_mode=emoji_ace', () => {
    it('tier 4: always, regardless of width', () => {
      assert.equal(determineTier(200, 6, 'emoji_ace'), 4);
    });
  });

  describe('edge cases', () => {
    it('tier 4: partySize=0', () => {
      assert.equal(determineTier(200, 0, 'all'), 4);
    });

    it('tier 4: negative termWidth', () => {
      assert.equal(determineTier(-1, 6, 'all'), 4);
    });

    it('tier 4: NaN termWidth', () => {
      assert.equal(determineTier(NaN, 6, 'all'), 4);
    });

    it('tier 4: Infinity termWidth', () => {
      assert.equal(determineTier(Infinity, 6, 'all'), 4);
    });

    it('tier 4: single pokemon below sprite width', () => {
      assert.equal(determineTier(15, 1, 'all'), 4);
    });
  });
});
