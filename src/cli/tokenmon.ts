#!/usr/bin/env -S npx tsx
import * as readline from 'readline';
import { readFileSync } from 'fs';
import { readState, writeState } from '../core/state.js';
import { readConfig, writeConfig } from '../core/config.js';
import { getPokemonDB, getAchievementsDB } from '../core/pokemon-data.js';
import { levelToXp } from '../core/xp.js';
import { playCry } from '../audio/play-cry.js';
import type { ExpGroup } from '../core/types.js';

// ANSI color helpers
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';

const info = (s: string) => console.log(`${CYAN}${s}${RESET}`);
const success = (s: string) => console.log(`${GREEN}${s}${RESET}`);
const warn = (s: string) => console.log(`${YELLOW}${s}${RESET}`);
const error = (s: string) => console.error(`${RED}${s}${RESET}`);
const bold = (s: string) => console.log(`${BOLD}${s}${RESET}`);

function xpBar(currentXp: number, level: number, group: ExpGroup, blocks: number = 10): string {
  const currLvlXp = levelToXp(level, group);
  const nextLvlXp = levelToXp(level + 1, group);
  const xpInLevel = Math.max(0, currentXp - currLvlXp);
  const xpNeeded = Math.max(1, nextLvlXp - currLvlXp);
  const filled = Math.min(blocks, Math.floor(xpInLevel / xpNeeded * blocks));
  const empty = blocks - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function cmdStatus(): void {
  const config = readConfig();
  const state = readState();
  const pokemonDB = getPokemonDB();

  bold('=== 토큰몬 상태 ===');
  console.log('');

  if (!config.starter_chosen) {
    warn('스타터 포켓몬을 선택하지 않았습니다.');
    info('  tokenmon starter  명령으로 스타터를 선택하세요.');
    console.log('');
  }

  bold('[ 파티 ]');
  if (config.party.length === 0) {
    warn('  파티가 비어있습니다.');
  } else {
    for (const pokemon of config.party) {
      const level = state.pokemon[pokemon]?.level ?? 1;
      const xp = state.pokemon[pokemon]?.xp ?? 0;
      const pData = pokemonDB.pokemon[pokemon];
      const pokemonId = pData?.id ?? 0;
      const types = pData?.types?.join('/') ?? '';
      const evolvesAt = pData?.evolves_at;
      const expGroup: ExpGroup = pData?.exp_group ?? 'medium_fast';
      const bar = xpBar(xp, level, expGroup);
      const evolInfo = evolvesAt != null ? ` (Lv.${evolvesAt}에서 진화)` : '';

      console.log(`  ${BOLD}${pokemon}${RESET} [#${pokemonId}] ${GRAY}${types}${RESET}`);
      console.log(`  Lv.${level} [${GREEN}${bar}${RESET}] XP: ${xp}${evolInfo}`);
    }
  }

  console.log('');
  bold('[ 통계 ]');
  console.log(`  세션 수: ${state.session_count}`);
  console.log(`  총 토큰: ${formatNumber(state.total_tokens_consumed)}`);
  console.log(`  에러 수: ${state.error_count}`);
  console.log(`  권한 승인: ${state.permission_count}`);
  console.log(`  진화 횟수: ${state.evolution_count}`);
}

function cmdStarter(): void {
  const config = readConfig();
  const state = readState();
  const pokemonDB = getPokemonDB();

  if (config.starter_chosen) {
    warn('이미 스타터를 선택했습니다.');
    info(`현재 파티: ${config.party.join(', ')}`);
    return;
  }

  bold('스타터 포켓몬을 선택하세요:');
  console.log('');

  const starters = pokemonDB.starters;
  for (let i = 0; i < starters.length; i++) {
    const s = starters[i];
    const pData = pokemonDB.pokemon[s];
    const types = pData?.types?.join('/') ?? '';
    const pokemonId = pData?.id ?? '?';
    console.log(`  ${i + 1}) ${BOLD}${s}${RESET} [#${pokemonId}] ${GRAY}${types}${RESET}`);
  }

  console.log('');
  // Read choice from stdin
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`번호를 입력하세요 (1-${starters.length}): `, (answer: string) => {
    rl.close();
    const choice = parseInt(answer, 10);
    if (isNaN(choice) || choice < 1 || choice > starters.length) {
      error('잘못된 선택입니다.');
      process.exit(1);
    }

    const chosen = starters[choice - 1];
    const pData = pokemonDB.pokemon[chosen];

    config.party = [chosen];
    config.starter_chosen = true;
    writeConfig(config);

    if (!state.pokemon[chosen]) {
      state.pokemon[chosen] = { id: pData?.id ?? 0, xp: 0, level: 1 };
    }
    if (!state.unlocked.includes(chosen)) {
      state.unlocked.push(chosen);
    }
    writeState(state);

    success(`✓ ${chosen}을(를) 선택했습니다! 모험을 시작하세요!`);
    playCry(chosen);
  });
}

