#!/usr/bin/env -S npx tsx
import * as readline from 'readline';
import { readFileSync } from 'fs';
import { readState, writeState } from '../core/state.js';
import { readConfig, writeConfig, getDefaultConfig } from '../core/config.js';
import { getPokemonDB, getAchievementsDB } from '../core/pokemon-data.js';
import { levelToXp } from '../core/xp.js';
import { playCry } from '../audio/play-cry.js';
import { getCompletion, getPokedexList, syncPokedexFromUnlocked } from '../core/pokedex.js';
import { getCurrentRegion, getRegionList, moveToRegion } from '../core/regions.js';
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
      state.pokemon[chosen] = { id: pData?.id ?? 0, xp: 0, level: 1, friendship: 0 };
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
    case 'dispatch': {
      if (!pokemon) {
        const current = config.default_dispatch;
        info(`현재 디스패치: ${current ?? '자동 (미지정)'}`);
        info('사용법: tokenmon party dispatch <포켓몬이름>');
        return;
      }
      if (!config.party.includes(pokemon)) {
        error(`${pokemon}은(는) 파티에 없습니다.`);
        process.exit(1);
      }
      config.default_dispatch = pokemon;
      writeConfig(config);
      success(`${pokemon}을(를) 디스패치 포켓몬으로 설정했습니다. (서브에이전트 XP 1.5배)`);
      break;
    }
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

function cmdPokedex(pokemonName?: string, filterKey?: string, filterVal?: string): void {
  const state = readState();
  const pokemonDB = getPokemonDB();
  syncPokedexFromUnlocked(state);

  // Detail view for single pokemon
  if (pokemonName && pokemonName !== '--type' && pokemonName !== '--region' && pokemonName !== '--rarity') {
    const pData = pokemonDB.pokemon[pokemonName];
    if (!pData) {
      error(`"${pokemonName}" 포켓몬을 찾을 수 없습니다.`);
      process.exit(1);
    }

    const pdex = state.pokedex?.[pokemonName];
    const statusIcon = pdex?.caught ? `${GREEN}●${RESET}` : pdex?.seen ? `${YELLOW}◐${RESET}` : `${GRAY}○${RESET}`;
    const statusText = pdex?.caught ? '포획됨' : pdex?.seen ? '목격됨' : '미발견';

    bold(`=== ${pokemonName} (#${pData.id}) ===`);
    console.log('');
    console.log(`  상태: ${statusIcon} ${statusText}`);
    console.log(`  타입: ${pData.types.map((t: string) => `${pokemonDB.type_colors[t] ?? ''}${t}${RESET}`).join(' / ')}`);
    console.log(`  희귀도: ${pData.rarity}`);
    console.log(`  지역: ${pData.region}`);
    console.log(`  경험치 그룹: ${pData.exp_group}`);
    console.log(`  포획률: ${pData.catch_rate}`);
    console.log(`  기본 스탯: HP ${pData.base_stats.hp} / ATK ${pData.base_stats.attack} / DEF ${pData.base_stats.defense} / SPD ${pData.base_stats.speed}`);
    console.log(`  진화 라인: ${pData.line.join(' → ')}`);
    if (pData.evolves_at) console.log(`  진화 레벨: Lv.${pData.evolves_at}`);
    if (pData.evolves_condition) console.log(`  진화 조건: ${pData.evolves_condition}`);
    if (pdex?.first_seen) console.log(`  최초 발견: ${pdex.first_seen}`);

    if (state.pokemon[pokemonName]) {
      const ps = state.pokemon[pokemonName];
      console.log(`  현재 레벨: Lv.${ps.level} (XP: ${formatNumber(ps.xp)})`);
    }
    return;
  }

  // Parse filters
  const filters: { type?: string; region?: string; rarity?: string } = {};
  const allArgs = process.argv.slice(2);
  for (let i = 1; i < allArgs.length; i++) {
    if (allArgs[i] === '--type' && allArgs[i + 1]) { filters.type = allArgs[++i]; }
    else if (allArgs[i] === '--region' && allArgs[i + 1]) { filters.region = allArgs[++i]; }
    else if (allArgs[i] === '--rarity' && allArgs[i + 1]) { filters.rarity = allArgs[++i]; }
  }

  // List view
  const completion = getCompletion(state);
  const list = getPokedexList(state, Object.keys(filters).length > 0 ? filters : undefined);

  bold('=== 포켓몬 도감 ===');
  console.log(`  발견: ${completion.seen}/${completion.total} (${completion.seenPct}%)  포획: ${completion.caught}/${completion.total} (${completion.caughtPct}%)`);
  console.log('');

  const filterDesc = Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(', ');
  if (filterDesc) info(`  필터: ${filterDesc}`);

  for (const entry of list) {
    const icon = entry.status === 'caught' ? `${GREEN}●${RESET}`
      : entry.status === 'seen' ? `${YELLOW}◐${RESET}`
      : `${GRAY}○${RESET}`;
    const typeStr = entry.types.map((t: string) => `${pokemonDB.type_colors[t] ?? ''}${t}${RESET}`).join('/');
    const nameDisplay = entry.status === 'unknown' ? `${GRAY}???${RESET}` : entry.name;
    console.log(`  ${icon} #${String(entry.id).padStart(3, '0')} ${nameDisplay.padEnd(8)} ${typeStr} ${GRAY}${entry.rarity}${RESET}`);
  }
}

