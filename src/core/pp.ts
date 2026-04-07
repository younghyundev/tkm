import type { StdinData } from './types.js';

export function ppBar(stdinData: StdinData, blocks: number = 6): string | null {
  const fiveHour = stdinData.rate_limits?.five_hour;
  if (!fiveHour || !Number.isFinite(fiveHour.used_percentage)) return null;

  const remaining = Math.max(0, Math.min(100, 100 - fiveHour.used_percentage));
  const filled = Math.min(blocks, Math.round(remaining / 100 * blocks));
  const empty = blocks - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

  let timeStr = '';
  if (fiveHour.resets_at) {
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSec = fiveHour.resets_at - nowSec;
    if (remainingSec > 0) {
      if (remainingSec < 3600) {
        const mins = Math.max(1, Math.round(remainingSec / 60));
        timeStr = ` (~${mins}m)`;
      } else {
        const hours = Math.floor(remainingSec / 3600);
        timeStr = ` (~${hours}h)`;
      }
    }
  }

  return `🔋[${bar}] ${remaining}%${timeStr}`;
}
