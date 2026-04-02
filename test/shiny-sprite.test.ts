import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToHsl,
  hslToRgb,
  ansi256ToRgb,
  rgbToAnsi256,
  shiftAnsiHue,
  hueShiftPng,
  SHINY_HUE_SHIFT,
} from '../src/sprites/shiny.js';

describe('sprites/shiny', () => {
  // -------------------------------------------------------
  // 1. rgbToHsl / hslToRgb round-trip
  // -------------------------------------------------------
  describe('rgbToHsl / hslToRgb round-trip', () => {
    const testCases: [number, number, number][] = [
      [255, 0, 0],       // pure red
      [0, 255, 0],       // pure green
      [0, 0, 255],       // pure blue
      [255, 255, 0],     // yellow
      [0, 255, 255],     // cyan
      [255, 0, 255],     // magenta
      [255, 255, 255],   // white
      [0, 0, 0],         // black
      [128, 128, 128],   // gray
      [100, 200, 50],    // arbitrary color
      [37, 142, 219],    // another arbitrary color
      [210, 105, 30],    // chocolate
    ];

    for (const [r, g, b] of testCases) {
      it(`round-trip for RGB(${r}, ${g}, ${b})`, () => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const [rr, rg, rb] = hslToRgb(h, s, l);
        assert.ok(Math.abs(rr - r) <= 1, `R: expected ~${r}, got ${rr}`);
        assert.ok(Math.abs(rg - g) <= 1, `G: expected ~${g}, got ${rg}`);
        assert.ok(Math.abs(rb - b) <= 1, `B: expected ~${b}, got ${rb}`);
      });
    }
  });

  // -------------------------------------------------------
  // 2. shiftAnsiHue preserves non-ANSI text
  // -------------------------------------------------------
  describe('shiftAnsiHue structure preservation', () => {
    it('does not modify plain text without ANSI codes', () => {
      const plain = 'Hello, world! This is plain text. 12345 #$%';
      assert.equal(shiftAnsiHue(plain), plain);
    });

    it('does not modify reset sequences', () => {
      const text = '\x1b[0m';
      assert.equal(shiftAnsiHue(text), text);
    });

    it('preserves text around ANSI codes', () => {
      const text = 'before\x1b[38;5;196mcolored\x1b[0mafter';
      const shifted = shiftAnsiHue(text);
      assert.ok(shifted.startsWith('before'), 'text before ANSI code preserved');
      assert.ok(shifted.includes('colored'), 'text content preserved');
      assert.ok(shifted.endsWith('after'), 'text after ANSI code preserved');
    });

    it('preserves braille characters', () => {
      const braille = '\u2800\u2801\u2802\u2803';
      const text = `\x1b[38;5;196m${braille}\x1b[0m`;
      const shifted = shiftAnsiHue(text);
      assert.ok(shifted.includes(braille), 'braille characters preserved');
    });
  });

  // -------------------------------------------------------
  // 3. shiftAnsiHue color change
  // -------------------------------------------------------
  describe('shiftAnsiHue color shift', () => {
    it('shifts foreground ANSI 256 codes', () => {
      // Code 196 = bright red in 6x6x6 cube
      const text = '\x1b[38;5;196mhello\x1b[0m';
      const shifted = shiftAnsiHue(text);
      // The code should change
      assert.notEqual(shifted, text, 'color code should be shifted');
      // Still has the same ANSI structure
      assert.ok(/\x1b\[38;5;\d+m/.test(shifted), 'foreground escape format preserved');
    });

    it('shifts background ANSI 256 codes', () => {
      const text = '\x1b[48;5;21mworld\x1b[0m';
      const shifted = shiftAnsiHue(text);
      assert.notEqual(shifted, text, 'background code should be shifted');
      assert.ok(/\x1b\[48;5;\d+m/.test(shifted), 'background escape format preserved');
    });

    it('shifts both fg and bg in a single string', () => {
      const text = '\x1b[38;5;196m\x1b[48;5;21mtest\x1b[0m';
      const shifted = shiftAnsiHue(text);
      // Both should have been replaced
      const fgMatch = shifted.match(/\x1b\[38;5;(\d+)m/);
      const bgMatch = shifted.match(/\x1b\[48;5;(\d+)m/);
      assert.ok(fgMatch, 'fg code present');
      assert.ok(bgMatch, 'bg code present');
      assert.notEqual(fgMatch![1], '196', 'fg code should differ from original');
      assert.notEqual(bgMatch![1], '21', 'bg code should differ from original');
    });

    it('360-degree shift produces same codes', () => {
      const text = '\x1b[38;5;196mhello\x1b[48;5;82mworld\x1b[0m';
      const shifted = shiftAnsiHue(text, 360);
      assert.equal(shifted, text, '360-degree shift should be identity');
    });

    it('0-degree shift produces same codes', () => {
      const text = '\x1b[38;5;196mhello\x1b[48;5;82mworld\x1b[0m';
      const shifted = shiftAnsiHue(text, 0);
      assert.equal(shifted, text, '0-degree shift should be identity');
    });
  });

  // -------------------------------------------------------
  // 4. hueShiftPng 360 degrees = original
  // -------------------------------------------------------
  describe('hueShiftPng', () => {
    it('360-degree shift produces identical pixels', async () => {
      let PNG: typeof import('pngjs').PNG;
      try {
        PNG = (await import('pngjs')).PNG;
      } catch {
        return; // pngjs not available, skip
      }

      // Create a 4x4 PNG with various colors
      const img = new PNG({ width: 4, height: 4 });
      const colors: [number, number, number, number][] = [
        [255, 0, 0, 255],     // red
        [0, 255, 0, 255],     // green
        [0, 0, 255, 255],     // blue
        [255, 255, 0, 255],   // yellow
        [255, 0, 255, 255],   // magenta
        [0, 255, 255, 255],   // cyan
        [128, 64, 32, 255],   // brown
        [200, 100, 150, 255], // pink
        [0, 0, 0, 255],       // black
        [255, 255, 255, 255], // white
        [128, 128, 128, 255], // gray
        [50, 100, 200, 255],  // arbitrary
        [0, 0, 0, 0],         // transparent
        [255, 0, 0, 64],      // semi-transparent (below 128 threshold)
        [100, 200, 50, 255],  // lime-ish
        [210, 105, 30, 255],  // chocolate
      ];

      for (let i = 0; i < 16; i++) {
        const [r, g, b, a] = colors[i];
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = a;
      }

      const originalBuf = PNG.sync.write(img);
      const shiftedBuf = hueShiftPng(originalBuf, 360);
      const shiftedImg = PNG.sync.read(shiftedBuf);

      for (let i = 0; i < 16; i++) {
        const oR = img.data[i * 4];
        const oG = img.data[i * 4 + 1];
        const oB = img.data[i * 4 + 2];
        const oA = img.data[i * 4 + 3];
        const sR = shiftedImg.data[i * 4];
        const sG = shiftedImg.data[i * 4 + 1];
        const sB = shiftedImg.data[i * 4 + 2];
        const sA = shiftedImg.data[i * 4 + 3];

        assert.equal(sA, oA, `pixel ${i}: alpha unchanged`);
        if (oA < 128) {
          // Transparent pixels should be untouched
          assert.equal(sR, oR, `pixel ${i}: transparent R unchanged`);
          assert.equal(sG, oG, `pixel ${i}: transparent G unchanged`);
          assert.equal(sB, oB, `pixel ${i}: transparent B unchanged`);
        } else {
          assert.ok(Math.abs(sR - oR) <= 1, `pixel ${i}: R expected ~${oR}, got ${sR}`);
          assert.ok(Math.abs(sG - oG) <= 1, `pixel ${i}: G expected ~${oG}, got ${sG}`);
          assert.ok(Math.abs(sB - oB) <= 1, `pixel ${i}: B expected ~${oB}, got ${sB}`);
        }
      }
    });

    // -------------------------------------------------------
    // 5. hueShiftPng 0 degrees = unchanged
    // -------------------------------------------------------
    it('0-degree shift produces identical pixels', async () => {
      let PNG: typeof import('pngjs').PNG;
      try {
        PNG = (await import('pngjs')).PNG;
      } catch {
        return; // pngjs not available, skip
      }

      // Create a 2x2 PNG
      const img = new PNG({ width: 2, height: 2 });
      const colors: [number, number, number, number][] = [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
        [128, 128, 128, 255],
      ];

      for (let i = 0; i < 4; i++) {
        const [r, g, b, a] = colors[i];
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = a;
      }

      const originalBuf = PNG.sync.write(img);
      const shiftedBuf = hueShiftPng(originalBuf, 0);
      const shiftedImg = PNG.sync.read(shiftedBuf);

      for (let i = 0; i < 4; i++) {
        const oR = img.data[i * 4];
        const oG = img.data[i * 4 + 1];
        const oB = img.data[i * 4 + 2];
        const sR = shiftedImg.data[i * 4];
        const sG = shiftedImg.data[i * 4 + 1];
        const sB = shiftedImg.data[i * 4 + 2];

        assert.ok(Math.abs(sR - oR) <= 1, `pixel ${i}: R expected ~${oR}, got ${sR}`);
        assert.ok(Math.abs(sG - oG) <= 1, `pixel ${i}: G expected ~${oG}, got ${sG}`);
        assert.ok(Math.abs(sB - oB) <= 1, `pixel ${i}: B expected ~${oB}, got ${sB}`);
      }
    });

    it('preserves transparent pixels unchanged', async () => {
      let PNG: typeof import('pngjs').PNG;
      try {
        PNG = (await import('pngjs')).PNG;
      } catch {
        return;
      }

      const img = new PNG({ width: 2, height: 1 });
      // Opaque red
      img.data[0] = 255; img.data[1] = 0; img.data[2] = 0; img.data[3] = 255;
      // Fully transparent
      img.data[4] = 50; img.data[5] = 100; img.data[6] = 200; img.data[7] = 0;

      const buf = PNG.sync.write(img);
      const shifted = hueShiftPng(buf, 180);
      const result = PNG.sync.read(shifted);

      // Transparent pixel should be completely untouched
      assert.equal(result.data[4], 50, 'transparent pixel R unchanged');
      assert.equal(result.data[5], 100, 'transparent pixel G unchanged');
      assert.equal(result.data[6], 200, 'transparent pixel B unchanged');
      assert.equal(result.data[7], 0, 'transparent pixel A unchanged');

      // Opaque pixel should have changed (red -> cyan-ish with 180 degree shift)
      assert.notEqual(result.data[0], 255, 'opaque pixel R should change');
    });
  });

  // -------------------------------------------------------
  // Additional utility tests
  // -------------------------------------------------------
  describe('ansi256ToRgb / rgbToAnsi256', () => {
    it('round-trips for 6x6x6 cube colors', () => {
      // Test a selection of 6x6x6 cube codes
      for (const code of [16, 21, 46, 82, 124, 196, 201, 226, 231]) {
        const [r, g, b] = ansi256ToRgb(code);
        const result = rgbToAnsi256(r, g, b);
        assert.equal(result, code, `round-trip for code ${code}: got ${result}`);
      }
    });

    it('round-trips for grayscale', () => {
      for (const code of [232, 240, 248, 255]) {
        const [r, g, b] = ansi256ToRgb(code);
        const result = rgbToAnsi256(r, g, b);
        assert.equal(result, code, `grayscale round-trip for code ${code}: got ${result}`);
      }
    });
  });

  describe('SHINY_HUE_SHIFT constant', () => {
    it('equals 180', () => {
      assert.equal(SHINY_HUE_SHIFT, 180);
    });
  });
});
