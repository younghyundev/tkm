import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readState, readSession } from './core/state.js';
import { readConfig } from './core/config.js';
import { getPokemonDB } from './core/pokemon-data.js';
import { levelToXp, xpToLevel } from './core/xp.js';
import { SPRITES_BRAILLE_DIR, SPRITES_TERMINAL_DIR } from './core/paths.js';
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

  // Region + items footer
  const regionName = config.current_region ?? '쌍둥이잎 마을';
  const retryTokens = state.items?.retry_token ?? 0;
  const itemInfo = retryTokens > 0 ? ` 🎫 ${retryTokens}` : '';
  const footer = `📍${regionName}${itemInfo}`;

  // Sprite OFF: single line with emoji
  if (!config.sprite_enabled) {
    const parts: string[] = [];
    for (const pokemonName of config.party) {
      if (!pokemonName) continue;
      const pData = pokemonDB.pokemon[pokemonName];
      const level = state.pokemon[pokemonName]?.level ?? 1;
      const currentXp = state.pokemon[pokemonName]?.xp ?? 0;
      const expGroup: ExpGroup = pData?.exp_group ?? 'medium_fast';
      const { bar, pct } = xpBar(currentXp, level, expGroup);
      const emoji = TYPE_EMOJI[pData?.types?.[0]] ?? '⭐';
      parts.push(`${emoji} ${pokemonName} Lv.${level} [${bar}] ${pct}%`);
    }
    parts.push(footer);
    console.log(parts.join(' | '));
    return;
  }

  // Sprite ON: multi-line braille
  const pokemonParts: Array<{ spriteLines: string[]; infoLine: string }> = [];

  for (const pokemonName of config.party) {
    if (!pokemonName) continue;

    const level = state.pokemon[pokemonName]?.level ?? 1;
    const currentXp = state.pokemon[pokemonName]?.xp ?? 0;
    const pData = pokemonDB.pokemon[pokemonName];
    const pokemonId = pData?.id ?? 0;
    const expGroup: ExpGroup = pData?.exp_group ?? 'medium_fast';

    let spriteLines: string[] = [];
    const brailleFile = join(SPRITES_BRAILLE_DIR, `${pokemonId}.txt`);
    const terminalFile = join(SPRITES_TERMINAL_DIR, `${pokemonId}.txt`);
    const file = existsSync(brailleFile) ? brailleFile : existsSync(terminalFile) ? terminalFile : null;
    if (file) {
      const content = readFileSync(file, 'utf-8');
      spriteLines = content.split('\n').filter(l => l.trim().length > 0);
    }

    const { bar, pct } = xpBar(currentXp, level, expGroup);

    let agentLabel = '';
    const assignment = session.agent_assignments.find(a => a.pokemon === pokemonName);
    if (assignment) {
      agentLabel = ` @${assignment.agent_id.slice(0, 6)}`;
    }

    // First pokemon (ace): XP bar included. Others: name + level only.
    const isAce = pokemonParts.length === 0;
    const infoLine = isAce
      ? `${pokemonName} Lv.${level} [${bar}] ${pct}%${agentLabel}`
      : `${pokemonName} Lv.${level}${agentLabel}`;
    pokemonParts.push({ spriteLines, infoLine });
  }

  // Sprite rows: group pokemon into chunks that fit ~80 chars (each sprite ~20 chars)
  const SPRITES_PER_ROW = 3;
  for (let gi = 0; gi < pokemonParts.length; gi += SPRITES_PER_ROW) {
    const group = pokemonParts.slice(gi, gi + SPRITES_PER_ROW);
    const maxRows = Math.max(...group.map(p => p.spriteLines.length), 0);
    for (let row = 0; row < maxRows; row++) {
      const rowParts: string[] = [];
      for (const p of group) {
        rowParts.push(p.spriteLines[row] ?? '                    ');
      }
      console.log(rowParts.join(' '));
    }
  }

  // Info lines: wrap at ~80 chars
  const MAX_WIDTH = 80;
  const allParts = [...pokemonParts.map(p => p.infoLine), footer];
  let currentLine = '';
  for (const part of allParts) {
    const test = currentLine ? currentLine + ' | ' + part : part;
    const visibleLen = test.replace(/\x1b\[[^m]*m/g, '').length;
    if (currentLine && visibleLen > MAX_WIDTH) {
      console.log(currentLine);
      currentLine = part;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) console.log(currentLine);
}

main();
