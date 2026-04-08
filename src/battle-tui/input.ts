import { SHOW_CURSOR } from './ansi.js';

export type KeyHandler = (key: string) => void;

let handler: KeyHandler | null = null;

export function startInput(onKey: KeyHandler): void {
  handler = onKey;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data: string) => {
    if (data === '\x03') { // Ctrl+C
      process.stdout.write(SHOW_CURSOR);
      process.exit(0);
    }
    handler?.(data);
  });
}

export function stopInput(): void {
  handler = null;
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write(SHOW_CURSOR);
}
