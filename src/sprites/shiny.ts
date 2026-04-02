import { PNG } from 'pngjs';

/**
 * Default hue-shift angle for shiny pokemon sprites (degrees).
 */
export const SHINY_HUE_SHIFT = 180;

/**
 * Convert RGB (0-255 each) to HSL (h: 0-360, s: 0-1, l: 0-1).
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }

  return [h, s, l];
}

/**
 * Convert HSL (h: 0-360, s: 0-1, l: 0-1) to RGB (0-255 each).
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;

  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
}

/**
 * Convert ANSI 256 color code to RGB (0-255 each).
 * Handles: 0-15 (standard), 16-231 (6x6x6 cube), 232-255 (grayscale).
 */
export function ansi256ToRgb(code: number): [number, number, number] {
  // Standard colors 0-15 — approximate terminal defaults
  const STANDARD_COLORS: [number, number, number][] = [
    [0, 0, 0],       // 0 black
    [128, 0, 0],     // 1 red
    [0, 128, 0],     // 2 green
    [128, 128, 0],   // 3 yellow
    [0, 0, 128],     // 4 blue
    [128, 0, 128],   // 5 magenta
    [0, 128, 128],   // 6 cyan
    [192, 192, 192], // 7 white
    [128, 128, 128], // 8 bright black
    [255, 0, 0],     // 9 bright red
    [0, 255, 0],     // 10 bright green
    [255, 255, 0],   // 11 bright yellow
    [0, 0, 255],     // 12 bright blue
    [255, 0, 255],   // 13 bright magenta
    [0, 255, 255],   // 14 bright cyan
    [255, 255, 255], // 15 bright white
  ];

  if (code < 16) {
    return STANDARD_COLORS[code];
  }

  // Grayscale 232-255
  if (code >= 232) {
    const gray = (code - 232) * 10 + 8;
    return [gray, gray, gray];
  }

  // 6x6x6 color cube 16-231
  const idx = code - 16;
  const ri = Math.floor(idx / 36);
  const gi = Math.floor((idx % 36) / 6);
  const bi = idx % 6;
  const toVal = (v: number): number => v === 0 ? 0 : 55 + v * 40;
  return [toVal(ri), toVal(gi), toVal(bi)];
}

// The 6x6x6 cube breakpoints: 0, 95, 135, 175, 215, 255
// Midpoints between these values are used for nearest-neighbor mapping.
const CUBE_VALUES = [0, 95, 135, 175, 215, 255];

function rgbComponentToIndex(v: number): number {
  if (v < 48) return 0;       // midpoint(0, 95) = 47.5
  if (v < 115) return 1;      // midpoint(95, 135) = 115
  if (v < 155) return 2;      // midpoint(135, 175) = 155
  if (v < 195) return 3;      // midpoint(175, 215) = 195
  if (v < 235) return 4;      // midpoint(215, 255) = 235
  return 5;
}

/**
 * Convert RGB (0-255 each) to nearest ANSI 256 color code.
 * Uses the exact 6x6x6 cube breakpoints from ansi256ToRgb for round-trip consistency.
 */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  // Grayscale detection
  if (r === g && g === b) {
    if (r < 4) return 16;         // closest to cube black (0,0,0)
    if (r > 246) return 231;      // closest to cube white (255,255,255)
    // Check if the grayscale ramp or the cube gives a closer match
    const cubeIdx = rgbComponentToIndex(r);
    const cubeVal = CUBE_VALUES[cubeIdx];
    const grayIdx = Math.round((r - 8) / 10);
    const clampedGrayIdx = Math.max(0, Math.min(23, grayIdx));
    const grayVal = clampedGrayIdx * 10 + 8;
    if (Math.abs(cubeVal - r) < Math.abs(grayVal - r)) {
      return 16 + 36 * cubeIdx + 6 * cubeIdx + cubeIdx;
    }
    return 232 + clampedGrayIdx;
  }

  // 6x6x6 color cube
  const ri = rgbComponentToIndex(r);
  const gi = rgbComponentToIndex(g);
  const bi = rgbComponentToIndex(b);
  return 16 + 36 * ri + 6 * gi + bi;
}

/**
 * Shift hue of all ANSI 256 color codes in a text string.
 * Parses \x1b[38;5;{N}m (foreground) and \x1b[48;5;{N}m (background) patterns.
 * For each: ansi256ToRgb -> rgbToHsl -> h += degrees -> hslToRgb -> rgbToAnsi256
 *
 * @param text - Input text containing ANSI 256 escape codes
 * @param degrees - Hue rotation in degrees (default: SHINY_HUE_SHIFT = 180)
 * @returns Text with shifted ANSI color codes
 */
export function shiftAnsiHue(text: string, degrees: number = SHINY_HUE_SHIFT): string {
  // Match \x1b[38;5;{N}m or \x1b[48;5;{N}m
  return text.replace(/\x1b\[(38|48);5;(\d+)m/g, (_match, type: string, codeStr: string) => {
    const code = parseInt(codeStr, 10);
    const [r, g, b] = ansi256ToRgb(code);
    const [h, s, l] = rgbToHsl(r, g, b);
    const newH = ((h + degrees) % 360 + 360) % 360;
    const [nr, ng, nb] = hslToRgb(newH, s, l);
    const newCode = rgbToAnsi256(nr, ng, nb);
    return `\x1b[${type};5;${newCode}m`;
  });
}

/**
 * Hue-shift all pixels in a PNG buffer. Returns a new PNG buffer.
 * Skips transparent pixels (alpha < 128).
 * Prepared for future kitty/iTerm2/sixel integration.
 *
 * @param pngBuffer - Input PNG buffer
 * @param degrees - Hue rotation in degrees (default: SHINY_HUE_SHIFT = 180)
 * @returns New PNG buffer with shifted hues
 */
export function hueShiftPng(pngBuffer: Buffer, degrees: number = SHINY_HUE_SHIFT): Buffer {
  const img = PNG.sync.read(pngBuffer);
  const { width, height, data } = img;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];

      // Skip transparent pixels
      if (a < 128) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const [h, s, l] = rgbToHsl(r, g, b);
      const newH = ((h + degrees) % 360 + 360) % 360;
      const [nr, ng, nb] = hslToRgb(newH, s, l);

      data[idx] = nr;
      data[idx + 1] = ng;
      data[idx + 2] = nb;
      // alpha unchanged
    }
  }

  return PNG.sync.write(img);
}
