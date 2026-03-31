import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SFX_DIR = join(PROJECT_ROOT, 'sfx');

describe('sfx', () => {
  describe('SFX files exist', () => {
    for (const name of ['gacha', 'levelup', 'victory', 'defeat']) {
      it(`${name}.wav exists`, () => {
        assert.ok(existsSync(join(SFX_DIR, `${name}.wav`)), `Missing sfx/${name}.wav`);
      });
    }
  });

  describe('SFX files are valid WAV', () => {
    for (const name of ['gacha', 'levelup', 'victory', 'defeat']) {
      it(`${name}.wav has RIFF header`, () => {
        const buf = readFileSync(join(SFX_DIR, `${name}.wav`));
        assert.ok(buf.length > 44, 'File too small to be WAV');
        assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
        assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
      });
    }
  });

  describe('CREDITS.md exists', () => {
    it('sfx/CREDITS.md present', () => {
      assert.ok(existsSync(join(SFX_DIR, 'CREDITS.md')));
    });
  });

  describe('play-sfx module', () => {
    it('playSfx handles missing file gracefully', async () => {
      const testDir = join(tmpdir(), `tokenmon-sfx-test-${Date.now()}`);
      process.env.CLAUDE_CONFIG_DIR = testDir;
      mkdirSync(join(testDir, 'tokenmon'), { recursive: true });

      const { playSfx } = await import('../src/audio/play-sfx.js');
      assert.doesNotThrow(() => playSfx('gacha'));

      delete process.env.CLAUDE_CONFIG_DIR;
    });
  });
});
