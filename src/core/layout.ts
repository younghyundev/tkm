// Responsive layout tiers for party sprite display
import type { Config } from './types.js';

export type LayoutTier = 1 | 2 | 3 | 4;
export type SpriteMode = Config['sprite_mode'];

export const SPRITE_WIDTH = 20; // character count (used for padding)
// Braille is EAW:Neutral per Unicode spec — treated as 1-wide for layout math.
// Actual rendered width is terminal/font-dependent (some CJK terminals render
// braille as 2-wide). The render loop uses \u2800 everywhere so that all
// transparent cells share whatever width the terminal picks for braille.
export const SPRITE_COL_WIDTH = SPRITE_WIDTH + 1; // +1 for braille separator

/**
 * Determine the display tier based on terminal width, party size, and sprite_mode.
 * sprite_mode overrides (not just caps) the tier:
 *   'emoji_all' / 'emoji_ace' → always tier 4
 *   'ace_only' → tier 3 if fits, else tier 4
 *   'all' → full responsive: tier 1 → 2 → 3 → 4
 */
export function determineTier(termWidth: number, partySize: number, spriteMode: SpriteMode): LayoutTier {
  if (!Number.isFinite(termWidth) || termWidth < 0) return 4;
  if (partySize <= 0) return 4;

  const spritesPerRow = Math.floor(termWidth / SPRITE_COL_WIDTH);

  // sprite_mode overrides tier selection
  if (spriteMode === 'emoji_all' || spriteMode === 'emoji_ace') return 4;
  if (spriteMode === 'ace_only') {
    return spritesPerRow >= 1 ? 3 : 4;
  }
  // sprite_mode === 'all': full responsive
  if (spritesPerRow >= partySize) return 1;
  if (spritesPerRow >= 3) return 2;
  if (spritesPerRow >= 1) return 3;
  return 4;
}
