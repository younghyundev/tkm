import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');

// Data is always stored in ~/.claude/tokenmon/ regardless of install scope.
// This prevents data splits between local-scope and user-scope installs.
export const DATA_DIR = join(CLAUDE_DIR, 'tokenmon');
export const STATE_PATH = join(DATA_DIR, 'state.json');
export const CONFIG_PATH = join(DATA_DIR, 'config.json');
export const SESSION_PATH = join(DATA_DIR, 'session.json');
export const LOCK_PATH = join(DATA_DIR, 'tokenmon.lock');

// Plugin root (where the npm package is installed)
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? join(import.meta.dirname, '..', '..');
export const POKEMON_JSON_PATH = join(PLUGIN_ROOT, 'data', 'pokemon.json');
export const ACHIEVEMENTS_JSON_PATH = join(PLUGIN_ROOT, 'data', 'achievements.json');
export const REGIONS_JSON_PATH = join(PLUGIN_ROOT, 'data', 'regions.json');
export const EVENTS_JSON_PATH = join(PLUGIN_ROOT, 'data', 'events.json');
export const CRIES_DIR = join(PLUGIN_ROOT, 'cries');
export const SPRITES_RAW_DIR = join(PLUGIN_ROOT, 'sprites', 'raw');
export const SPRITES_TERMINAL_DIR = join(PLUGIN_ROOT, 'sprites', 'terminal');
export const SPRITES_BRAILLE_DIR = join(PLUGIN_ROOT, 'sprites', 'braille');
export const I18N_DATA_DIR = join(PLUGIN_ROOT, 'data', 'i18n');
export const SPRITES_KITTY_DIR = join(PLUGIN_ROOT, 'sprites', 'kitty');
export const SPRITES_SIXEL_DIR = join(PLUGIN_ROOT, 'sprites', 'sixel');
export const SPRITES_ITERM2_DIR = join(PLUGIN_ROOT, 'sprites', 'iterm2');
