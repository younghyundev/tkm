import { t } from '../i18n/index.js';
import type { BattleMove, BattlePokemon, StatusCondition } from './types.js';

const STATUS_IMMUNITIES: Record<StatusCondition, string[]> = {
  poison: ['poison', 'steel'],
  badly_poisoned: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
  sleep: [],
  freeze: ['ice'],
};

export const FROZEN_EXCEPTION_MOVES = new Set([
  'flame-wheel',
  'sacred-fire',
  'scald',
  'flare-blitz',
  'steam-eruption',
  'burn-up',
]);

export function isStatusImmune(pokemon: BattlePokemon, status: StatusCondition): boolean {
  const immuneTypes = STATUS_IMMUNITIES[status];
  return pokemon.types.some((type) => immuneTypes.includes(type));
}

export function tryApplyStatus(target: BattlePokemon, status: StatusCondition, messages: string[]): boolean {
  if (target.fainted) return false;
  if (target.statusCondition !== null) {
    messages.push(t('status.already', { name: target.displayName }));
    return false;
  }
  if (isStatusImmune(target, status)) {
    messages.push(t('status.immune', { name: target.displayName }));
    return false;
  }

  target.statusCondition = status;

  if (status === 'badly_poisoned') {
    target.toxicCounter = 1;
  }

  if (status === 'sleep') {
    target.sleepCounter = Math.floor(Math.random() * 3) + 1;
  } else {
    target.sleepCounter = 0;
  }

  messages.push(t(`status.${status}.inflicted`, { name: target.displayName }));
  return true;
}

export function getParalysisSpeedMultiplier(pokemon: BattlePokemon): number {
  return pokemon.statusCondition === 'paralysis' ? 0.5 : 1.0;
}

export function getBurnAttackMultiplier(pokemon: BattlePokemon): number {
  return pokemon.statusCondition === 'burn' ? 0.5 : 1.0;
}

export function checkSleepSkip(pokemon: BattlePokemon, messages: string[]): boolean {
  if (pokemon.statusCondition !== 'sleep') return false;

  pokemon.sleepCounter = Math.max(0, pokemon.sleepCounter - 1);

  if (pokemon.sleepCounter === 0) {
    pokemon.statusCondition = null;
    messages.push(t('status.sleep.wake', { name: pokemon.displayName }));
    return true;
  }

  messages.push(t('status.sleep.still_asleep', { name: pokemon.displayName }));
  return true;
}

export function checkFreezeSkip(
  pokemon: BattlePokemon,
  move: BattleMove,
  messages: string[],
): boolean {
  if (pokemon.statusCondition !== 'freeze') return false;

  if (FROZEN_EXCEPTION_MOVES.has(move.data.name)) {
    pokemon.statusCondition = null;
    messages.push(t('status.freeze.thawed', { name: pokemon.displayName }));
    return false;
  }

  if (Math.random() < 0.2) {
    pokemon.statusCondition = null;
    messages.push(t('status.freeze.thawed', { name: pokemon.displayName }));
    return false;
  }

  messages.push(t('status.freeze.still_frozen', { name: pokemon.displayName }));
  return true;
}

export function checkParalysisSkip(pokemon: BattlePokemon, messages: string[]): boolean {
  if (pokemon.statusCondition !== 'paralysis') return false;
  if (Math.random() < 0.25) {
    messages.push(t('status.paralysis.immobile', { name: pokemon.displayName }));
    return true;
  }
  return false;
}

export function applyEndOfTurnEffects(pokemon: BattlePokemon, messages: string[]): boolean {
  if (pokemon.fainted || pokemon.statusCondition === null) return false;
  let damage = 0;
  switch (pokemon.statusCondition) {
    case 'burn':
      damage = Math.max(1, Math.floor(pokemon.maxHp / 16));
      messages.push(t('status.burn.damage', { name: pokemon.displayName }));
      break;
    case 'poison':
      damage = Math.max(1, Math.floor(pokemon.maxHp / 8));
      messages.push(t('status.poison.damage', { name: pokemon.displayName }));
      break;
    case 'badly_poisoned':
      damage = Math.max(1, Math.floor((pokemon.maxHp * pokemon.toxicCounter) / 16));
      messages.push(t('status.poison.damage', { name: pokemon.displayName }));
      pokemon.toxicCounter++;
      break;
    case 'paralysis':
    case 'sleep':
    case 'freeze':
      return false;
  }
  if (damage > 0) {
    pokemon.currentHp = Math.max(0, pokemon.currentHp - damage);
    if (pokemon.currentHp <= 0) {
      pokemon.fainted = true;
      messages.push(t('status.fainted_by_status', { name: pokemon.displayName }));
      return true;
    }
  }
  return false;
}

export function rollMoveEffect(
  move: { effect?: { type: StatusCondition; chance: number } },
  target: BattlePokemon,
  messages: string[],
): void {
  if (!move.effect) return;
  if (Math.random() * 100 >= move.effect.chance) return;
  tryApplyStatus(target, move.effect.type, messages);
}
