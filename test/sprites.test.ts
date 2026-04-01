import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { textFallback } from '../src/sprites/convert.js';
import { generateKitty, generateIterm2, generateSixel } from '../src/sprites/png-protocols.js';

describe('sprites', () => {
  describe('textFallback', () => {
    it('wraps name in brackets', () => {
      const result = textFallback('모부기', 20);
      assert.ok(result.includes('[모부기]'));
    });

    it('centers within width', () => {
      const result = textFallback('A', 10);
      assert.ok(result.startsWith(' '), 'should be padded');
    });
  });

  // convertPng requires pngjs and actual PNG data
  // Testing with a minimal valid PNG
  describe('convertPng', () => {
    it('converts a minimal PNG', async () => {
      let PNG: typeof import('pngjs').PNG;
      try {
        PNG = (await import('pngjs')).PNG;
      } catch {
        // pngjs not available, skip
        return;
      }

      const { convertPng } = await import('../src/sprites/convert.js');

      // Create a tiny 2x2 PNG
      const img = new PNG({ width: 2, height: 2 });
      // Red pixel (0,0)
      img.data[0] = 255; img.data[1] = 0; img.data[2] = 0; img.data[3] = 255;
      // Green pixel (1,0)
      img.data[4] = 0; img.data[5] = 255; img.data[6] = 0; img.data[7] = 255;
      // Blue pixel (0,1)
      img.data[8] = 0; img.data[9] = 0; img.data[10] = 255; img.data[11] = 255;
      // Transparent pixel (1,1)
      img.data[12] = 0; img.data[13] = 0; img.data[14] = 0; img.data[15] = 0;

      const buf = PNG.sync.write(img);
      const result = convertPng(buf, 2);

      // Should produce a single line (2 rows → 1 half-block row)
      assert.ok(result.length > 0, 'should produce output');
      assert.ok(result.includes('▀') || result.includes('▄') || result.includes(' '),
        'should contain half-block chars or spaces');
    });

    it('handles RGBA transparency', async () => {
      let PNG: typeof import('pngjs').PNG;
      try {
        PNG = (await import('pngjs')).PNG;
      } catch {
        return;
      }

      const { convertPng } = await import('../src/sprites/convert.js');

      // Create 2x2 fully transparent PNG
      const img = new PNG({ width: 2, height: 2 });
      for (let i = 0; i < 16; i += 4) {
        img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 0;
      }

      const buf = PNG.sync.write(img);
      const result = convertPng(buf, 2);

      // Fully transparent should produce spaces
      assert.ok(result.includes(' '), 'transparent pixels should be spaces');
    });
  });

  describe('png-protocols', () => {
    const fakePng = Buffer.from('fake-png-data');

    it('generateKitty wraps in APC sequence', () => {
      const result = generateKitty(fakePng);
      assert.ok(result.startsWith('\x1b_G'), 'should start with APC introducer');
      assert.ok(result.endsWith('\x1b\\'), 'should end with ST');
      assert.ok(result.includes('f=100'), 'should specify PNG format');
      assert.ok(result.includes('a=T'), 'should specify transmit+display');
    });

    it('generateKitty chunks large data', () => {
      const largePng = Buffer.alloc(10000, 0x89); // > 4096 chars base64
      const result = generateKitty(largePng);
      assert.ok(result.includes('m=1'), 'multi-chunk should have m=1');
      assert.ok(result.includes('m=0'), 'last chunk should have m=0');
    });

    it('generateIterm2 wraps in OSC 1337', () => {
      const result = generateIterm2(fakePng);
      assert.ok(result.startsWith('\x1b]1337;File='), 'should start with OSC 1337');
      assert.ok(result.includes('inline=1'), 'should be inline');
      assert.ok(result.endsWith('\x1b\\'), 'should end with ST');
      assert.ok(result.includes(`size=${fakePng.length}`), 'should include byte size');
    });

    it('generateSixel encodes a PNG to Sixel format', async () => {
      let PNG: typeof import('pngjs').PNG;
      try {
        PNG = (await import('pngjs')).PNG;
      } catch {
        return; // pngjs not available, skip
      }

      // Create a 2x4 PNG (one full Sixel band height)
      const img = new PNG({ width: 2, height: 4 });
      img.data[0] = 255; img.data[1] = 0;   img.data[2] = 0;   img.data[3] = 255; // red
      img.data[4] = 0;   img.data[5] = 255; img.data[6] = 0;   img.data[7] = 255; // green
      img.data[8] = 0;   img.data[9] = 0;   img.data[10] = 255; img.data[11] = 255; // blue
      img.data[12] = 255; img.data[13] = 255; img.data[14] = 0; img.data[15] = 255; // yellow
      img.data[16] = 128; img.data[17] = 0;  img.data[18] = 128; img.data[19] = 255; // purple
      img.data[20] = 0;   img.data[21] = 128; img.data[22] = 128; img.data[23] = 255; // teal
      img.data[24] = 255; img.data[25] = 128; img.data[26] = 0;  img.data[27] = 255; // orange
      img.data[28] = 0;   img.data[29] = 0;   img.data[30] = 0;  img.data[31] = 255; // black
      const pngBuf = PNG.sync.write(img);

      const result = generateSixel(pngBuf);

      assert.ok(result.startsWith('\x1bPq'), 'should start with DCS introducer');
      assert.ok(result.endsWith('\x1b\\'), 'should end with ST');
      // At least one color definition: #N;2;R;G;B
      assert.ok(/^#\d+;2;\d+;\d+;\d+$/m.test(result), 'should contain palette definitions');
      // Sixel data chars are ASCII 63 ('?') through 126 ('~')
      assert.ok(/[?-~]/.test(result), 'should contain sixel data characters');
    });
  });
});
