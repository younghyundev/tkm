import { getPokemonDB } from './pokemon-data.js';
import { getRawTypeMultiplier, applyTypeDampening } from './type-chart.js';
import { markSeen, markCaught } from './pokedex.js';
import { rollItemDrop, shouldAutoRetry, useItem } from './items.js';
import type { State, Config, BattleResult } from './types.js';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
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
): { winRate: number; typeMultiplier: number } {
  // Step 1: Type matchup with dampening
  const rawType = getRawTypeMultiplier(attackerTypes, defenderTypes);
  const typeMultiplier = applyTypeDampening(rawType);

  // Step 2: Level difference factor (steep curve like original Pokémon)
  // sigmoid(0)=0.5, sigmoid(-2.67)≈0.065, sigmoid(3.33)≈0.97
  const levelDiff = attackerLevel - defenderLevel;
  const levelFactor = sigmoid(levelDiff / 3);

  // Step 3: Base stat comparison (offense vs defense, symmetric at equal stats)
  const statRatio = (attackerStats.attack + attackerStats.speed) /
    Math.max(1, defenderStats.defense + defenderStats.speed);
  const statFactor = Math.max(0.5, Math.min(1.5, statRatio));

  // Step 4: Final win probability
  // Equal level + neutral type + equal stats = 50%
  // Lv.4 vs Lv.12 ≈ 17%, Lv.20 vs Lv.10 ≈ 88%
  const rawWinRate = typeMultiplier * levelFactor * statFactor;
  const winRate = Math.max(0.03, Math.min(0.95, rawWinRate));

  return { winRate, typeMultiplier };
}

/**
 * Calculate relative combat power of a party pokemon against a wild pokemon.
 * Uses the same factors as calculateWinRate but returns a raw score for comparison.
 */
function relativeCombatPower(
  attackerTypes: string[],
  defenderTypes: string[],
  attackerLevel: number,
  defenderLevel: number,
  attackerStats: { attack: number; defense: number; speed: number },
  defenderStats: { attack: number; defense: number; speed: number },
): number {
  const rawType = getRawTypeMultiplier(attackerTypes, defenderTypes);
  const typeMultiplier = applyTypeDampening(rawType);
  const levelDiff = attackerLevel - defenderLevel;
  const levelFactor = sigmoid(levelDiff / 3);
  const statRatio = (attackerStats.attack + attackerStats.speed) /
    Math.max(1, defenderStats.defense + defenderStats.speed);
  const statFactor = Math.max(0.5, Math.min(1.5, statRatio));
  return typeMultiplier * levelFactor * statFactor;
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
    const pData = db.pokemon[name];
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
    const pData = db.pokemon[name];
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
  wildName: string,
  wildLevel: number,
): BattleResult | null {
  const db = getPokemonDB();
  const wildData = db.pokemon[wildName];
  if (!wildData) return null;
  if (config.party.length === 0) return null;

  // Select best fighter using party combat power
  const { multiplier: partyMultiplier, bestFighter } = calculatePartyMultiplier(
    config, state, wildData.types, wildLevel, wildData.base_stats,
  );
  const attacker = bestFighter;
  const attackerData = db.pokemon[attacker];
  if (!attackerData) return null;

  const attackerLevel = state.pokemon[attacker]?.level ?? 1;

  // Calculate base win rate (1v1)
  const { winRate: baseWinRate, typeMultiplier } = calculateWinRate(
    attackerData.types,
    wildData.types,
    attackerLevel,
    wildLevel,
    attackerData.base_stats,
    wildData.base_stats,
  );

  // Apply party multiplier and clamp
  const winRate = Math.max(0.03, Math.min(0.95, baseWinRate * partyMultiplier));

  // Roll (with auto-retry on defeat)
  let won = Math.random() < winRate;
  let retryUsed = false;
  if (!won && shouldAutoRetry(state, config, winRate)) {
    useItem(state, 'retry_token');
    won = Math.random() < winRate;
    retryUsed = true;
  }

  // Type disadvantage check (for XP bonus)
  const typeDisadvantage = typeMultiplier < 1.0;

  // Calculate XP
  const xpBonus = Math.max(config.xp_bonus_multiplier, state.xp_bonus_multiplier);
  const totalBattleXp = calculateBattleXp(wildLevel, wildData.rarity, typeDisadvantage, xpBonus, won);
  const xpPerPokemon = Math.max(1, Math.floor(totalBattleXp / Math.max(1, config.party.length)));

  // Update state
  state.battle_count++;
  if (won) {
    state.battle_wins++;
  } else {
    state.battle_losses++;
  }

  // Apply battle XP to all party pokemon
  for (const name of config.party) {
    if (!state.pokemon[name]) continue;
    state.pokemon[name].xp += xpPerPokemon;
  }

  // Item drop
  rollItemDrop(state, won);

  // Mark pokemon as seen
  markSeen(state, wildName);

  // Catch on first victory
  let caught = false;
  if (won) {
    const alreadyCaught = state.pokedex[wildName]?.caught ?? false;
    if (!alreadyCaught) {
      caught = true;
      markCaught(state, wildName);
      state.catch_count++;
      if (!state.unlocked.includes(wildName)) {
        state.unlocked.push(wildName);
      }
      if (!state.pokemon[wildName]) {
        state.pokemon[wildName] = { id: wildData.id, xp: 0, level: wildLevel, friendship: 0 };
      }
    }
  }

  return {
    attacker,
    defender: wildName,
    defenderLevel: wildLevel,
    winRate,
    won,
    xpReward: xpPerPokemon,
    caught,
    typeMultiplier,
  };
}

/**
 * Format battle result as notification message.
 */
export function formatBattleMessage(result: BattleResult): string {
  const rarityIcons: Record<string, string> = {
    common: '', uncommon: '★', rare: '★★', legendary: '★★★', mythical: '★★★★',
  };

  if (result.won) {
    let msg = `⚔️ vs 야생 ${result.defender} (Lv.${result.defenderLevel}) → 승리! (XP +${result.xpReward})`;
    if (result.caught) {
      msg += `\n🎉 ${result.defender}을(를) 포획했습니다! (tokenmon party add ${result.defender})`;
    }
    return msg;
  }

  return `⚔️ vs 야생 ${result.defender} (Lv.${result.defenderLevel}) → 패배... (XP +${result.xpReward})`;
}
