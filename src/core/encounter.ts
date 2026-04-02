import { getPokemonDB, getRegionsDB, getEventsDB } from './pokemon-data.js';
import { resolveBattle, formatBattleMessage } from './battle.js';
import type { State, Config, EncounterResult, BattleResult, TimeEvent, DayEvent, StreakEvent, MilestoneEvent } from './types.js';

const BASE_ENCOUNTER_RATE = 0.15;

/**
 * Roll whether an encounter happens.
 * Returns true if an encounter should occur.
 */
export function rollEncounter(state: State, config: Config): boolean {
  const regionsDB = getRegionsDB();
  const region = regionsDB.regions[config.current_region];
  if (!region) return false;

  // Calculate average party level
  const partyLevels = config.party
    .map(name => state.pokemon[name]?.level ?? 1)
    .filter(l => l > 0);
  const avgLevel = partyLevels.length > 0
    ? partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length
    : 1;

  // Region level penalty
  const penalty = avgLevel < region.level_range[0] ? -0.05 : 0;
  const rate = Math.max(0.05, Math.min(0.25, BASE_ENCOUNTER_RATE + penalty));

  return Math.random() < rate;
}

/**
 * Get the minimum wild level for a pokemon based on its evolution stage.
 * Stage 0 → 1 (no restriction).
 * Stage N → evolves_at of the previous stage entry in the line.
 * Cross-gen evolutions (line is incomplete or loops back to self) → falls back to 1.
 */
export function getMinWildLevel(name: string): number {
  const db = getPokemonDB();
  const pData = db.pokemon[name];
  if (!pData || pData.stage === 0) return 1;

  const prevId = pData.line[pData.stage - 1];
  // Guard: cross-gen evolutions where line doesn't include pre-evos from prior gen
  if (!prevId || prevId === name) return 1;

  const prevData = db.pokemon[prevId];
  // Guard: prevData loops back to same or higher stage (malformed line)
  if (!prevData || prevData.stage >= pData.stage) return 1;

  return prevData.evolves_at ?? 1;
}

/**
 * Roll a wild level for a pokemon, respecting evolution minimum level.
 */
function rollWildLevel(name: string, regionMin: number, regionMax: number): number {
  const evoMin = getMinWildLevel(name);
  const effectiveMin = Math.max(regionMin, evoMin);
  const effectiveMax = Math.max(regionMax, effectiveMin);
  return effectiveMin + Math.floor(Math.random() * (effectiveMax - effectiveMin + 1));
}

export interface ActiveEvents {
  timeEvents: TimeEvent[];
  dayEvents: DayEvent[];
  streakEvents: StreakEvent[];
  milestoneEvents: MilestoneEvent[];
}

/**
 * Get currently active events based on time, day, streak, and milestones.
 */
export function getActiveEvents(state: State): ActiveEvents {
  const eventsDB = getEventsDB();
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0=Sun, 6=Sat

  const timeEvents = eventsDB.time_of_day.filter(e => e.hours.includes(currentHour));
  const dayEvents = eventsDB.day_of_week.filter(e => e.day === currentDay);
  const streakEvents = eventsDB.streak.filter(e => state.stats.streak_days >= e.days);
  const milestoneEvents = eventsDB.milestone.filter(e => {
    if (state.events_triggered.includes(e.id)) return false;
    const value = (state as unknown as Record<string, unknown>)[e.trigger_type];
    return typeof value === 'number' && value >= e.trigger_value;
  });

  return { timeEvents, dayEvents, streakEvents, milestoneEvents };
}

/**
 * Select a wild pokemon from the current region's pool, weighted by rarity.
 * Applies active event modifiers (type boosts, rare multiplier, streak guarantee).
 */
export function selectWildPokemon(state: State, config: Config): { name: string; level: number } | null {
  const pokemonDB = getPokemonDB();
  const regionsDB = getRegionsDB();
  const region = regionsDB.regions[config.current_region];
  if (!region) return null;

  const weights = pokemonDB.rarity_weights;
  const pool = region.pokemon_pool
    .map(name => pokemonDB.pokemon[name])
    .filter(Boolean);

  if (pool.length === 0) return null;

  // Get active events
  const events = getActiveEvents(state);

  // Streak guarantee: force rare-only pool
  if (events.streakEvents.length > 0) {
    const rarePool = pool.filter(p => p.rarity === 'rare' || p.rarity === 'legendary');
    if (rarePool.length > 0) {
      const pick = rarePool[Math.floor(Math.random() * rarePool.length)];
      const [minLv, maxLv] = region.level_range;
      return { name: pick.name, level: rollWildLevel(pick.name, minLv, maxLv) };
    }
  }

  // Build weighted selection by rarity
  const weighted: Array<{ name: string; weight: number }> = [];
  for (const p of pool) {
    let w = weights[p.rarity as keyof typeof weights] ?? 0.1;

    // Apply time-of-day type boosts
    for (const te of events.timeEvents) {
      for (const pType of p.types) {
        if (te.type_boost[pType]) {
          w *= te.type_boost[pType];
        }
      }
    }

    // Apply day-of-week rare multiplier
    if (p.rarity === 'rare' || p.rarity === 'legendary') {
      for (const de of events.dayEvents) {
        w *= de.rare_multiplier;
      }
    }

    weighted.push({ name: p.name, weight: w });
  }

  // Normalize and select
  const [minLv, maxLv] = region.level_range;
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { name: entry.name, level: rollWildLevel(entry.name, minLv, maxLv) };
    }
  }

  // Fallback
  const fallback = weighted[0];
  return { name: fallback.name, level: rollWildLevel(fallback.name, minLv, maxLv) };
}

/**
 * Process an encounter: roll, select wild pokemon, trigger battle.
 * Returns battle result for system_message.
 */
export function processEncounter(
  state: State,
  config: Config,
): BattleResult | null {
  if (!rollEncounter(state, config)) return null;

  const wild = selectWildPokemon(state, config);
  if (!wild) return null;

  state.encounter_count++;

  // Resolve battle (handles seen/caught/XP internally)
  return resolveBattle(state, config, wild.name, wild.level);
}

// Re-export for stop hook
export { formatBattleMessage as formatEncounterMessage } from './battle.js';
