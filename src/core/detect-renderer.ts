import type { SpriteRenderer } from './types.js';
import { t } from '../i18n/index.js';

export interface DetectionResult {
  supported: SpriteRenderer[];
  recommended: SpriteRenderer;
}

/**
 * Detect supported terminal graphic protocols from environment variables.
 * Purely env-var based (no DA1 queries) for reliability in non-interactive hook contexts.
 *
 * @param env - Override process.env (for testing)
 */
export function detectRenderer(env?: Record<string, string | undefined>): DetectionResult {
  const e = env ?? process.env;
  const termProgram = e.TERM_PROGRAM ?? '';
  const term = e.TERM ?? '';

  const supported: SpriteRenderer[] = ['braille']; // always available

  // VSCode terminal doesn't support any graphics protocol — force braille
  if (termProgram === 'vscode') {
    return { supported, recommended: 'braille' };
  }

  // Kitty Graphics Protocol
  if (term === 'xterm-kitty' || termProgram === 'ghostty' || termProgram === 'WezTerm') {
    supported.push('kitty');
  }

  // Sixel
  if (termProgram === 'WezTerm' || termProgram === 'mintty' || term === 'xterm') {
    supported.push('sixel');
  }

  // iTerm2 Inline Images (OSC 1337)
  if (termProgram === 'iTerm.app' || termProgram === 'WezTerm') {
    supported.push('iterm2');
  }

  // Priority: kitty > iterm2 > sixel > braille
  const priority: SpriteRenderer[] = ['kitty', 'iterm2', 'sixel', 'braille'];
  const recommended = priority.find(r => supported.includes(r)) ?? 'braille';

  return { supported, recommended };
}

export function formatDetectionChoices(result: DetectionResult): Array<{
  value: SpriteRenderer;
  label: string;
  recommended: boolean;
}> {
  const labels: Record<SpriteRenderer, string> = {
    kitty:   t('renderer.kitty_desc'),
    sixel:   t('renderer.sixel_desc'),
    iterm2:  t('renderer.iterm2_desc'),
    braille: t('renderer.braille_desc'),
  };

  return result.supported.map(r => ({
    value: r,
    label: labels[r],
    recommended: r === result.recommended,
  }));
}
