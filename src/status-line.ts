import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readState, readSession } from './core/state.js';
import { readConfig } from './core/config.js';
import { getPokemonDB, getPokemonName, getRegionName } from './core/pokemon-data.js';
import { levelToXp, xpToLevel } from './core/xp.js';
import { SPRITES_BRAILLE_DIR, SPRITES_TERMINAL_DIR } from './core/paths.js';
import { formatBattleMessage } from './core/battle.js';
import { t, initLocale } from './i18n/index.js';
import type { ExpGroup } from './core/types.js';

const TYPE_EMOJI: Record<string, string> = {
  'grass': '🌿', 'fire': '🔥', 'water': '💧', 'electric': '⚡', 'fighting': '🥊',
  'steel': '⚙️', 'ground': '🏔️', 'normal': '⭐', 'flying': '🕊️', 'poison': '☠️',
  'psychic': '🔮', 'bug': '🐛', 'rock': '🪨', 'ghost': '👻',
  'dragon': '🐉', 'dark': '🌑', 'ice': '❄️', 'fairy': '✨',
};

function xpBar(currentXp: number, level: number, group: ExpGroup, blocks: number = 6): { bar: string; pct: number } {
  const currLvlXp = levelToXp(level, group);
  const nextLvlXp = levelToXp(level + 1, group);
  const xpInLevel = Math.max(0, currentXp - currLvlXp);
  const xpNeeded = Math.max(1, nextLvlXp - currLvlXp);
  const pct = Math.min(100, Math.floor(xpInLevel / xpNeeded * 100));
  const filled = Math.min(blocks, Math.floor(xpInLevel / xpNeeded * blocks));
  const empty = blocks - filled;
  return { bar: '█'.repeat(filled) + '░'.repeat(empty), pct };
}

function getEmoji(types: string[]): string {
  return TYPE_EMOJI[types?.[0]] ?? '⭐';
}

function loadSprite(pokemonId: number): string[] {
  const brailleFile = join(SPRITES_BRAILLE_DIR, `${pokemonId}.txt`);
  const terminalFile = join(SPRITES_TERMINAL_DIR, `${pokemonId}.txt`);
  const file = existsSync(brailleFile) ? brailleFile : existsSync(terminalFile) ? terminalFile : null;
  if (!file) return [];
  return readFileSync(file, 'utf-8').split('\n').filter(l => l.trim().length > 0);
}

