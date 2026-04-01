#!/usr/bin/env tsx
/**
 * Generate comparison of sprite rendering methods.
 * Outputs side-by-side: Original half-block | Quarter-block | Colored Braille
 * Renders to terminal (use `script` or screenshot to capture).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GRAY = '\x1b[90m';

function ansi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }
  return 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5);
}

function fg(r: number, g: number, b: number): string {
  return `\x1b[38;5;${ansi256(r, g, b)}m`;
}
function bg(r: number, g: number, b: number): string {
  return `\x1b[48;5;${ansi256(r, g, b)}m`;
}

interface Pixel { r: number; g: number; b: number; a: number; }

function loadImage(pngPath: string) {
  const img = PNG.sync.read(readFileSync(pngPath));
  return {
    width: img.width, height: img.height,
    get: (x: number, y: number): Pixel => {
      const i = (y * img.width + x) * 4;
      return { r: img.data[i], g: img.data[i+1], b: img.data[i+2], a: img.data[i+3] };
    }
  };
}

function resample(img: ReturnType<typeof loadImage>, w: number, h: number) {
  return {
    width: w, height: h,
    get: (x: number, y: number): Pixel => {
      const sx = Math.min(Math.floor(x * img.width / w), img.width - 1);
      const sy = Math.min(Math.floor(y * img.height / h), img.height - 1);
      return img.get(sx, sy);
    }
  };
}

// === Method 1: Half-block (▀▄) ===
function halfBlock(img: ReturnType<typeof loadImage>, width: number): string[] {
  let h = Math.round(img.height * width / img.width);
  if (h % 2 !== 0) h++;
  const rs = resample(img, width, h);
  const lines: string[] = [];
  for (let y = 0; y < h; y += 2) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const top = rs.get(x, y);
      const bot = y + 1 < h ? rs.get(x, y + 1) : { r: 0, g: 0, b: 0, a: 0 };
      const tT = top.a < 128, bT = bot.a < 128;
      if (tT && bT) line += ' ';
      else if (tT) line += `${fg(bot.r, bot.g, bot.b)}▄${RESET}`;
      else if (bT) line += `${fg(top.r, top.g, top.b)}▀${RESET}`;
      else line += `${fg(top.r, top.g, top.b)}${bg(bot.r, bot.g, bot.b)}▀${RESET}`;
    }
    lines.push(line);
  }
  return lines;
}

// === Method 2: Quarter-block (▖▗▘▝▙▚▛▜█▄▀▐▌) ===
const QB_MAP: Record<number, string> = {
  0b0000: ' ', 0b0001: '▘', 0b0010: '▝', 0b0011: '▀',
  0b0100: '▖', 0b0101: '▌', 0b0110: '▞', 0b0111: '▛',
  0b1000: '▗', 0b1001: '▚', 0b1010: '▐', 0b1011: '▜',
  0b1100: '▄', 0b1101: '▙', 0b1110: '▟', 0b1111: '█',
};

function quarterBlock(img: ReturnType<typeof loadImage>, width: number): string[] {
  let h = Math.round(img.height * width / img.width);
  if (h % 2 !== 0) h++;
  const pixW = width * 2, pixH = h * 2;
  const rs = resample(img, pixW, pixH);
  const lines: string[] = [];

  for (let cy = 0; cy < pixH; cy += 2) {
    let line = '';
    for (let cx = 0; cx < pixW; cx += 2) {
      const pixels: Pixel[] = [];
      const mask = [false, false, false, false]; // TL TR BL BR
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = cx + dx, py = cy + dy;
          const p = px < pixW && py < pixH ? rs.get(px, py) : { r: 0, g: 0, b: 0, a: 0 };
          const idx = dy * 2 + dx;
          pixels.push(p);
          mask[idx] = p.a >= 128;
        }
      }

      const bits = (mask[0] ? 1 : 0) | (mask[1] ? 2 : 0) | (mask[2] ? 4 : 0) | (mask[3] ? 8 : 0);
      if (bits === 0) { line += ' '; continue; }

      // Fg = average of visible pixels, Bg = average of invisible (or skip)
      const visible = pixels.filter((_, i) => mask[i]);
      const hidden = pixels.filter((_, i) => !mask[i] && pixels[i].a < 128);

      const avgR = Math.round(visible.reduce((s, p) => s + p.r, 0) / visible.length);
      const avgG = Math.round(visible.reduce((s, p) => s + p.g, 0) / visible.length);
      const avgB = Math.round(visible.reduce((s, p) => s + p.b, 0) / visible.length);

      const char = QB_MAP[bits] ?? '█';
      line += `${fg(avgR, avgG, avgB)}${char}${RESET}`;
    }
    lines.push(line);
  }
  return lines;
}

// === Method 3: Colored Braille + BG ===
const DOT_BITS = [[0,3],[1,4],[2,5],[6,7]];
const BRAILLE_BASE = 0x2800;

function colorBraille(img: ReturnType<typeof loadImage>, width: number): string[] {
  const pixW = width * 2;
  const pixH = Math.round(img.height * pixW / img.width);
  const rs = resample(img, pixW, pixH);
  const lines: string[] = [];

  for (let by = 0; by < pixH; by += 4) {
    let line = '';
    for (let bx = 0; bx < pixW; bx += 2) {
      let bits = 0;
      let tR = 0, tG = 0, tB = 0, cc = 0;

      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) {
          const px = bx + col, py = by + row;
          if (px >= pixW || py >= pixH) continue;
          const p = rs.get(px, py);
          if (p.a >= 128) {
            bits |= (1 << DOT_BITS[row][col]);
            tR += p.r; tG += p.g; tB += p.b; cc++;
          }
        }
      }

      if (bits === 0) { line += ' '; continue; }
      const color = ansi256(Math.round(tR / cc), Math.round(tG / cc), Math.round(tB / cc));
      line += `\x1b[38;5;${color}m${String.fromCodePoint(BRAILLE_BASE + bits)}${RESET}`;
    }
    lines.push(line);
  }
  return lines.filter(l => l.trim().length > 0);
}

// === Main: Compare ===
const ids = process.argv.slice(2).map(Number).filter(Boolean);
const testIds = ids.length > 0 ? ids : [387, 393, 448, 483, 493];
const WIDTH = 30;

for (const id of testIds) {
  const pngPath = join(RAW_DIR, `${id}.png`);
  if (!existsSync(pngPath)) { console.log(`#${id}: PNG not found`); continue; }

  const img = loadImage(pngPath);
  const hb = halfBlock(img, WIDTH);
  const qb = quarterBlock(img, WIDTH);
  const br = colorBraille(img, WIDTH);

  const maxLines = Math.max(hb.length, qb.length, br.length);
  const pad = '                              '; // 30 chars

  console.log(`${BOLD}#${id}${RESET}  ${GRAY}(${img.width}x${img.height})${RESET}`);
  console.log(`${'  Half-block'.padEnd(35)}${'  Quarter-block'.padEnd(35)}${'  Braille'}`);
  console.log(`${GRAY}${'─'.repeat(95)}${RESET}`);

  for (let i = 0; i < maxLines; i++) {
    const h = hb[i] ?? pad;
    const q = qb[i] ?? pad;
    const b = br[i] ?? pad;
    // Use fixed column widths by printing each section then spacing
    process.stdout.write(h);
    process.stdout.write('  │  ');
    process.stdout.write(q);
    process.stdout.write('  │  ');
    process.stdout.write(b);
    process.stdout.write('\n');
  }
  console.log('');
}
