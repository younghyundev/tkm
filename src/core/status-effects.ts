import { t } from '../i18n/index.js';
import type { BattlePokemon, StatusCondition } from './types.js';

const STATUS_IMMUNITIES: Record<StatusCondition, string[]> = {
  poison: ['poison'],
  badly_poisoned: ['poison'],
  burn: ['fire'],
  paralysis: ['electric'],
};

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
  messages.push(t(`status.${status}.inflicted`, { name: target.displayName }));
  return true;
}

export function getParalysisSpeedMultiplier(pokemon: BattlePokemon): number {
  return pokemon.statusCondition === 'paralysis' ? 0.5 : 1.0;
}

export function getBurnAttackMultiplier(pokemon: BattlePokemon): number {
  return pokemon.statusCondition === 'burn' ? 0.5 : 1.0;
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
