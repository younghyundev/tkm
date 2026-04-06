import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as http from 'http';
import { join, relative } from 'path';
import { readConfig } from '../core/config.js';
import { getPokemonDB } from '../core/pokemon-data.js';
import { CRIES_DIR, PLUGIN_ROOT } from '../core/paths.js';

export interface RelayConfig {
  host: string;
  port: number;
  /** Symlink name inside PEON_DIR that points to the local tokenmon sounds (e.g. 'tkm-sounds'). */
  soundRoot: string;
}

let _lastRelayWarning = 0;

/**
 * Send a sound-play request to the peon-ping relay.
 * The relay expects a path relative to its PEON_DIR.
 * A symlink `PEON_DIR/<soundRoot>` → local tokenmon dir must exist on the relay host.
 * Calls onError() if the relay request fails (timeout, connection refused, non-2xx).
 */
export function relaySound(
  filePath: string, volume: number, relay: RelayConfig,
  onError?: () => void,
): void {
  // Build relay-relative path: <soundRoot>/<relative-to-PLUGIN_ROOT>
  let relayPath: string;
  if (filePath.startsWith(PLUGIN_ROOT)) {
    const rel = relative(PLUGIN_ROOT, filePath);
    relayPath = relay.soundRoot ? `${relay.soundRoot}/${rel}` : rel;
  } else {
    // Prefix mismatch — send relative portion as best-effort
    relayPath = relay.soundRoot ? `${relay.soundRoot}/${filePath.split('/').pop() ?? ''}` : filePath;
  }

  const warnAndFallback = () => {
    const now = Date.now();
    if (now - _lastRelayWarning > 30_000) {
      _lastRelayWarning = now;
      process.stderr.write(`[tokenmon] relay unreachable (${relay.host}:${relay.port}) — falling back to local audio\n`);
    }
    onError?.();
  };

  const encodedPath = encodeURIComponent(relayPath);
  const req = http.get({
    hostname: relay.host,
    port: relay.port,
    path: `/play?file=${encodedPath}`,
    headers: { 'X-Volume': String(volume) },
  }, (res) => {
    if (res.statusCode && res.statusCode >= 400) {
      warnAndFallback();
    }
    res.resume(); // drain response
  });
  req.on('error', () => warnAndFallback());
  req.setTimeout(2000, () => { req.destroy(); warnAndFallback(); });
}

function isWSL2(): boolean {
  try {
    const version = readFileSync('/proc/version', 'utf-8');
    return /microsoft/i.test(version);
  } catch {
    return false;
  }
}

function findPowerShell(): string | null {
  const candidates = [
    '/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe',
    '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function wslPath(linuxPath: string): string {
  try {
    return execSync(`wslpath -w "${linuxPath}"`, { encoding: 'utf-8' }).trim();
  } catch {
    return linuxPath;
  }
}

export function playSound(filePath: string, volume: number, relay?: RelayConfig): void {
  if (relay) {
    relaySound(filePath, volume, relay, () => {
      // Fallback: attempt local playback on relay failure
      playSound(filePath, volume);
    });
    return;
  }

  if (isWSL2()) {
    const ps = findPowerShell();
    if (ps) {
      const ps1Script = join(PLUGIN_ROOT, 'scripts', 'tokenmon-play.ps1');
      const winFile = wslPath(filePath);
      const winPs1 = wslPath(ps1Script);
      const child = spawn(ps, [
        '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', winPs1, '-FilePath', winFile, '-Volume', String(volume),
      ], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
  }

  // macOS
  if (process.platform === 'darwin') {
    const child = spawn('afplay', ['-v', String(volume), filePath], {
      detached: true, stdio: 'ignore',
    });
    child.unref();
    return;
  }

  // Linux fallback chain (aplay omitted — WAV-only, no OGG support)
  const vol = Math.floor(volume * 100);
  const players = [
    { cmd: 'paplay', args: [`--volume=${Math.floor(volume * 65536)}`, filePath] },
    { cmd: 'ffplay', args: ['-nodisp', '-autoexit', '-volume', String(vol), filePath] },
    { cmd: 'mpv', args: ['--no-video', `--volume=${vol}`, filePath] },
    { cmd: 'cvlc', args: ['--intf', 'dummy', '--play-and-exit', filePath] },
  ];

  for (const { cmd, args } of players) {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    } catch {
      continue;
    }
  }
}

export function playCry(pokemonName?: string): void {
  const config = readConfig();
  if (!config.cry_enabled) return;

  let name = pokemonName;
  if (!name) {
    if (config.party.length === 0) return;
    const idx = Math.floor(Math.random() * config.party.length);
    name = config.party[idx];
  }

  const db = getPokemonDB();
  const pData = db.pokemon[name];
  if (!pData) return;

  // Find cry file
  const extensions = ['wav', 'mp3', 'ogg'];
  let cryFile: string | null = null;
  for (const ext of extensions) {
    const candidate = join(CRIES_DIR, `${pData.id}.${ext}`);
    if (existsSync(candidate)) {
      cryFile = candidate;
      break;
    }
  }

  if (!cryFile) return;

  const relay = config.relay_audio
    ? { host: config.relay_host, port: config.peon_ping_port, soundRoot: config.relay_sound_root }
    : undefined;
  playSound(cryFile, config.volume, relay);

  // Peon-ping integration
  if (config.peon_ping_integration) {
    const req = http.get(`http://localhost:${config.peon_ping_port}/ping`, () => {});
    req.on('error', () => {});
    req.setTimeout(1000, () => req.destroy());
  }
}
