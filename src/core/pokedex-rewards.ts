import { getPokemonDB, getPokedexRewardsDB } from './pokemon-data.js';
import { addItem } from './items.js';
import type { State, Config, MilestoneReward } from './types.js';

/**
 * Count non-legendary caught pokemon (milestone counting rule).
 */
export function countNonLegendaryCaught(state: State): number {
  const db = getPokemonDB();
  let count = 0;
  for (const [name, entry] of Object.entries(state.pokedex)) {
    if (!entry.caught) continue;
    const pData = db.pokemon[name];
    if (pData && pData.rarity !== 'legendary' && pData.rarity !== 'mythical') {
      count++;
    }
  }
  return count;
}

export interface MilestoneClaimResult {
  milestone: MilestoneReward;
  legendaryBonus?: string;
}

/**
 * Check and claim eligible pokedex milestone rewards.
 * Returns list of newly claimed milestones.
 */
export function checkMilestoneRewards(state: State, config: Config): MilestoneClaimResult[] {
  const rewardsDB = getPokedexRewardsDB();
  const caught = countNonLegendaryCaught(state);
  const claimed: MilestoneClaimResult[] = [];

  for (const milestone of rewardsDB.milestones) {
    if (state.pokedex_milestones_claimed.includes(milestone.id)) continue;
    if (caught < milestone.threshold) continue;

    // Claim the milestone
    state.pokedex_milestones_claimed.push(milestone.id);

    switch (milestone.reward_type) {
      case 'pokeball':
        addItem(state, 'pokeball', milestone.reward_value as number);
        break;
      case 'xp_multiplier':
        state.xp_bonus_multiplier += milestone.reward_value as number;
        break;
      case 'legendary_unlock': {
        const groupId = milestone.reward_value as string;
        const group = rewardsDB.legendary_groups[groupId];
        if (group) {
          const alreadyPending = state.legendary_pending.some(p => p.group === groupId);
          if (!alreadyPending) {
            state.legendary_pending.push({ group: groupId, options: [...group.options] });
          }
        }
        break;
      }
      case 'party_slot':
        config.max_party_size = Math.min(config.max_party_size + (milestone.reward_value as number), 9);
        break;
      case 'title':
        if (!state.titles.includes(milestone.reward_value as string)) {
          state.titles.push(milestone.reward_value as string);
        }
        break;
    }

    const result: MilestoneClaimResult = { milestone };
    // Legendary bonus for complete milestone
    if (milestone.legendary_bonus) {
      result.legendaryBonus = milestone.legendary_bonus;
      // Direct add to legendary_pool for encounter
      if (!state.legendary_pool.includes(milestone.legendary_bonus)) {
        state.legendary_pool.push(milestone.legendary_bonus);
      }
    }
    claimed.push(result);
  }

  return claimed;
}

/**
 * Check type master status.
 * A type is mastered when all non-legendary pokemon of that type are caught.
 * Returns list of newly mastered types.
 */
export function checkTypeMasters(state: State): string[] {
  const db = getPokemonDB();
  const rewardsDB = getPokedexRewardsDB();
  const newMasters: string[] = [];

  // Build type → pokemon map (non-legendary only)
  const typeMap: Record<string, string[]> = {};
  for (const [name, pData] of Object.entries(db.pokemon)) {
    if (pData.rarity === 'legendary' || pData.rarity === 'mythical') continue;
    for (const type of pData.types) {
      if (!typeMap[type]) typeMap[type] = [];
      typeMap[type].push(name);
    }
  }

  for (const [type, pokemonList] of Object.entries(typeMap)) {
    if (state.type_masters.includes(type)) continue;
    const allCaught = pokemonList.every(name => state.pokedex[name]?.caught);
    if (allCaught) {
      state.type_masters.push(type);
      newMasters.push(type);
    }
  }

  // Check if threshold met for special legendary unlock
  if (state.type_masters.length >= rewardsDB.type_master.legendary_unlock_threshold) {
    const groupId = rewardsDB.type_master.legendary_group;
    const alreadyPending = state.legendary_pending.some(p => p.group === groupId);
    const alreadyClaimed = state.pokedex_milestones_claimed.includes(`type_master_legendary:${groupId}`);
    if (!alreadyPending && !alreadyClaimed) {
      const group = rewardsDB.type_master.special_legends;
      state.legendary_pending.push({ group: groupId, options: [...group.options] });
    }
  }

  return newMasters;
}

/**
 * Check evolution chain completion and award pokeball rewards.
 * Returns number of newly completed chains.
 */
export function checkChainCompletion(state: State): number {
  const db = getPokemonDB();
  const rewardsDB = getPokedexRewardsDB();
  let newCompletions = 0;

  const completedChains = state.completed_chains;

  // Group by evolution line (use first member as chain key)
  const chains: Record<string, string[]> = {};
  for (const [name, pData] of Object.entries(db.pokemon)) {
    if (pData.rarity === 'legendary' || pData.rarity === 'mythical') continue;
    const lineKey = pData.line[0];
    if (!chains[lineKey]) chains[lineKey] = [];
    if (!chains[lineKey].includes(name)) {
      chains[lineKey].push(name);
    }
  }

  for (const [lineKey, members] of Object.entries(chains)) {
    if (completedChains.includes(lineKey)) continue;
    if (members.length < 2) continue; // Single-stage pokemon don't count
    const allCaught = members.every(name => state.pokedex[name]?.caught);
    if (allCaught) {
      completedChains.push(lineKey);
      addItem(state, 'pokeball', rewardsDB.chain_completion_reward.pokeball_count);
      newCompletions++;
    }
  }

  return newCompletions;
}

/**
 * Check if a pokemon's type matches any mastered type (for 1.2x XP bonus).
 */
export function hasTypeMasterBonus(state: State, pokemonTypes: string[]): boolean {
  return pokemonTypes.some(type => state.type_masters.includes(type));
}

/**
 * Get type master XP multiplier (1.0 if no match, 1.2 if match).
 */
export function getTypeMasterXpMultiplier(state: State, attackerTypes: string[], defenderTypes: string[]): number {
  const rewardsDB = getPokedexRewardsDB();
  if (hasTypeMasterBonus(state, attackerTypes) || hasTypeMasterBonus(state, defenderTypes)) {
    return rewardsDB.type_master.xp_bonus;
  }
  return 1.0;
}

/**
 * Get type master progress for display.
 */
export function getTypeMasterProgress(state: State): Array<{ type: string; caught: number; total: number; mastered: boolean }> {
  const db = getPokemonDB();
  const typeMap: Record<string, string[]> = {};

  for (const [name, pData] of Object.entries(db.pokemon)) {
    if (pData.rarity === 'legendary' || pData.rarity === 'mythical') continue;
    for (const type of pData.types) {
      if (!typeMap[type]) typeMap[type] = [];
      typeMap[type].push(name);
    }
  }

  const progress: Array<{ type: string; caught: number; total: number; mastered: boolean }> = [];
  for (const [type, pokemonList] of Object.entries(typeMap)) {
    const caught = pokemonList.filter(name => state.pokedex[name]?.caught).length;
    progress.push({
      type,
      caught,
      total: pokemonList.length,
      mastered: state.type_masters.includes(type),
    });
  }

  // Sort: mastered first, then by completion percentage descending
  progress.sort((a, b) => {
    if (a.mastered !== b.mastered) return a.mastered ? -1 : 1;
    return (b.caught / b.total) - (a.caught / a.total);
  });

  return progress;
}
