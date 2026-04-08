import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { GymData, State } from './types.js';
import { PLUGIN_ROOT } from './paths.js';

const gymCache = new Map<string, GymData[]>();

/** Load gym data for a generation. */
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

  // Award XP to all participating pokemon
  for (const name of participatingPokemon) {
    const poke = state.pokemon[name];
    if (poke) {
      poke.xp += xp;
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
