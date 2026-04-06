import { existsSync } from 'fs';
import { join } from 'path';
import { readConfig } from '../core/config.js';
import { PLUGIN_ROOT } from '../core/paths.js';
import { playSound, type RelayConfig } from './play-cry.js';

const SFX_DIR = join(PLUGIN_ROOT, 'sfx');

export type SfxType = 'gacha' | 'levelup' | 'victory' | 'defeat';

/**
 * Play a sound effect. Respects volume and cry_enabled config.
 * Handles missing files gracefully (no crash).
 */
export function playSfx(type: SfxType): void {
  const config = readConfig();
  if (!config.cry_enabled) return;

  const extensions = ['ogg', 'wav', 'mp3'];
  let sfxFile: string | null = null;
  for (const ext of extensions) {
    const candidate = join(SFX_DIR, `${type}.${ext}`);
    if (existsSync(candidate)) {
      sfxFile = candidate;
      break;
    }
  }

  if (!sfxFile) return;

  const relay: RelayConfig | undefined = config.relay_audio
    ? { host: config.relay_host, port: config.peon_ping_port, soundRoot: config.relay_sound_root }
    : undefined;
  playSound(sfxFile, config.volume, relay);
}
