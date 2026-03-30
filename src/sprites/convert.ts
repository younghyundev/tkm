import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { PNG } from 'pngjs';

/**
 * Convert RGB to nearest ANSI 256 color code.
 */
function ansi256(r: number, g: number, b: number): number {
  // Grayscale range
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }
  // 6x6x6 color cube
  const ri = Math.round(r / 255 * 5);
  const gi = Math.round(g / 255 * 5);
  const bi = Math.round(b / 255 * 5);
  return 16 + 36 * ri + 6 * gi + bi;
}

function fg(r: number, g: number, b: number): string {
  return `\x1b[38;5;${ansi256(r, g, b)}m`;
}

function bg(r: number, g: number, b: number): string {
  return `\x1b[48;5;${ansi256(r, g, b)}m`;
}

const RESET = '\x1b[0m';

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Convert a PNG image to half-block ANSI terminal art.
 * Uses pngjs for PNG parsing.
 */
export function convertPng(pngBuffer: Buffer, width: number = 20): string {
  const img = PNG.sync.read(pngBuffer);
  const origW = img.width;
  const origH = img.height;

  // Resize maintaining aspect ratio
  let targetH = Math.round(origH * width / origW);
  if (targetH % 2 !== 0) targetH += 1;

  // Simple nearest-neighbor resize
  const getPixel = (x: number, y: number): RGBA => {
    const srcX = Math.min(Math.floor(x * origW / width), origW - 1);
    const srcY = Math.min(Math.floor(y * origH / targetH), origH - 1);
    const idx = (srcY * origW + srcX) * 4;
    return {
      r: img.data[idx],
      g: img.data[idx + 1],
      b: img.data[idx + 2],
      a: img.data[idx + 3],
    };
  };

  const lines: string[] = [];
  for (let y = 0; y < targetH; y += 2) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const top = getPixel(x, y);
      const bot = y + 1 < targetH ? getPixel(x, y + 1) : { r: 0, g: 0, b: 0, a: 0 };

      const topTransparent = top.a < 128;
      const botTransparent = bot.a < 128;

      if (topTransparent && botTransparent) {
        line += ' ';
      } else if (topTransparent) {
        line += `${fg(bot.r, bot.g, bot.b)}▄${RESET}`;
      } else if (botTransparent) {
        line += `${fg(top.r, top.g, top.b)}▀${RESET}`;
      } else {
        line += `${fg(top.r, top.g, top.b)}${bg(bot.r, bot.g, bot.b)}▀${RESET}`;
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

export function textFallback(name: string, width: number): string {
  const label = `[${name}]`;
  const pad = Math.max(0, Math.floor((width - label.length) / 2));
  return ' '.repeat(pad) + label;
}

/**
 * Convert a PNG file to terminal art and optionally write to file.
 */
export function convertFile(inputPath: string, outputPath?: string, width: number = 20, name?: string): string {
  if (!existsSync(inputPath)) {
    return textFallback(name ?? '?', width);
  }

  try {
    const buf = readFileSync(inputPath);
    const result = convertPng(buf, width);

    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, result + '\n', 'utf-8');
    }

    return result;
  } catch {
    return textFallback(name ?? '?', width);
  }
}
