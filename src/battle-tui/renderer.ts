// Battle screen TUI renderer

import {
  RESET, BOLD, DIM,
  CLEAR_SCREEN, CURSOR_HOME, HIDE_CURSOR,
  fg256, renderHpBar, hLine, center, typeColor,
} from './ansi.js';
import { getActivePokemon } from '../core/turn-battle.js';
import { t } from '../i18n/index.js';
import type { BattleState, BattlePokemon, GymData } from '../core/types.js';

const WIDTH = 50;

// ── Helpers ──

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function padRight(text: string, width: number): string {
  const visible = stripAnsi(text);
  const pad = Math.max(0, width - visible.length);
  return text + ' '.repeat(pad);
}

function statusLabel(mon: BattlePokemon): string {
  if (!mon.statusCondition) return '';
  const label = t(`status.label.${mon.statusCondition}`);
  const colors: Record<string, string> = {
    burn: '\x1b[31m',
    poison: '\x1b[35m',
    badly_poisoned: '\x1b[35m',
    paralysis: '\x1b[33m',
  };
  const color = colors[mon.statusCondition] || '';
  return ` ${color}[${label}]${RESET}`;
}

function pokemonLine(
  mon: BattlePokemon,
  indent: number,
): string {
  const nameStr = `${BOLD}${mon.displayName}${RESET}`;
  const lvStr = `${DIM}Lv.${mon.level}${RESET}`;
  const status = statusLabel(mon);
  const hpBar = renderHpBar(mon.currentHp, mon.maxHp, 10);
  const hpNum = `${mon.currentHp}/${mon.maxHp}`;
  const prefix = ' '.repeat(indent);
  return `${prefix}${nameStr} ${lvStr}${status}        HP ${hpBar} ${hpNum}`;
}

function doubleLine(): string {
  return hLine(WIDTH, '═');
}

function singleLine(): string {
  return hLine(WIDTH, '─');
}

// ── Main Renderers ──

export function renderBattleScreen(
  state: BattleState,
  gym: GymData | null,
  recentMessages: string[],
): string {
  const lines: string[] = [];

  // Full-screen reset
  lines.push(CLEAR_SCREEN + CURSOR_HOME + HIDE_CURSOR);

  // Header
  lines.push(doubleLine());
  const headerText = gym
    ? `${BOLD}${gym.leaderKo}의 체육관${RESET} — ${fg256(typeColor(gym.type))}${gym.type}${RESET} 타입 전문`
    : `${BOLD}배틀${RESET}`;
  lines.push(center(headerText, WIDTH));
  lines.push(doubleLine());
  lines.push('');

  // Opponent pokemon (top-left, minimal indent)
  const opponent = getActivePokemon(state.opponent);
  lines.push(pokemonLine(opponent, 2));
  lines.push('');

  // Player pokemon (bottom-right, larger indent)
  const player = getActivePokemon(state.player);
  lines.push(pokemonLine(player, 10));
  lines.push('');

  // Message area
  lines.push(singleLine());
  const msgs = recentMessages.slice(-2);
  for (const msg of msgs) {
    lines.push(`  ${msg}`);
  }
  // Pad to always show 2 message lines
  for (let i = msgs.length; i < 2; i++) {
    lines.push('');
  }
  lines.push(singleLine());

  // Action menu depends on phase
  if (state.phase === 'select_action') {
    lines.push(renderMoveMenu(player));
  } else if (state.phase === 'fainted_switch') {
    lines.push(renderSwitchMenu(state));
  }

  lines.push(doubleLine());

  return lines.join('\n');
}

function renderMoveMenu(player: BattlePokemon): string {
  const rows: string[] = [];
  const moves = player.moves;

  // Render moves in 2-column grid
  for (let i = 0; i < moves.length; i += 2) {
    const left = moves[i];
    const right = moves[i + 1];

    const leftStr = formatMoveEntry(i, left);
    const rightStr = right ? formatMoveEntry(i + 1, right) : '';

    rows.push(`  ${padRight(leftStr, 22)}${rightStr}`);
  }

  // Bottom row: switch & surrender
  rows.push(center(`${BOLD}5${RESET}.교체    ${BOLD}6${RESET}.항복`, WIDTH));

  return rows.join('\n');
}

function formatMoveEntry(
  index: number,
  move: { data: { nameKo: string; type: string; pp: number }; currentPp: number },
): string {
  const num = index + 1;
  const color = fg256(typeColor(move.data.type));
  const ppStr = `${move.currentPp}/${move.data.pp}`;
  return `${BOLD}${num}${RESET}.${color}${move.data.nameKo}${RESET} ${DIM}${ppStr}${RESET}`;
}

function renderSwitchMenu(state: BattleState): string {
  const rows: string[] = [];
  rows.push(`  ${BOLD}${t('battle.select_switch')}${RESET}`);

  const team = state.player.pokemon;
  for (let i = 0; i < team.length; i++) {
    const mon = team[i];
    if (mon.fainted || i === state.player.activeIndex) continue;
    const hpBar = renderHpBar(mon.currentHp, mon.maxHp, 8);
    const statusStr = mon.statusCondition ? ` [${t(`status.label.${mon.statusCondition}`)}]` : '';
    rows.push(`  ${BOLD}${i + 1}${RESET}. ${mon.displayName} Lv.${mon.level}${statusStr} ${hpBar} ${mon.currentHp}/${mon.maxHp}`);
  }

  return rows.join('\n');
}

// ── Surrender Confirm ──

export function renderSurrenderConfirm(): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${BOLD}${t('battle.surrender_confirm')}${RESET}`);
  lines.push(`  ${BOLD}1${RESET}. 예    ${BOLD}2${RESET}. 아니오`);
  lines.push('');
  return lines.join('\n');
}

// ── Battle End ──

export function renderBattleEnd(
  state: BattleState,
  gym: GymData | null,
): string {
  const lines: string[] = [];

  lines.push(CLEAR_SCREEN + CURSOR_HOME);
  lines.push('');
  lines.push(doubleLine());

  if (state.winner === 'player') {
    lines.push(center(`${BOLD}승리!${RESET}`, WIDTH));
    if (gym) {
      lines.push('');
      lines.push(center(`${fg256(typeColor(gym.type))}${gym.badgeKo}${RESET}을(를) 획득했다!`, WIDTH));
    }
  } else {
    lines.push(center(`${BOLD}패배...${RESET}`, WIDTH));
    if (gym) {
      lines.push('');
      lines.push(center(`${gym.leaderKo}에게 졌다...`, WIDTH));
    }
  }

  lines.push('');
  lines.push(doubleLine());
  lines.push('');
  lines.push(center(`${DIM}${t('battle.press_any_key')}${RESET}`, WIDTH));
  lines.push('');

  return lines.join('\n');
}
