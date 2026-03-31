import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readState, readSession } from './core/state.js';
import { readConfig } from './core/config.js';
import { getPokemonDB } from './core/pokemon-data.js';
import { levelToXp, xpToLevel } from './core/xp.js';
import { SPRITES_TERMINAL_DIR } from './core/paths.js';
import type { ExpGroup } from './core/types.js';

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

  const pokemonParts: Array<{ spriteLines: string[]; infoLine: string }> = [];

  for (const pokemonName of config.party) {
    if (!pokemonName) continue;

    const level = state.pokemon[pokemonName]?.level ?? 1;
    const currentXp = state.pokemon[pokemonName]?.xp ?? 0;
    const pData = pokemonDB.pokemon[pokemonName];
    const pokemonId = pData?.id ?? 0;
    const expGroup: ExpGroup = pData?.exp_group ?? 'medium_fast';

    // Sprite: load terminal sprite lines
    let spriteLines: string[] = [];
    const spriteFile = join(SPRITES_TERMINAL_DIR, `${pokemonId}.txt`);
    if (config.sprite_enabled && existsSync(spriteFile)) {
      const content = readFileSync(spriteFile, 'utf-8');
      spriteLines = content.split('\n').filter(l => l.trim().length > 0);
    }

    const { bar, pct } = xpBar(currentXp, level, expGroup);

    // Agent assignment label
    let agentLabel = '';
    const assignment = session.agent_assignments.find(a => a.pokemon === pokemonName);
    if (assignment) {
      agentLabel = ` @${assignment.agent_id.slice(0, 6)}`;
    }

    const infoLine = `${pokemonName} Lv.${level} [${bar}] ${pct}%${agentLabel}`;
    pokemonParts.push({ spriteLines, infoLine });
  }

  // Region + items
  const regionName = config.current_region ?? '쌍둥이잎 마을';
  const retryTokens = state.items?.retry_token ?? 0;
  const itemInfo = retryTokens > 0 ? ` 🎫 ${retryTokens}` : '';
  const footer = `📍${regionName}${itemInfo}`;

  // Multi-line output: sprite rows + info line
  // Line 1-3: sprite (top 3 lines side by side for each pokemon)
  // Line 4: pokemon info + region
  const maxSpriteRows = 3;
  for (let row = 0; row < maxSpriteRows; row++) {
    const rowParts: string[] = [];
    for (const p of pokemonParts) {
      rowParts.push(p.spriteLines[row] ?? '                    ');
    }
    console.log(rowParts.join(' '));
  }

  // Info line
  const infoParts = pokemonParts.map(p => p.infoLine);
  infoParts.push(footer);
  console.log(infoParts.join(' | '));
}

main();
