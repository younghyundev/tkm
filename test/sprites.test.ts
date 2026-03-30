import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { textFallback } from '../src/sprites/convert.js';

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
});
