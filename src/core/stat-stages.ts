import { t } from '../i18n/index.js';
import type { BattlePokemon, StatStages } from './types.js';

const MIN_STAGE = -6;
const MAX_STAGE = 6;

const STAT_LABEL_KEYS: Record<keyof StatStages, string> = {
  attack: 'stat.name.attack',
  defense: 'stat.name.defense',
  spAttack: 'stat.name.sp_attack',
  spDefense: 'stat.name.sp_defense',
  speed: 'stat.name.speed',
  accuracy: 'stat.name.accuracy',
  evasion: 'stat.name.evasion',
};

export function createStatStages(): StatStages {
  return {
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

export function getStatMultiplier(stage: number): number {
  return Math.max(2, 2 + stage) / Math.max(2, 2 - stage);
}

export function getAccEvaMultiplier(stage: number): number {
  return Math.max(3, 3 + stage) / Math.max(3, 3 - stage);
}

export function applyStatChange(
  target: BattlePokemon,
  stat: keyof StatStages,
  delta: number,
  messages: string[],
): boolean {
  const current = target.statStages[stat];
  const next = Math.max(MIN_STAGE, Math.min(MAX_STAGE, current + delta));
  const statName = t(STAT_LABEL_KEYS[stat]);

  if (next === current) {
    messages.push(
      t(delta > 0 ? 'stat.cannot_rise' : 'stat.cannot_fall', {
        name: target.displayName,
        stat: statName,
      }),
    );
    return false;
  }

  target.statStages[stat] = next;
  const key =
    delta > 0
      ? (Math.abs(delta) >= 2 ? 'stat.rose_sharply' : 'stat.rose')
      : (Math.abs(delta) >= 2 ? 'stat.fell_harshly' : 'stat.fell');
  messages.push(t(key, { name: target.displayName, stat: statName }));
  return true;
}

export function resetStatStages(pokemon: BattlePokemon): void {
  pokemon.statStages = createStatStages();
}
