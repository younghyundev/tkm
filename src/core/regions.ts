import { getRegionsDB } from './pokemon-data.js';
import { getCompletion } from './pokedex.js';
import type { State, Config, RegionData } from './types.js';

/**
 * Get the current region data.
 */
export function getCurrentRegion(config: Config): RegionData {
  const db = getRegionsDB();
  return db.regions[config.current_region] ?? db.regions[db.default_region];
}

/**
 * Check if a region is unlocked for the player.
 */
export function isRegionUnlocked(regionName: string, state: State): boolean {
  const db = getRegionsDB();
  const region = db.regions[regionName];
  if (!region) return false;
  if (!region.unlock_condition) return true;

  const completion = getCompletion(state);
  switch (region.unlock_condition.type) {
    case 'pokedex_seen':
      return completion.seen >= region.unlock_condition.value;
    case 'pokedex_caught':
      return completion.caught >= region.unlock_condition.value;
    default:
      return false;
  }
}

/**
 * Move to a new region. Returns error message or null on success.
 */
export function moveToRegion(regionName: string, state: State, config: Config): string | null {
  const db = getRegionsDB();
  if (!db.regions[regionName]) {
    return `"${regionName}" 지역을 찾을 수 없습니다.`;
  }
  if (!isRegionUnlocked(regionName, state)) {
    const cond = db.regions[regionName].unlock_condition!;
    const label = cond.type === 'pokedex_caught' ? '포획' : '발견';
    return `이 지역은 포켓몬 ${cond.value}종 ${label} 후 해금됩니다.`;
  }
  config.current_region = regionName;
  return null;
}

/**
 * Get all regions with their unlock status.
 */
export function getRegionList(state: State): Array<{ region: RegionData; unlocked: boolean }> {
  const db = getRegionsDB();
  return Object.values(db.regions)
    .sort((a, b) => a.id - b.id)
    .map(region => ({
      region,
      unlocked: isRegionUnlocked(region.name, state),
    }));
}
