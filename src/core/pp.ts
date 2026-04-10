import type { StdinData } from './types.js';
import { t } from '../i18n/index.js';

export function ppBar(stdinData: StdinData, blocks: number = 6): string | null {
  const fiveHour = stdinData.rate_limits?.five_hour;
  if (!fiveHour || !Number.isFinite(fiveHour.used_percentage)) return null;

  const remaining = Math.max(0, Math.min(100, 100 - fiveHour.used_percentage));
  const displayRemaining = Math.round(remaining);
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
        const totalMins = Math.max(1, Math.round(remainingSec / 60));
        const hours = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        timeStr = mins > 0 ? ` (~${hours}h${mins}m)` : ` (~${hours}h)`;
      }
    }
  }

  const label = t('statusline.pp_label');
  return `${label}[${bar}] ${displayRemaining}%${timeStr}`;
}
