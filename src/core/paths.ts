import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');

// Data directory resolution: local scope > user scope
// Local scope: {cwd}/.tokenmon/ (project-level data)
// User scope: ~/.claude/tokenmon/ (global data)
function resolveDataDir(): string {
  // If CLAUDE_PLUGIN_DATA is explicitly set and points to a tokenmon path, use it
  const envData = process.env.CLAUDE_PLUGIN_DATA;
  if (envData && envData.includes('tokenmon')) {
    return envData;
  }

  // Check for local scope first (project-level .tokenmon/)
  const localDir = join(process.cwd(), '.tokenmon');
  if (existsSync(localDir)) {
    return localDir;
  }

  // Fall back to user scope
  return join(CLAUDE_DIR, 'tokenmon');
}

export const DATA_DIR = resolveDataDir();
export const STATE_PATH = join(DATA_DIR, 'state.json');
export const CONFIG_PATH = join(DATA_DIR, 'config.json');
export const SESSION_PATH = join(DATA_DIR, 'session.json');

// Plugin root (where the npm package is installed)
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? join(import.meta.dirname, '..', '..');
export const POKEMON_JSON_PATH = join(PLUGIN_ROOT, 'data', 'pokemon.json');
export const ACHIEVEMENTS_JSON_PATH = join(PLUGIN_ROOT, 'data', 'achievements.json');
export const REGIONS_JSON_PATH = join(PLUGIN_ROOT, 'data', 'regions.json');
export const CRIES_DIR = join(PLUGIN_ROOT, 'cries');
export const SPRITES_RAW_DIR = join(PLUGIN_ROOT, 'sprites', 'raw');
export const SPRITES_TERMINAL_DIR = join(PLUGIN_ROOT, 'sprites', 'terminal');
