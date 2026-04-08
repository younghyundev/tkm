import { createInterface } from 'readline';
import { SHOW_CURSOR } from './ansi.js';

export type KeyHandler = (key: string) => void;

let handler: KeyHandler | null = null;
let dataHandler: ((data: string) => void) | null = null;
let rl: ReturnType<typeof createInterface> | null = null;

export function startInput(onKey: KeyHandler): void {
  handler = onKey;

  if (process.stdin.isTTY) {
    // TTY mode: raw key capture (single keypress, no Enter needed)
    dataHandler = (data: string) => {
      if (data === '\x03') {
        process.stdout.write(SHOW_CURSOR);
        process.exit(0);
      }
      handler?.(data);
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', dataHandler);
  } else {
    // Non-TTY fallback: readline (type number + Enter)
    rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (trimmed) handler?.(trimmed);
    });
    rl.on('close', () => {
      process.stdout.write(SHOW_CURSOR);
      process.exit(0);
    });
  }
}

export function stopInput(): void {
  handler = null;
  if (process.stdin.isTTY) {
    if (dataHandler) {
      process.stdin.removeListener('data', dataHandler);
      dataHandler = null;
    }
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  if (rl) {
    rl.close();
    rl = null;
  }
  process.stdout.write(SHOW_CURSOR);
}
