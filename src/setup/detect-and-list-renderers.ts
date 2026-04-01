#!/usr/bin/env tsx
/**
 * Detect and print available sprite renderers for the setup skill.
 * Output is human-readable lines for the setup flow to consume.
 */
import { detectRenderer, formatDetectionChoices } from '../core/detect-renderer.js';

const result = detectRenderer();
const choices = formatDetectionChoices(result);

for (let i = 0; i < choices.length; i++) {
  const tag = choices[i].recommended ? ' [추천]' : '';
  console.log(`${i + 1}.${tag} ${choices[i].label} (${choices[i].value})`);
}
