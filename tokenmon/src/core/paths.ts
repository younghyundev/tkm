import { homedir } from 'os';
import { join } from 'path';

export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');

export const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA ?? join(CLAUDE_DIR, 'tokenmon');
export const STATE_PATH = join(DATA_DIR, 'state.json');
export const CONFIG_PATH = join(DATA_DIR, 'config.json');
export const SESSION_PATH = join(DATA_DIR, 'session.json');

// Plugin root (where the npm package is installed)
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? join(import.meta.dirname, '..', '..');
export const POKEMON_JSON_PATH = join(PLUGIN_ROOT, 'data', 'pokemon.json');
export const ACHIEVEMENTS_JSON_PATH = join(PLUGIN_ROOT, 'data', 'achievements.json');
export const CRIES_DIR = join(PLUGIN_ROOT, 'cries');
export const SPRITES_RAW_DIR = join(PLUGIN_ROOT, 'sprites', 'raw');
export const SPRITES_TERMINAL_DIR = join(PLUGIN_ROOT, 'sprites', 'terminal');