function cmdParty(subcmd: string, pokemon?: string): void {
  const config = readConfig();
  const state = readState();
  const pokemonDB = getPokemonDB();

  switch (subcmd) {
    case 'add': {
      if (!pokemon) {
        error('사용법: tokenmon party add <포켓몬이름>');
        process.exit(1);
      }
      if (!state.unlocked.includes(pokemon)) {
        error(`${pokemon}은(는) 아직 잠금 해제되지 않았습니다.`);
        info('  tokenmon unlock list  로 잠금 해제된 포켓몬을 확인하세요.');
        process.exit(1);
      }
      if (config.party.length >= config.max_party_size) {
        error(`파티가 가득 찼습니다 (최대 ${config.max_party_size}마리).`);
        process.exit(1);
      }
      if (config.party.includes(pokemon)) {
        warn(`${pokemon}은(는) 이미 파티에 있습니다.`);
        return;
      }
      config.party.push(pokemon);
      writeConfig(config);
      success(`✓ ${pokemon}을(를) 파티에 추가했습니다.`);
      break;
    }
    case 'remove': {
      if (!pokemon) {
        error('사용법: tokenmon party remove <포켓몬이름>');
        process.exit(1);
      }
      if (config.party.length <= 1) {
        error('파티에 최소 1마리는 있어야 합니다.');
        process.exit(1);
      }
      config.party = config.party.filter(p => p !== pokemon);
      writeConfig(config);
      success(`✓ ${pokemon}을(를) 파티에서 제외했습니다.`);
      break;
    }
    default: {
      // list
      bold('[ 현재 파티 ]');
      for (const p of config.party) {
        const level = state.pokemon[p]?.level ?? 1;
        const xp = state.pokemon[p]?.xp ?? 0;
        const expGroup: ExpGroup = pokemonDB.pokemon[p]?.exp_group ?? 'medium_fast';
        const bar = xpBar(xp, level, expGroup);
        console.log(`  ${BOLD}${p}${RESET} Lv.${level} [${GREEN}${bar}${RESET}]`);
      }
      break;
    }
  }
}

function cmdUnlockList(): void {
  const state = readState();
  const pokemonDB = getPokemonDB();

  bold('[ 잠금 해제된 포켓몬 ]');
  if (state.unlocked.length === 0) {
    warn('  아직 아무것도 없습니다.');
    return;
  }
  for (const p of state.unlocked) {
    const level = state.pokemon[p]?.level ?? 1;
    const pokemonId = pokemonDB.pokemon[p]?.id ?? 0;
    const types = pokemonDB.pokemon[p]?.types?.join('/') ?? '';
    console.log(`  ${BOLD}${p}${RESET} [#${pokemonId}] ${GRAY}${types}${RESET} Lv.${level}`);
  }
}

