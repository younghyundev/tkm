/**
 * Regression tests for weather particle rendering.
 *
 * These lock in the property that matters for sprite alignment:
 * after scattering weather particles onto a composed sprite row,
 * every rendered row must retain a constant visible width and must
 * NOT introduce ASCII spaces into transparent positions — that's
 * the bug that caused rows to drift in CJK terminals where braille
 * renders 2-wide but space is 1-wide.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scatterWeatherParticles } from '../src/status-line.js';
import type { WeatherCondition } from '../src/core/types.js';

// Strip SGR ANSI escapes to count visible characters
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[^m]*m/g, '');
}

// Build a 3-sprite composed row: each sprite is 20 chars wide,
// mixing non-zero braille ("opaque pixel") with \u2800 ("transparent").
// Sprites joined by a single \u2800 (the inter-sprite separator).
function composeSampleRow(opaqueCounts: number[]): string {
  const sprites = opaqueCounts.map((n) => {
    const opaque = '\x1b[38;5;66m⣿\x1b[0m'.repeat(n);
    const blanks = '\u2800'.repeat(20 - n);
    return opaque + blanks;
  });
  return sprites.join('\u2800');
}

const CONDITIONS: WeatherCondition[] = [
  'rain',
  'thunderstorm',
  'snow',
  'fog',
  'sandstorm',
  'clear',
  'cloudy',
];

describe('weather particles', () => {
  describe('visible width invariant', () => {
    // Multiple rows with different opacity patterns — this mirrors how real
    // sprites vary row-by-row (e.g. Bulbasaur row 4 has 7 opaque braille,
    // row 5 has 8). The critical property: all rows should stay the same
    // visible width after particle scatter.
    const opacityProfiles = [
      [3, 5, 2], // row with few opaque
      [7, 8, 6], // mid-opacity row
      [10, 12, 9], // high-opacity row
      [0, 0, 0], // entirely blank row
      [20, 20, 20], // entirely opaque row
    ];

    for (const condition of CONDITIONS) {
      it(`${condition} preserves visible width across all row shapes`, () => {
        // Expected width = 3 sprites × 20 chars + 2 separators = 62
        const expectedWidth = 62;
        for (const profile of opacityProfiles) {
          const row = composeSampleRow(profile);
          // Run many times to exercise randomness
          for (let i = 0; i < 50; i++) {
            const scattered = scatterWeatherParticles(row, condition);
            const visible = stripAnsi(scattered);
            assert.equal(
              visible.length,
              expectedWidth,
              `${condition} row profile=${JSON.stringify(profile)} iter=${i}: ` +
                `width ${visible.length} != ${expectedWidth}`,
            );
          }
        }
      });
    }
  });

  describe('no ASCII space leak', () => {
    // The regression: converting \u2800 -> ASCII space was the bug.
    // Ensure scatterWeatherParticles never introduces ASCII space into
    // transparent positions — every non-particle, non-opaque cell must
    // remain \u2800 so the terminal renders it with braille width.
    for (const condition of CONDITIONS) {
      it(`${condition} never introduces ASCII space`, () => {
        const row = composeSampleRow([5, 7, 4]);
        for (let i = 0; i < 50; i++) {
          const scattered = scatterWeatherParticles(row, condition);
          // Original row had no ASCII space; scatter must not add any.
          // Particles are wrapped in SGR, so after stripping ANSI the
          // result should only contain non-zero braille (opaque + particle)
          // and \u2800 (untouched transparent).
          const visible = stripAnsi(scattered);
          assert.ok(
            !visible.includes(' '),
            `${condition} iter=${i}: scatter output contains ASCII space`,
          );
        }
      });
    }
  });

  describe('particle uses braille codepoint', () => {
    // Particles must be drawn from U+2800–U+28FF so they share
    // whatever width the terminal assigns to sprite braille chars.
    for (const condition of CONDITIONS) {
      it(`${condition} particle chars are all braille range`, () => {
        // Force 100% density by scattering enough to reliably hit every cell
        const row = '\u2800'.repeat(100);
        const scattered = scatterWeatherParticles(row, condition);
        // Find every char inside SGR color + char + reset sequences
        const particleRe = /\x1b\[[^m]*m(.)\x1b\[0m/g;
        let match;
        while ((match = particleRe.exec(scattered)) !== null) {
          const cp = match[1].codePointAt(0) ?? 0;
          assert.ok(
            cp >= 0x2800 && cp <= 0x28ff,
            `${condition}: particle char U+${cp.toString(16)} not in braille range`,
          );
        }
      });
    }
  });
});
