import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { GymData, State, Config } from './types.js';
import { PLUGIN_ROOT } from './paths.js';
import { getRegionsDB } from './pokemon-data.js';

const gymCache = new Map<string, GymData[]>();

/**
 * Load gym data for a generation.
 * Note: generation is determined by filename (genN.json).
 * The 'region' field in records is informational and should match the filename.
 */
export function loadGymData(generation: string): GymData[] {
  const cached = gymCache.get(generation);
  if (cached) return cached;

  const filePath = join(PLUGIN_ROOT, 'data', 'gyms', `${generation}.json`);
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const gyms: GymData[] = data.gyms ?? [];
    // Validate: every gym must have at least 1 team member
    for (const gym of gyms) {
      if (!gym.team || gym.team.length === 0) {
        throw new Error(`Gym "${gym.badge}" has no team members in ${generation}.json`);
      }
    }
    gymCache.set(generation, gyms);
    return gyms;
  } catch {
    return [];
  }
}

export interface GymGateResult {
  allowed: boolean;
  reason?: string;
  caught: number;
  requiredCaught: number;
  avgLevel: number;
  requiredLevel: number;
}

/**
 * Check if the player can challenge a gym.
 * Condition A: Caught >= 25% of the gym's region pokemon pool
 * Condition B: Party average level >= gym's lowest team member level × 60%
 */
export function canChallengeGym(gym: GymData, state: State, config: Config, generation: string): GymGateResult {
  const regionsDB = getRegionsDB(generation);
  const region = regionsDB.regions[gym.region];

  // If region not found, fail closed — data integrity issue
  if (!region) {
    return { allowed: false, reason: 'gym.region_data_missing', caught: 0, requiredCaught: 0, avgLevel: 0, requiredLevel: 0 };
  }

  // Champion gym (id 9) requires all 8 badges
  if (gym.id === 9) {
    const badges = state.gym_badges ?? [];
    if (badges.length < 8) {
      return {
        allowed: false,
        reason: 'champion_badge_required',
        caught: 0,
        requiredCaught: 0,
        avgLevel: 0,
        requiredLevel: 0,
      };
    }
  }

  // Condition A: 25% of region pokemon pool caught
  const pool = region.pokemon_pool;

  // Defense: if pool is empty, skip pokedex condition entirely
  if (pool.length === 0) {
    // Only use level gate when pool is empty
    const lowestGymLevel = Math.min(...gym.team.map(p => p.level));
    const requiredLevel = Math.ceil(lowestGymLevel * 0.6);

    let totalLevel = 0;
    let partyCount = 0;
    for (const name of (config.party ?? [])) {
      const poke = state.pokemon[name];
      if (poke) {
        totalLevel += poke.level;
        partyCount++;
      }
    }
    const avgLevel = partyCount > 0 ? Math.floor(totalLevel / partyCount) : 0;
    const levelMet = avgLevel >= requiredLevel;

    return {
      allowed: levelMet,
      caught: 0,
      requiredCaught: 0,
      avgLevel,
      requiredLevel,
    };
  }

  const pokedex = state.pokedex ?? {};
  const caughtCount = pool.filter(id => pokedex[id]?.caught).length;
  const requiredCaught = Math.ceil(pool.length * 0.25);
  const pokedexMet = caughtCount >= requiredCaught;

  // Condition B: party avg level >= lowest gym team level × 60%
  const lowestGymLevel = Math.min(...gym.team.map(p => p.level));
  const requiredLevel = Math.ceil(lowestGymLevel * 0.6);

  let totalLevel = 0;
  let partyCount = 0;
  for (const name of (config.party ?? [])) {
    const poke = state.pokemon[name];
    if (poke) {
      totalLevel += poke.level;
      partyCount++;
    }
  }
  const avgLevel = partyCount > 0 ? Math.floor(totalLevel / partyCount) : 0;
  const levelMet = avgLevel >= requiredLevel;

  if (pokedexMet || levelMet) {
    return { allowed: true, caught: caughtCount, requiredCaught, avgLevel, requiredLevel };
  }

  return { allowed: false, caught: caughtCount, requiredCaught, avgLevel, requiredLevel };
}

/** Get the next uncleared gym. Returns null if all cleared. */
export function getNextGym(generation: string, state: State): GymData | null {
  const gyms = loadGymData(generation);
  const badges = state.gym_badges ?? [];
  for (const gym of gyms) {
    if (!badges.includes(gym.badge)) return gym;
  }
  return null;
}

/** Get a specific gym by ID. */
export function getGymById(generation: string, gymId: number): GymData | undefined {
  const gyms = loadGymData(generation);
  return gyms.find(g => g.id === gymId);
}

export interface GymVictoryResult {
  xpAwarded: number;
  badgeEarned: boolean;
  badge: string;
}

/** Award victory rewards. Mutates state. */
export function awardGymVictory(
  state: State,
  gym: GymData,
  participatingPokemon: string[],
  dispatchMultipliers?: Map<string, number>,
): GymVictoryResult {
  if (gym.team.length === 0) {
    return { xpAwarded: 0, badgeEarned: false, badge: gym.badge };
  }

  const badges = state.gym_badges ?? [];
  const alreadyHasBadge = badges.includes(gym.badge);

  // XP = highest level pokemon on leader's team x 50
  const maxLevel = Math.max(...gym.team.map(p => p.level));
  let xp = maxLevel * 50;

  // Re-challenge: 50% XP, no duplicate badge
  if (alreadyHasBadge) {
    xp = Math.floor(xp / 2);
  }

  // Award XP to all participating pokemon (with dispatch bonus)
  for (const name of participatingPokemon) {
    const poke = state.pokemon[name];
    if (poke) {
      const dispatchMult = dispatchMultipliers?.get(name) ?? 1.0;
      poke.xp += Math.floor(xp * dispatchMult);
    }
  }

  // Add badge if not already earned
  let badgeEarned = false;
  if (!alreadyHasBadge) {
    if (!state.gym_badges) state.gym_badges = [];
    state.gym_badges.push(gym.badge);
    badgeEarned = true;
  }

  return { xpAwarded: xp, badgeEarned, badge: gym.badge };
}

/** Clear cache (for testing). */
export function _resetGymCache(): void {
  gymCache.clear();
}