function cmdItems(): void {
  const state = readState();
  bold('[ 아이템 ]');
  const items = state.items ?? {};
  if (Object.keys(items).length === 0) {
    warn('  아이템이 없습니다.');
    return;
  }
  const itemNames: Record<string, string> = { retry_token: '재도전권' };
  for (const [key, count] of Object.entries(items)) {
    if (count > 0) {
      console.log(`  ${itemNames[key] ?? key}: ${count}개`);
    }
  }
}

function cmdRegion(subcmd?: string, regionName?: string): void {
  const state = readState();
  const config = readConfig();
  syncPokedexFromUnlocked(state);

  if (subcmd === 'move' && regionName) {
    const err = moveToRegion(regionName, state, config);
    if (err) {
      error(err);
      process.exit(1);
    }
    writeConfig(config);
    success(`${regionName}(으)로 이동했습니다!`);
    return;
  }

  if (subcmd === 'list') {
    const regions = getRegionList(state);
    bold('=== 지역 목록 ===');
    console.log('');
    for (const { region, unlocked } of regions) {
      const icon = unlocked ? `${GREEN}●${RESET}` : `${GRAY}○${RESET}`;
      const current = config.current_region === region.name ? ` ${YELLOW}← 현재${RESET}` : '';
      const lockInfo = !unlocked && region.unlock_condition
        ? ` ${GRAY}(${region.unlock_condition.type === 'pokedex_caught' ? '포획' : '발견'} ${region.unlock_condition.value}종 필요)${RESET}`
        : '';
      console.log(`  ${icon} ${BOLD}${region.name}${RESET} Lv.${region.level_range[0]}-${region.level_range[1]}${current}${lockInfo}`);
      console.log(`    ${GRAY}${region.description} (${region.pokemon_pool.length}종)${RESET}`);
    }
    return;
  }

  // Default: show current region
  const region = getCurrentRegion(config);
  bold(`=== 현재 지역: ${region.name} ===`);
  console.log(`  ${region.description}`);
  console.log(`  레벨 범위: Lv.${region.level_range[0]} ~ Lv.${region.level_range[1]}`);
  console.log(`  출현 포켓몬: ${region.pokemon_pool.length}종`);
  console.log('');
  const pokemonDB = getPokemonDB();
  for (const name of region.pokemon_pool) {
    const pData = pokemonDB.pokemon[name];
    if (!pData) continue;
    const pdex = state.pokedex?.[name];
    const icon = pdex?.caught ? `${GREEN}●${RESET}` : pdex?.seen ? `${YELLOW}◐${RESET}` : `${GRAY}○${RESET}`;
    const typeStr = pData.types.map((t: string) => `${pokemonDB.type_colors[t] ?? ''}${t}${RESET}`).join('/');
    const nameDisplay = pdex?.seen ? name : `${GRAY}???${RESET}`;
    console.log(`  ${icon} ${nameDisplay} ${typeStr} ${GRAY}${pData.rarity}${RESET}`);
  }
}

function cmdReset(confirm: boolean): void {
  if (!confirm) {
    warn('경고: 모든 데이터가 초기화됩니다! (포켓몬, 업적, 아이템 등)');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('정말 초기화하시겠습니까? (y/N): ', (answer: string) => {
      rl.close();
      if (answer.toLowerCase() === 'y') {
        doReset();
      } else {
        info('초기화가 취소되었습니다.');
      }
    });
    return;
  }
  doReset();
}

function doReset(): void {
  const state = readState();
  const cheatLog = state.cheat_log ?? []; // preserve cheat log
  const defaultConfig = getDefaultConfig();
  writeConfig(defaultConfig);

  const defaultState: any = {
    pokemon: {}, unlocked: [], achievements: {},
    total_tokens_consumed: 0, session_count: 0, error_count: 0,
    permission_count: 0, evolution_count: 0, last_session_id: null,
    xp_bonus_multiplier: 1.0, last_session_tokens: {}, pokedex: {},
    encounter_count: 0, catch_count: 0, battle_count: 0,
    battle_wins: 0, battle_losses: 0, items: {}, cheat_log: cheatLog,
  };
  writeState(defaultState);
  success('모든 데이터가 초기화되었습니다. (치트 로그는 보존됨)');
}

