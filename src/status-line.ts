import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readState, readSession } from './core/state.js';
import { readConfig } from './core/config.js';
import { getPokemonDB } from './core/pokemon-data.js';
import { levelToXp, xpToLevel } from './core/xp.js';
import { SPRITES_BRAILLE_DIR, SPRITES_TERMINAL_DIR } from './core/paths.js';
import { formatBattleMessage } from './core/battle.js';
import type { ExpGroup } from './core/types.js';

const TYPE_EMOJI: Record<string, string> = {
  '풀': '🌿', '불꽃': '🔥', '물': '💧', '전기': '⚡', '격투': '🥊',
  '강철': '⚙️', '땅': '🏔️', '노말': '⭐', '비행': '🕊️', '독': '☠️',
  '에스퍼': '🔮', '벌레': '🐛', '바위': '🪨', '고스트': '👻',
  '드래곤': '🐉', '악': '🌑', '얼음': '❄️', '페어리': '✨',
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

function wrapPrint(parts: string[], maxWidth: number): void {
  let currentLine = '';
  for (const part of parts) {
    const test = currentLine ? currentLine + ' | ' + part : part;
    const visibleLen = test.replace(/\x1b\[[^m]*m/g, '').length;
    if (currentLine && visibleLen > maxWidth) {
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

  if (!config.starter_chosen) {
    console.log('[스타터를 선택하세요: tokenmon starter]');
    return;
  }

  if (config.party.length === 0) {
    console.log('[파티가 비어있습니다]');
    return;
  }

  const state = readState();
  const session = readSession();
  const pokemonDB = getPokemonDB();
  const termWidth = process.stdout.columns || 80;
  const spriteMode = config.sprite_mode ?? 'all';
  const infoMode = config.info_mode ?? 'ace_full';

  // Footer
  const regionName = config.current_region ?? '쌍둥이잎 마을';
  const retryTokens = state.items?.retry_token ?? 0;
  const itemInfo = retryTokens > 0 ? ` 🎫 ${retryTokens}` : '';
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

    const spritesPerRow = Math.max(1, Math.floor(termWidth / 21));
    for (let gi = 0; gi < spriteEntries.length; gi += spritesPerRow) {
      const group = spriteEntries.slice(gi, gi + spritesPerRow);
      const maxRows = Math.max(...group.map(s => s.length), 0);
      for (let row = 0; row < maxRows; row++) {
        console.log(group.map(s => s[row] ?? '                    ').join(' '));
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

    let info: string;
    switch (infoMode) {
      case 'all_full':
        info = `${prefix}${p.name} Lv.${p.level} [${bar}] ${pct}%${p.agentLabel}`;
        break;
      case 'name_level':
        info = `${prefix}${p.name} Lv.${p.level}${p.agentLabel}`;
        break;
      case 'ace_level':
        info = isAce
          ? `${prefix}${p.name} Lv.${p.level}${p.agentLabel}`
          : `${prefix}${p.name}${p.agentLabel}`;
        break;
      case 'ace_full':
      default:
        info = isAce
          ? `${prefix}${p.name} Lv.${p.level} [${bar}] ${pct}%${p.agentLabel}`
          : `${prefix}${p.name} Lv.${p.level}${p.agentLabel}`;
        break;
    }
    infoParts.push(info);
  }

  infoParts.push(footer);
  wrapPrint(infoParts, termWidth);
}

main();