function visibleLength(s: string): number {
  // Strip ANSI escape codes, then count characters
  // Unicode braille/CJK characters may be double-width in some terminals
  const stripped = s.replace(/\x1b\[[^m]*m/g, '');
  let len = 0;
  for (const ch of stripped) {
    const cp = ch.codePointAt(0) ?? 0;
    // CJK, braille, and fullwidth characters take 2 columns
    if (
      (cp >= 0x2800 && cp <= 0x28FF) || // Braille
      (cp >= 0x1100 && cp <= 0x115F) || // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0x9FFF) || // CJK
      (cp >= 0xAC00 && cp <= 0xD7AF) || // Hangul Syllables
      (cp >= 0xF900 && cp <= 0xFAFF) || // CJK Compatibility
      (cp >= 0xFE10 && cp <= 0xFE6F) || // CJK Forms
      (cp >= 0xFF01 && cp <= 0xFF60) || // Fullwidth
      (cp >= 0xFFE0 && cp <= 0xFFE6) || // Fullwidth
      (cp >= 0x20000 && cp <= 0x2FA1F)   // CJK Extension
    ) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
}

function wrapPrint(parts: string[], maxWidth: number): void {
  // Try single line first
  const singleLine = parts.join(' | ');
  if (visibleLength(singleLine) <= maxWidth) {
    console.log(singleLine);
    return;
  }

  // Wrap: greedy line packing
  let currentLine = '';
  for (const part of parts) {
    const test = currentLine ? currentLine + ' | ' + part : part;
    if (currentLine && visibleLength(test) > maxWidth) {
      console.log(currentLine);
      currentLine = part;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) console.log(currentLine);
}

function main(): void {
  const config = readConfig();
  initLocale(config.language ?? 'en');

  if (!config.starter_chosen) {
    console.log(t('statusline.no_starter'));
    return;
  }

  if (config.party.length === 0) {
    console.log(t('statusline.party_empty'));
    return;
  }

  const state = readState();
  const session = readSession();
  const pokemonDB = getPokemonDB();
  const termWidth = process.stdout.columns || 80;
  const spriteMode = config.sprite_mode ?? 'all';
  const infoMode = config.info_mode ?? 'ace_full';

  // Footer
  const regionName = getRegionName(config.current_region ?? '1');
  const pokeballs = state.items?.pokeball ?? 0;
  const itemInfo = pokeballs > 0 ? ` 🔴 ${pokeballs}` : '';
  const footer = `📍${regionName}${itemInfo}`;

  // Build per-pokemon data
  const pokeData: Array<{
    name: string; level: number; xp: number; expGroup: ExpGroup;
    pokemonId: number; types: string[]; agentLabel: string;
  }> = [];

  for (const pokemonName of config.party) {
    if (!pokemonName) continue;
    const pData = pokemonDB.pokemon[pokemonName];
    const assignment = session.agent_assignments.find(a => a.pokemon === pokemonName);
    pokeData.push({
      name: pokemonName,
      level: state.pokemon[pokemonName]?.level ?? 1,
      xp: state.pokemon[pokemonName]?.xp ?? 0,
      expGroup: pData?.exp_group ?? 'medium_fast',
      pokemonId: pData?.id ?? 0,
      types: pData?.types ?? [],
      agentLabel: assignment ? ` @${assignment.agent_id.slice(0, 6)}` : '',
    });
  }

  // === Sprite rendering ===
  // sprite_mode: 'all' | 'ace_only' | 'emoji_all' | 'emoji_ace'
  const showSprites = spriteMode === 'all' || spriteMode === 'ace_only';

  if (showSprites) {
    const spriteEntries: string[][] = [];
    for (let i = 0; i < pokeData.length; i++) {
      const p = pokeData[i];
      if (spriteMode === 'all' || i === 0) {
        spriteEntries.push(loadSprite(p.pokemonId));
      }
    }

    // Braille: row-by-row grid rendering
    const SPRITE_WIDTH = 20;
    const spritesPerRow = Math.max(1, Math.floor(termWidth / (SPRITE_WIDTH + 1)));
    for (let gi = 0; gi < spriteEntries.length; gi += spritesPerRow) {
      const group = spriteEntries.slice(gi, gi + spritesPerRow);
      const maxRows = Math.max(...group.map(s => s.length), 0);
      for (let row = 0; row < maxRows; row++) {
        console.log(group.map(s => {
          const line = s[row] ?? '';
          const visibleLen = line.replace(/\x1b\[[^m]*m/g, '').length;
          return visibleLen < SPRITE_WIDTH ? line + ' '.repeat(SPRITE_WIDTH - visibleLen) : line;
        }).join(' '));
      }
    }
  }

  // === Battle result / Tip line ===
  if (state.last_battle) {
    const battleMsg = formatBattleMessage(state.last_battle);
    if (battleMsg) console.log(battleMsg);
  } else if (state.last_tip) {
    console.log(state.last_tip.text);
  }

  // === Info line rendering ===
  // info_mode: 'ace_full' | 'name_level' | 'all_full' | 'ace_level'
  const infoParts: string[] = [];

  for (let i = 0; i < pokeData.length; i++) {
    const p = pokeData[i];
    const isAce = i === 0;
    const { bar, pct } = xpBar(p.xp, p.level, p.expGroup);
    const emoji = getEmoji(p.types);

    // Sprite prefix for non-sprite modes
    const prefix = (!showSprites)
      ? (spriteMode === 'emoji_all' || (spriteMode === 'emoji_ace' && isAce)) ? `${emoji} ` : ''
      : '';

    const displayName = getPokemonName(p.name);
    let info: string;
    switch (infoMode) {
      case 'all_full':
        info = `${prefix}${displayName} Lv.${p.level} [${bar}] ${pct}%${p.agentLabel}`;
        break;
      case 'name_level':
        info = `${prefix}${displayName} Lv.${p.level}${p.agentLabel}`;
        break;
      case 'ace_level':
        info = isAce
          ? `${prefix}${displayName} Lv.${p.level}${p.agentLabel}`
          : `${prefix}${displayName}${p.agentLabel}`;
        break;
      case 'ace_full':
      default:
        info = isAce
          ? `${prefix}${displayName} Lv.${p.level} [${bar}] ${pct}%${p.agentLabel}`
          : `${prefix}${displayName} Lv.${p.level}${p.agentLabel}`;
        break;
    }
    infoParts.push(info);
  }

  infoParts.push(footer);
  wrapPrint(infoParts, termWidth);
}

try {
  main();
} catch {
  // Output minimal status on crash to prevent Claude Code from breaking
  console.log('tokenmon: error');
}