function cmdCheat(subcmd: string, arg1?: string, arg2?: string): void {
  const state = readState();
  const config = readConfig();
  const pokemonDB = getPokemonDB();

  function logCheat(cmd: string) {
    if (!state.cheat_log) state.cheat_log = [];
    state.cheat_log.push({ timestamp: new Date().toISOString(), command: cmd });
  }

  switch (subcmd) {
    case 'xp': {
      if (!arg1 || !arg2) { error('사용법: tokenmon cheat xp <포켓몬> <양>'); return; }
      const amount = parseInt(arg2, 10);
      if (!state.pokemon[arg1]) { error(`${arg1} 포켓몬이 없습니다.`); return; }
      state.pokemon[arg1].xp += amount;
      logCheat(`xp ${arg1} ${amount}`);
      writeState(state);
      success(`${arg1}에게 XP ${amount} 추가 (총 ${state.pokemon[arg1].xp})`);
      break;
    }
    case 'level': {
      if (!arg1 || !arg2) { error('사용법: tokenmon cheat level <포켓몬> <레벨>'); return; }
      const level = parseInt(arg2, 10);
      if (!state.pokemon[arg1]) { error(`${arg1} 포켓몬이 없습니다.`); return; }
      state.pokemon[arg1].level = level;
      logCheat(`level ${arg1} ${level}`);
      writeState(state);
      success(`${arg1} 레벨을 ${level}로 설정`);
      break;
    }
    case 'unlock': {
      if (!arg1) { error('사용법: tokenmon cheat unlock <포켓몬>'); return; }
      const pData = pokemonDB.pokemon[arg1];
      if (!pData) { error(`${arg1} 포켓몬을 찾을 수 없습니다.`); return; }
      if (!state.unlocked.includes(arg1)) state.unlocked.push(arg1);
      if (!state.pokemon[arg1]) state.pokemon[arg1] = { id: pData.id, xp: 0, level: 1, friendship: 0 };
      if (!state.pokedex[arg1]) state.pokedex[arg1] = { seen: true, caught: true, first_seen: new Date().toISOString().split('T')[0] };
      else { state.pokedex[arg1].seen = true; state.pokedex[arg1].caught = true; }
      logCheat(`unlock ${arg1}`);
      writeState(state);
      success(`${arg1} 잠금 해제 + 도감 등록 완료`);
      break;
    }
    case 'achievement': {
      if (!arg1) { error('사용법: tokenmon cheat achievement <id>'); return; }
      state.achievements[arg1] = true;
      logCheat(`achievement ${arg1}`);
      writeState(state);
      success(`업적 ${arg1} 해금`);
      break;
    }
    case 'item': {
      if (!arg1 || !arg2) { error('사용법: tokenmon cheat item <아이템> <수량>'); return; }
      const count = parseInt(arg2, 10);
      if (!state.items) state.items = {};
      state.items[arg1] = (state.items[arg1] ?? 0) + count;
      logCheat(`item ${arg1} ${count}`);
      writeState(state);
      success(`${arg1} x${count} 추가 (총 ${state.items[arg1]})`);
      break;
    }
    case 'multiplier': {
      if (!arg1) { error('사용법: tokenmon cheat multiplier <값>'); return; }
      state.xp_bonus_multiplier = parseFloat(arg1);
      logCheat(`multiplier ${arg1}`);
      writeState(state);
      success(`XP 배율을 ${arg1}로 설정`);
      break;
    }
    default:
      error('사용법: tokenmon cheat <xp|level|unlock|achievement|item|multiplier> ...');
  }
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
  console.log('  items               아이템 목록');
  console.log('  region              현재 지역 보기');
  console.log('  region list         전체 지역 목록');
  console.log('  region move <이름>  지역 이동');
  console.log('  pokedex             포켓몬 도감 보기');
  console.log('  pokedex <이름>      포켓몬 상세 정보');
  console.log('  pokedex --type <타입>   타입별 필터');
  console.log('  pokedex --region <지역> 지역별 필터');
  console.log('  pokedex --rarity <희귀> 희귀도별 필터');
  console.log('  config set <키> <값>  설정 변경');
  console.log('  uninstall           플러그인 데이터 정리 (언인스톨)');
  console.log('  uninstall --keep-state  state.json 보존하고 정리');
  console.log('  reset               데이터 초기화');
  console.log('  cheat <명령>        치트 명령');
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
  case 'items':
    cmdItems();
    break;
  case 'region':
    cmdRegion(args[1], args.slice(2).join(' ') || undefined);
    break;
  case 'pokedex':
    cmdPokedex(args[1], args[2], args[3]);
    break;
  case 'config':
    if (args[1] === 'set') cmdConfigSet(args[2], args[3]);
    else error('사용법: tokenmon config set <키> <값>');
    break;
  case 'uninstall': {
    const { execSync } = await import('child_process');
    const uninstallArgs = args.includes('--keep-state') ? ' --keep-state' : '';
    execSync(`"${process.env.CLAUDE_PLUGIN_ROOT || '.'}/node_modules/.bin/tsx" "${process.env.CLAUDE_PLUGIN_ROOT || '.'}/scripts/uninstall.ts"${uninstallArgs}`, { stdio: 'inherit' });
    break;
  }
  case 'reset':
    cmdReset(args.includes('--confirm'));
    break;
  case 'cheat':
    cmdCheat(args[1], args[2], args[3]);
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
