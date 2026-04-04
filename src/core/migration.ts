import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { DATA_DIR, commonAchievementsJsonPath } from './paths.js';
import { readCommonState, writeCommonState, readState, writeState } from './state.js';
import type { CommonState, AchievementsDB, Achievement } from './types.js';

// Gen1 legacy ID → common ID mapping
const GEN1_LEGACY_MAP: Record<string, string> = {
  catch_10: 'ten_catches',
  catch_25: 'pokedex_25',
  catch_50: 'pokedex_50',
  evolve_10: 'evolution_10',
};

// Counter fields to merge across gens (take MAX)
const COUNTER_FIELDS = [
  'session_count',
  'total_tokens_consumed',
  'battle_count',
  'battle_wins',
  'catch_count',
  'evolution_count',
  'error_count',
  'permission_count',
] as const;

type CounterField = typeof COUNTER_FIELDS[number];

let _commonAchievementsCache: Achievement[] | null = null;

function loadCommonAchievements(): Achievement[] {
  if (_commonAchievementsCache) return _commonAchievementsCache;
  const path = commonAchievementsJsonPath();
  if (!existsSync(path)) return [];
  try {
    const db = JSON.parse(readFileSync(path, 'utf-8')) as AchievementsDB;
    _commonAchievementsCache = db.achievements ?? [];
    return _commonAchievementsCache;
  } catch {
    return [];
  }
}

export function isCommonAchievement(id: string): boolean {
  const achievements = loadCommonAchievements();
  return achievements.some(a => a.id === id);
}

export function recalculateCommonEffects(commonState: CommonState): void {
  const achievements = loadCommonAchievements();

  let encounter_rate_bonus = 0;
  let xp_bonus_multiplier = 0;
  let max_party_size_bonus = 0;
  // Sum total item grants across all achieved common achievements
  const totalItemGrants: Record<string, number> = {};

  for (const ach of achievements) {
    if (!commonState.achievements[ach.id]) continue;
    if (!ach.reward_effects) continue;
    for (const effect of ach.reward_effects) {
      if (effect.type === 'encounter_rate_bonus') {
        encounter_rate_bonus += (effect.value as number) ?? 0;
      } else if (effect.type === 'xp_bonus') {
        xp_bonus_multiplier += (effect.value as number) ?? 0;
      } else if (effect.type === 'party_slot') {
        max_party_size_bonus += (effect.count as number) ?? 0;
      } else if (effect.type === 'add_item') {
        const item = effect.item as string;
        const count = (effect.count as number) ?? 0;
        if (item && count > 0) {
          totalItemGrants[item] = (totalItemGrants[item] ?? 0) + count;
        }
      }
    }
  }

  commonState.encounter_rate_bonus = encounter_rate_bonus;
  commonState.xp_bonus_multiplier = xp_bonus_multiplier;
  commonState.max_party_size_bonus = max_party_size_bonus;

  // Ensure item floor: if current count is below total grants, top up
  // (don't remove consumed items — only guarantee minimum from achievements)
  for (const [item, grantTotal] of Object.entries(totalItemGrants)) {
    if ((commonState.items[item] ?? 0) < grantTotal) {
      commonState.items[item] = grantTotal;
    }
  }
}

export function migrateToCommonState(): void {
  const commonState = readCommonState();

  // Scan all installed gen directories under DATA_DIR
  let genDirs: string[] = [];
  if (existsSync(DATA_DIR)) {
    try {
      genDirs = readdirSync(DATA_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^gen/.test(d.name))
        .map(d => d.name);
    } catch {
      genDirs = [];
    }
  }

  const achievements = loadCommonAchievements();
  const commonAchievementIds = new Set(achievements.map(a => a.id));

  // Accumulated counter sums across gens (not max — counters are independent per gen)
  const counters: Record<CounterField, number> = {
    session_count: 0,
    total_tokens_consumed: 0,
    battle_count: 0,
    battle_wins: 0,
    catch_count: 0,
    evolution_count: 0,
    error_count: 0,
    permission_count: 0,
  };

  // Track which gens we read (for xp_bonus subtraction step)
  const genStates: Array<{ gen: string; xpBonusFromCommon: number }> = [];

  for (const gen of genDirs) {
    const stateFilePath = join(DATA_DIR, gen, 'state.json');
    if (!existsSync(stateFilePath)) continue;

    let genState: ReturnType<typeof readState>;
    try {
      genState = readState(gen);
    } catch {
      continue;
    }

    // Determine legacy ID mapping for this gen
    const idMap: Record<string, string> = gen === 'gen1' ? GEN1_LEGACY_MAP : {};

    // Merge achievement completion (union)
    for (const [rawId, completed] of Object.entries(genState.achievements)) {
      if (!completed) continue;
      const commonId = idMap[rawId] ?? rawId;
      if (commonAchievementIds.has(commonId)) {
        commonState.achievements[commonId] = true;
      }
    }

    // Sum counters across gens (each gen's counters are independent)
    for (const field of COUNTER_FIELDS) {
      const val = (genState[field as keyof typeof genState] as number) ?? 0;
      counters[field] += val;
    }

    // Calculate xp_bonus sum from achieved common achievements for this gen
    let xpBonusFromCommon = 0;
    for (const ach of achievements) {
      const legacyId = Object.entries(idMap).find(([, v]) => v === ach.id)?.[0];
      const achieved = genState.achievements[ach.id] || (legacyId ? genState.achievements[legacyId] : false);
      if (!achieved || !ach.reward_effects) continue;
      for (const effect of ach.reward_effects) {
        if (effect.type === 'xp_bonus') {
          xpBonusFromCommon += (effect.value as number) ?? 0;
        }
      }
    }

    genStates.push({ gen, xpBonusFromCommon });
  }

  // Apply counter maxes
  for (const field of COUNTER_FIELDS) {
    commonState[field] = counters[field];
  }

  // Recalculate cumulative effects from merged common achievements
  recalculateCommonEffects(commonState);

  // Write commonState FIRST as existence marker — prevents double-subtract on crash+retry
  // (commonStateExists() check in session-start prevents re-running migration)
  writeCommonState(commonState);

  // Track migrated gens for crash recovery
  const migratedGens: string[] = (commonState as any).migrated_gens ?? [];

  for (const { gen, xpBonusFromCommon } of genStates) {
    if (xpBonusFromCommon <= 0) continue;
    if (migratedGens.includes(gen)) continue; // Already subtracted in a previous partial run
    let genState: ReturnType<typeof readState>;
    try {
      genState = readState(gen);
    } catch {
      continue;
    }
    genState.xp_bonus_multiplier = Math.max(0, genState.xp_bonus_multiplier - xpBonusFromCommon);
    writeState(genState, gen);
    migratedGens.push(gen);
    (commonState as any).migrated_gens = migratedGens;
    writeCommonState(commonState); // Update marker after each gen
  }
}
