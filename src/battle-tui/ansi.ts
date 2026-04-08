// ANSI escape code utilities for TUI battle rendering

export const ESC = '\x1b';
export const RESET = `${ESC}[0m`;
export const BOLD = `${ESC}[1m`;
export const DIM = `${ESC}[2m`;
export const CLEAR_SCREEN = `${ESC}[2J`;
export const CURSOR_HOME = `${ESC}[H`;
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;

export function moveTo(row: number, col: number): string {
  return `${ESC}[${row};${col}H`;
}

export function fg256(code: number): string {
  return `${ESC}[38;5;${code}m`;
}

export function bg256(code: number): string {
  return `${ESC}[48;5;${code}m`;
}

export function fgRgb(r: number, g: number, b: number): string {
  return `${ESC}[38;2;${r};${g};${b}m`;
}

// Type colors mapping (18 types → ANSI 256 codes)
export const TYPE_COLORS: Record<string, number> = {
  normal: 252,
  fire: 202,
  water: 33,
  electric: 226,
  grass: 34,
  ice: 51,
  fighting: 124,
  poison: 129,
  ground: 172,
  flying: 117,
  psychic: 198,
  bug: 106,
  rock: 137,
  ghost: 96,
  dragon: 57,
  dark: 240,
  steel: 248,
  fairy: 213,
};

export function typeColor(type: string): number {
  return TYPE_COLORS[type] ?? 252;
}

/** Render HP bar with color gradient (green >50%, yellow >20%, red <=20%) */
export function renderHpBar(current: number, max: number, width: number = 10): string {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  // Color gradient: green >50%, yellow >20%, red <=20%
  let color: string;
  if (ratio > 0.5) {
    color = fg256(34); // green
  } else if (ratio > 0.2) {
    color = fg256(226); // yellow
  } else {
    color = fg256(196); // red
  }

  const bar = color + '█'.repeat(filled) + RESET + DIM + '░'.repeat(empty) + RESET;
  return bar;
}

export function hLine(width: number, char: string = '─'): string {
  return char.repeat(width);
}

export function center(text: string, width: number): string {
  // Strip ANSI codes to measure visible length
  const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, Math.floor((width - visible.length) / 2));
  return ' '.repeat(pad) + text;
}
