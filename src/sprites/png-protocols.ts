import { PNG } from 'pngjs';

/**
 * Generate Kitty Graphics Protocol APC sequence from a PNG buffer.
 * Chunks base64 data into 4096-byte segments per the Kitty spec.
 */
export function generateKitty(pngBuffer: Buffer): string {
  const b64 = pngBuffer.toString('base64');
  const CHUNK_SIZE = 4096;
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE));
  }

  if (chunks.length === 1) {
    return `\x1b_Gf=100,a=T,t=d;${chunks[0]}\x1b\\`;
  }

  const parts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const more = i < chunks.length - 1 ? 1 : 0;
    if (i === 0) {
      parts.push(`\x1b_Gf=100,a=T,t=d,m=${more};${chunks[i]}\x1b\\`);
    } else {
      parts.push(`\x1b_Gm=${more};${chunks[i]}\x1b\\`);
    }
  }
  return parts.join('');
}

/**
 * Generate iTerm2 OSC 1337 inline image sequence from a PNG buffer.
 */
export function generateIterm2(pngBuffer: Buffer): string {
  const b64 = pngBuffer.toString('base64');
  const size = pngBuffer.length;
  return `\x1b]1337;File=inline=1;size=${size}:${b64}\x1b\\`;
}

function ansi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }
  return 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5);
}

/**
 * Generate Sixel encoded data from a PNG buffer.
 * Uses ANSI-256 color palette for consistency with existing braille sprites.
 */
export function generateSixel(pngBuffer: Buffer): string {
  const img = PNG.sync.read(pngBuffer);
  const w = img.width;
  const h = img.height;

  const pixels: number[] = new Array(w * h);
  const colorMap = new Map<number, { r: number; g: number; b: number }>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = img.data[idx + 3];
      if (a < 128) {
        pixels[y * w + x] = -1;
        continue;
      }
      const r = img.data[idx];
      const g = img.data[idx + 1];
      const b = img.data[idx + 2];
      const ci = ansi256(r, g, b);
      pixels[y * w + x] = ci;
      if (!colorMap.has(ci)) {
        const isGray = ci >= 232;
        const grayVal = isGray ? ((ci - 232) * 10 + 8) : 0;
        const ri = isGray ? grayVal : (ci >= 16 ? Math.round(Math.floor((ci - 16) / 36) * 51) : 0);
        const gi2 = isGray ? grayVal : (ci >= 16 ? Math.round(Math.floor(((ci - 16) % 36) / 6) * 51) : 0);
        const bi2 = isGray ? grayVal : (ci >= 16 ? Math.round(((ci - 16) % 6) * 51) : 0);
        colorMap.set(ci, { r: ri, g: gi2, b: bi2 });
      }
    }
  }

  let sixel = '\x1bPq\n';

  for (const [ci, { r, g, b }] of colorMap.entries()) {
    const rp = Math.round(r / 255 * 100);
    const gp = Math.round(g / 255 * 100);
    const bp = Math.round(b / 255 * 100);
    sixel += `#${ci};2;${rp};${gp};${bp}\n`;
  }

  for (let bandY = 0; bandY < h; bandY += 6) {
    const usedColors = new Set<number>();
    for (let dy = 0; dy < 6 && bandY + dy < h; dy++) {
      for (let x = 0; x < w; x++) {
        const ci = pixels[(bandY + dy) * w + x];
        if (ci >= 0) usedColors.add(ci);
      }
    }

    const colorList = [...usedColors];
    for (let ci_idx = 0; ci_idx < colorList.length; ci_idx++) {
      const ci = colorList[ci_idx];
      const isLastColor = ci_idx === colorList.length - 1;
      sixel += `#${ci}`;
      for (let x = 0; x < w; x++) {
        let bits = 0;
        for (let dy = 0; dy < 6 && bandY + dy < h; dy++) {
          if (pixels[(bandY + dy) * w + x] === ci) {
            bits |= (1 << dy);
          }
        }
        sixel += String.fromCharCode(63 + bits);
      }
      // Last color in band: use '-' (graphics newline) directly, skip '$' carriage return
      if (isLastColor) {
        if (bandY + 6 < h) sixel += '-\n'; // only between bands, not after last
      } else {
        sixel += '$\n'; // carriage return to start of this band for next color
      }
    }
  }

  sixel += '\x1b\\';
  return sixel;
}