function cmdAchievements(): void {
  const state = readState();
  const achDB = getAchievementsDB();

  bold('[ 업적 ]');
  console.log('');

  for (const ach of achDB.achievements) {
    const achieved = !!state.achievements[ach.id];
    if (achieved) {
      console.log(`  ${GREEN}✓${RESET} ${BOLD}${ach.name}${RESET} ${ach.rarity_label}`);
    } else {
      console.log(`  ${GRAY}○ ${ach.name} ${ach.rarity_label}${RESET}`);
    }
    console.log(`    ${GRAY}${ach.description}${RESET}`);
    console.log('');
  }
}

function cmdConfigSet(key: string, value: string): void {
  if (!key || !value) {
    error('사용법: tokenmon config set <키> <값>');
    console.log('');
    info('설정 가능한 키:');
    console.log('  tokens_per_xp    - 토큰당 XP 비율 (기본: 10000)');
    console.log('  volume           - 소리 볼륨 0.0-1.0 (기본: 0.5)');
    console.log('  sprite_enabled   - 스프라이트 사용 true/false');
    console.log('  cry_enabled      - 울음소리 사용 true/false');
    console.log('  max_party_size   - 최대 파티 크기 1-6');
    console.log('  peon_ping_integration - peon-ping 연동 true/false');
    process.exit(1);
  }

  const config = readConfig();
  const numericKeys = ['tokens_per_xp', 'max_party_size', 'peon_ping_port'];
  const floatKeys = ['volume', 'xp_bonus_multiplier'];
  const boolKeys = ['sprite_enabled', 'cry_enabled', 'peon_ping_integration'];

  if (numericKeys.includes(key)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
(config as any)[key] = parseInt(value, 10);
  } else if (floatKeys.includes(key)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
(config as any)[key] = parseFloat(value);
  } else if (boolKeys.includes(key)) {
    if (value !== 'true' && value !== 'false') {
      error('true 또는 false 값을 입력하세요.');
      process.exit(1);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
(config as any)[key] = value === 'true';
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
(config as any)[key] = value;
  }

  writeConfig(config);
  success(`✓ ${key} = ${value} 로 설정했습니다.`);
}

function cmdHelp(): void {
  bold('토큰몬 (Tokénmon) - Claude Code 포켓몬 파트너');
  console.log('');
  info('사용법: tokenmon <명령> [옵션]');
  console.log('');
  bold('명령어:');
  console.log('  status              현재 파티와 통계 보기');
  console.log('  starter             스타터 포켓몬 선택');
  console.log('  party               현재 파티 보기');
  console.log('  party add <이름>    파티에 포켓몬 추가');
  console.log('  party remove <이름> 파티에서 포켓몬 제거');
  console.log('  unlock list         잠금 해제된 포켓몬 목록');
  console.log('  achievements        업적 목록');
  console.log('  config set <키> <값>  설정 변경');
  console.log('  help                이 도움말 보기');
  console.log('');
  bold('예시:');
  console.log('  tokenmon status');
  console.log('  tokenmon starter');
  console.log('  tokenmon party add 팽도리');
  console.log('  tokenmon config set cry_enabled false');
}

// Main dispatch
const args = process.argv.slice(2);
const command = args[0] ?? 'help';

switch (command) {
  case 'status':
    cmdStatus();
    break;
  case 'starter':
    cmdStarter();
    break;
  case 'party':
    cmdParty(args[1] ?? 'list', args[2]);
    break;
  case 'unlock':
    if (args[1] === 'list' || !args[1]) cmdUnlockList();
    else error('사용법: tokenmon unlock list');
    break;
  case 'achievements':
    cmdAchievements();
    break;
  case 'config':
    if (args[1] === 'set') cmdConfigSet(args[2], args[3]);
    else error('사용법: tokenmon config set <키> <값>');
    break;
  case 'help':
  case '--help':
  case '-h':
    cmdHelp();
    break;
  default:
    error(`알 수 없는 명령어: ${command}`);
    console.log('');
    cmdHelp();
    process.exit(1);
}
