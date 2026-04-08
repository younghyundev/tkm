import { getPokemonDB, getPokemonName } from './pokemon-data.js';
import { getRawTypeMultiplier, applyTypeDampening } from './type-chart.js';
import { markSeen, markCaught } from './pokedex.js';
import { getItemCount, useItem } from './items.js';
import { getTypeMasterXpMultiplier } from './pokedex-rewards.js';
import { levelToXp } from './xp.js';
import { t } from '../i18n/index.js';
import { readCommonState } from './state.js';
import { isShinyKey, toBaseId, toShinyKey } from './shiny-utils.js';
import type { State, Config, BattleResult, WildPokemon } from './types.js';

/**
 * Calculate Poké Ball cost based on catch_rate.
 * Formula: ceil(e^(4.5 × (1 - catch_rate/255)))
 * catch_rate 255 → 1 ball, catch_rate 3 → 82 balls
 */
export function getBallCost(catchRate: number): number {
  return Math.max(1, Math.ceil(Math.exp(4.5 * (1 - catchRate / 255))));
}

/** Calculate pokeball loss on battle defeat based on level gap. Max 5. */
export function defeatBallLoss(wildLevel: number, attackerLevel: number): number {
  const levelGap = Math.max(0, wildLevel - attackerLevel);
  // 0-4: 0, 5: 1, 6-10: 2, 11-15: 3, 16-20: 4, 21+: 5
  return levelGap < 5 ? 0 : Math.min(5, Math.ceil(levelGap / 5));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Core combat score: type × level × stat factors (before EV and clamping).
 * Shared by calculateWinRate and relativeCombatPower to prevent formula divergence.
 */
function baseCombatScore(
  attackerTypes: string[],
  defenderTypes: string[],
  attackerLevel: number,
  defenderLevel: number,
  attackerStats: { attack: number; defense: number; speed: number },
  defenderStats: { attack: number; defense: number; speed: number },
): { score: number; typeMultiplier: number } {
  // Type matchup with dampening
  const rawType = getRawTypeMultiplier(attackerTypes, defenderTypes);
  const typeMultiplier = applyTypeDampening(rawType);

  // Level difference factor with level-scaled dampening
  // Low levels: steep curve (Lv.1 vs 5 ≈ 15%)
  // High levels: flatter curve (Lv.51 vs 55 ≈ 37%)
  const levelDiff = attackerLevel - defenderLevel;
  const avgLevel = (attackerLevel + defenderLevel) / 2;
  const levelFactor = sigmoid(levelDiff / (2 + avgLevel * 0.1));

  // Base stat comparison (offense vs defense, symmetric at equal stats)
  const statRatio = (attackerStats.attack + attackerStats.speed) /
    Math.max(1, defenderStats.defense + defenderStats.speed);
  const statFactor = Math.max(0.5, Math.min(1.5, statRatio));

  return { score: typeMultiplier * levelFactor * statFactor, typeMultiplier };
}

/**
 * Calculate win probability for attacker vs defender.
 */
export function calculateWinRate(
  attackerTypes: string[],
  defenderTypes: string[],
  attackerLevel: number,
  defenderLevel: number,
  attackerStats: { attack: number; defense: number; speed: number },
  defenderStats: { attack: number; defense: number; speed: number },
  attackerEv: number = 0,
): { winRate: number; typeMultiplier: number } {
  const { score, typeMultiplier } = baseCombatScore(
    attackerTypes, defenderTypes, attackerLevel, defenderLevel, attackerStats, defenderStats,
  );

  // EV (Effort Value) factor — 1.0x at ev=0, 1.252x at ev=252
  const evFactor = 1.0 + (attackerEv / 252) * 0.252;

  // Final win probability (equal level + neutral type + equal stats + ev=0 = 50%)
  const rawWinRate = score * evFactor;
  const winRate = Math.max(0.03, Math.min(0.95, rawWinRate));

  return { winRate, typeMultiplier };
}

/**
 * Calculate relative combat power of a party pokemon against a wild pokemon.
 * Returns raw score (before EV/clamping) for comparison between party members.
 */
function relativeCombatPower(
  attackerTypes: string[],
  defenderTypes: string[],
  attackerLevel: number,
  defenderLevel: number,
  attackerStats: { attack: number; defense: number; speed: number },
  defenderStats: { attack: number; defense: number; speed: number },
): number {
  return baseCombatScore(
    attackerTypes, defenderTypes, attackerLevel, defenderLevel, attackerStats, defenderStats,
  ).score;
}

/**
 * Geometric series ratio for party multiplier.
 * 6 equal-power members → 1 + r + r² + r³ + r⁴ + r⁵ = 1.5
 * Solving: r ≈ 0.337
 */
const PARTY_GEO_RATIO = 0.337;

/**
 * Calculate party multiplier based on relative combat power of all party members.
 * Each member's contribution is weighted by geometric series (r ≈ 0.337).
 * 1 member = 1.0x, 6 equal members = 1.5x max.
 */
export function calculatePartyMultiplier(
  config: Config,
  state: State,
  wildTypes: string[],
  wildLevel: number,
  wildStats: { attack: number; defense: number; speed: number },
): { multiplier: number; bestFighter: string } {
  const db = getPokemonDB();

  // Calculate relative combat power for each party member
  const scores: Array<{ name: string; score: number }> = [];
  for (const name of config.party) {
    const pData = db.pokemon[toBaseId(name)];
    if (!pData) continue;
    const level = state.pokemon[name]?.level ?? 1;
    const score = relativeCombatPower(
      pData.types, wildTypes, level, wildLevel, pData.base_stats, wildStats,
    );
    scores.push({ name, score });
  }

  if (scores.length === 0) return { multiplier: 1.0, bestFighter: config.party[0] };

  // Sort by relative combat power (descending)
  scores.sort((a, b) => b.score - a.score);

  const bestScore = scores[0].score;
  if (bestScore <= 0) return { multiplier: 1.0, bestFighter: scores[0].name };

  // Geometric series: first member = 1.0, rest = r^i × (score_i / bestScore)
  let multiplier = 1.0;
  for (let i = 1; i < scores.length; i++) {
    const weight = Math.pow(PARTY_GEO_RATIO, i);
    const normalizedPower = scores[i].score / bestScore;
    multiplier += weight * normalizedPower;
  }

  // Clamp to [1.0, 1.5]
  multiplier = Math.max(1.0, Math.min(1.5, multiplier));

  return { multiplier, bestFighter: scores[0].name };
}

/**
 * Select the best party pokemon to fight the wild pokemon.
 * Picks the one with best relative combat power against the specific wild pokemon.
 */
export function selectBattlePokemon(config: Config, state: State, wildTypes: string[]): string {
  const db = getPokemonDB();
  let best = config.party[0];
  let bestScore = -Infinity;

  for (const name of config.party) {
    const pData = db.pokemon[toBaseId(name)];
    if (!pData) continue;
    const raw = getRawTypeMultiplier(pData.types, wildTypes);
    const level = state.pokemon[name]?.level ?? 1;
    const score = raw * 100 + level; // type advantage weighted heavily
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  return best;
}

const RARITY_BONUS: Record<string, number> = {
  common: 0, uncommon: 30, rare: 80, legendary: 200, mythical: 500,
};

/**
 * Calculate battle XP reward.
 */
export function calculateBattleXp(
  wildLevel: number,
  wildRarity: string,
  typeDisadvantage: boolean,
  xpBonusMultiplier: number,
  won: boolean,
): number {
  const base = 50;
  const levelBonus = wildLevel * 3;
  const typeBonus = typeDisadvantage ? 20 : 0;
  const rarityBonus = RARITY_BONUS[wildRarity] ?? 0;

  const totalXp = Math.floor((base + levelBonus + typeBonus + rarityBonus) * xpBonusMultiplier);

  return won ? totalXp : 0;
}

/**
 * Resolve a battle between a party pokemon and a wild pokemon.
 */
export function resolveBattle(
  state: State,
  config: Config,
  wild: WildPokemon,
  restMult: number = 1.0,
): BattleResult | null {
  const db = getPokemonDB();
  const wildData = db.pokemon[wild.name];
  if (!wildData) return null;
  if (config.party.length === 0) return null;

  // Select best fighter using party combat power
  const { multiplier: partyMultiplier, bestFighter } = calculatePartyMultiplier(
    config, state, wildData.types, wild.level, wildData.base_stats,
  );
  const attacker = bestFighter;
  const attackerData = db.pokemon[toBaseId(attacker)];
  if (!attackerData) return null;

  const attackerLevel = state.pokemon[attacker]?.level ?? 1;

  // Calculate base win rate (1v1)
  const { winRate: baseWinRate, typeMultiplier } = calculateWinRate(
    attackerData.types,
    wildData.types,
    attackerLevel,
    wild.level,
    attackerData.base_stats,
    wildData.base_stats,
    state.pokemon[attacker]?.ev ?? 0,
  );

  // Apply party multiplier and clamp
  const winRate = Math.max(0.03, Math.min(0.95, baseWinRate * partyMultiplier));

  // Roll battle outcome
  const won = Math.random() < winRate;

  // Type disadvantage check (for XP bonus)
  const typeDisadvantage = typeMultiplier < 1.0;

  // Calculate XP (with type master 1.2x bonus)
  const commonXpBonus = readCommonState().xp_bonus_multiplier;
  const xpBonus = config.xp_bonus_multiplier + Math.max(0, state.xp_bonus_multiplier - 1.0) + commonXpBonus;
  const typeMasterMult = getTypeMasterXpMultiplier(state, attackerData.types, wildData.types);
  const totalBattleXp = Math.floor(calculateBattleXp(wild.level, wildData.rarity, typeDisadvantage, xpBonus, won) * typeMasterMult);
  // All party members receive the full XP (not divided), with rest bonus
  const xpPerPokemon = Math.floor(Math.max(1, totalBattleXp) * restMult);

  // Update state
  state.battle_count++;
  if (won) {
    state.battle_wins++;
  } else {
    state.battle_losses++;
  }

  // Award EV to all party pokemon on win (cap 252)
  if (won) {
    for (const name of config.party) {
      if (!state.pokemon[name]) continue;
      state.pokemon[name].ev = Math.min((state.pokemon[name].ev ?? 0) + 1, 252);
    }
  }

  // Apply battle XP to all party pokemon
  for (const name of config.party) {
    if (!state.pokemon[name]) continue;
    state.pokemon[name].xp += xpPerPokemon;
  }

  // Mark pokemon as seen
  markSeen(state, wild.name);

  // On defeat: lose pokeballs proportional to level gap
  let ballCost = 0;
  if (!won) {
    const lossCount = defeatBallLoss(wild.level, attackerLevel);
    if (lossCount > 0) {
      const available = getItemCount(state, 'pokeball');
      const actualLoss = Math.min(lossCount, available);
      for (let i = 0; i < actualLoss; i++) useItem(state, 'pokeball');
      ballCost = actualLoss;
    }
  }

  // Catch on victory (requires pokeballs based on catch_rate)
  let caught = false;
  if (won) {
    const alreadyCaught = state.pokedex[wild.name]?.caught ?? false;
    const alreadyShinyCaught = state.pokedex[wild.name]?.shiny_caught ?? false;
    // Allow catch if: never caught, OR shiny variant not yet caught
    const shouldAttemptCatch = !alreadyCaught || (wild.shiny && !alreadyShinyCaught);
    if (shouldAttemptCatch) {
      ballCost = getBallCost(wildData.catch_rate);
      const hasBalls = getItemCount(state, 'pokeball') >= ballCost;
      if (hasBalls) {
        for (let i = 0; i < ballCost; i++) useItem(state, 'pokeball');
        caught = true;
        markCaught(state, wild.name);
        state.catch_count++;
        // Use shiny key for separate storage
        const stateKey = wild.shiny ? toShinyKey(wild.name) : wild.name;
        if (!state.unlocked.includes(stateKey)) {
          state.unlocked.push(stateKey);
        }
        if (!state.pokemon[stateKey]) {
          const catchXp = levelToXp(wild.level, wildData.exp_group);
          state.pokemon[stateKey] = { id: wildData.id, xp: catchXp, level: wild.level, friendship: 0, ev: 0 };
        }
      }
      // Not enough balls: markSeen already called above, XP already awarded. No catch.
    }
  }

  const defenderKey = (caught && wild.shiny) ? toShinyKey(wild.name) : wild.name;
  return {
    attacker,
    defender: defenderKey,
    defenderLevel: wild.level,
    winRate,
    won,
    xpReward: xpPerPokemon,
    caught,
    typeMultiplier,
    ballCost,
    shiny: wild.shiny,
  };
}

/**
 * Format battle result as notification message.
 */
export function formatBattleMessage(result: BattleResult): string {
  const isShiny = result.shiny ?? false;
  const defenderName = getPokemonName(result.defender, undefined, isShiny);
  let prefix = '';
  if (isShiny) {
    prefix = t('battle.shiny_appeared', { pokemon: defenderName }) + '\n';
  }
  if (result.won) {
    let msg = t('battle.win', { defender: defenderName, level: result.defenderLevel, xp: result.xpReward });
    if (result.caught) {
      if (result.partyFull) {
        msg += t('battle.win_catch_no_hint', { defender: defenderName });
      } else {
        msg += t('battle.win_catch', { defender: defenderName });
      }
      if (result.ballCost > 1) {
        msg += ` (🔴×${result.ballCost})`;
      }
      if (isShiny) {
        msg += t('battle.shiny_catch');
      }
    } else if (result.ballCost > 0 && !result.caught) {
      // Won but couldn't catch — not enough balls
      msg += ` ${t('battle.need_balls', { defender: defenderName })}`;
    }
    return prefix + msg;
  }

  let msg = t('battle.lose', { defender: defenderName, level: result.defenderLevel, xp: result.xpReward });
  if (result.ballCost > 0) {
    msg += '\n' + t('battle.lose_balls', { count: result.ballCost });
  }
  if (isShiny) {
    msg += t('battle.shiny_escaped', { pokemon: defenderName });
  }
  return prefix + msg;
}
