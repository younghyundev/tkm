import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as http from 'http';
import { join } from 'path';
import { readConfig } from '../core/config.js';
import { getPokemonDB } from '../core/pokemon-data.js';
import { CRIES_DIR, PLUGIN_ROOT } from '../core/paths.js';

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

export function playSound(filePath: string, volume: number): void {
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

  playSound(cryFile, config.volume);

  // Peon-ping integration
  if (config.peon_ping_integration) {
    const req = http.get(`http://localhost:${config.peon_ping_port}/ping`, () => {});
    req.on('error', () => {});
    req.setTimeout(1000, () => req.destroy());
  }
}
