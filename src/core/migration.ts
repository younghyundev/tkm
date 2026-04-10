import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DATA_DIR, commonAchievementsJsonPath } from './paths.js';
import { readCommonState, writeCommonState, readState, writeState } from './state.js';
import { getPokemonDB, getAchievementsDB } from './pokemon-data.js';
import { levelToXp } from './xp.js';
import { isShinyKey, toShinyKey } from './shiny-utils.js';
import type { State, CommonState, AchievementsDB, Achievement } from './types.js';

// ---------- Version-based migration runner ----------

interface Migration {
  version: string;
  fn: (state: State) => void;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

let _pkgVersion: string | null = null;
export function getPackageVersion(): string {
  if (_pkgVersion) return _pkgVersion;
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  try {
    _pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
  } catch {
    _pkgVersion = '0.0.0';
  }
  return _pkgVersion!;
}

/**
 * Fix legendary/mythical achievement reward Pokémon that were granted at level 1.
 * They should be at least level 50.
 */
function migrateLegendaryRewardLevels(state: State): void {
  const pokemonDB = getPokemonDB();
  const achDB = getAchievementsDB();

  const rewardIds = new Set(
    achDB.achievements.filter(a => a.reward_pokemon).map(a => a.reward_pokemon!)
  );

  for (const id of rewardIds) {
    const pData = pokemonDB.pokemon[id];
    const pState = state.pokemon[id];
    if (!pData || !pState) continue;
    if ((pData.rarity === 'legendary' || pData.rarity === 'mythical') && pState.level < 50) {
      pState.level = 50;
      pState.xp = Math.max(pState.xp, levelToXp(50, pData.exp_group));
    }
  }
}

/**
 * Fix legendary/mythical reward Pokémon whose XP doesn't match level 50.
 * Catches cases where v0.5.2 set level=50 but left xp=0, causing
 * xpToLevel() to recalculate the level back down on next XP distribution.
 */
function migrateLegendaryRewardXpSync(state: State): void {
  const pokemonDB = getPokemonDB();
  const achDB = getAchievementsDB();

  const rewardIds = new Set(
    achDB.achievements.filter(a => a.reward_pokemon).map(a => a.reward_pokemon!)
  );

  for (const id of rewardIds) {
    const pData = pokemonDB.pokemon[id];
    const pState = state.pokemon[id];
    if (!pData || !pState) continue;
    if (pData.rarity === 'legendary' || pData.rarity === 'mythical') {
      const minXp = levelToXp(50, pData.exp_group);
      if (pState.xp < minXp) {
        pState.xp = minXp;
        pState.level = Math.max(pState.level, 50);
      }
    }
  }
}

/**
 * Migrate shiny pokemon from flag-based to separate key-based storage.
 * For each pokemon with shiny=true:
 * - Create "{id}_shiny" entry with same stats (the shiny version)
 * - Keep original "{id}" entry as normal copy (gift to user)
 * - Add shiny key to unlocked
 * Note: shiny flag is kept on original temporarily for config.party migration in stop.ts
 */
function migrateShinyToSeparateEntries(state: State): void {
  for (const [key, entry] of Object.entries(state.pokemon)) {
    if (entry.shiny && !isShinyKey(key)) {
      const shinyKey = toShinyKey(key);
      // Create shiny entry with same stats
      state.pokemon[shinyKey] = { ...entry };
      // Normal copy keeps same stats but not shiny
      // Note: keep shiny=true on original temporarily for config.party migration in stop.ts
      // Add shiny key to unlocked
      if (!state.unlocked.includes(shinyKey)) {
        state.unlocked.push(shinyKey);
      }
    }
  }
}

/** Ordered list of version-gated migrations. Append new entries at the end. */
const MIGRATIONS: Migration[] = [
  { version: '0.5.2', fn: migrateLegendaryRewardLevels },
  { version: '0.5.3', fn: migrateLegendaryRewardXpSync },
  { version: '0.5.8', fn: migrateShinyToSeparateEntries },
];

/**
 * Run pending version-gated migrations on the given state (in-place).
 * Call from readState() after loading.
 */
export function runMigrations(state: State): void {
  const from = state.migrated_version ?? '0.0.0';
  const target = getPackageVersion();

  // Already up-to-date
  if (compareSemver(from, target) >= 0) return;

  let changed = false;
  for (const m of MIGRATIONS) {
    if (compareSemver(from, m.version) < 0) {
      try {
        m.fn(state);
      } catch { /* skip migration if data unavailable (e.g. test env) */ }
      changed = true;
    }
  }

  if (changed) {
    state.migrated_version = target;
  }
}

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
  let rare_weight_multiplier = 1.0;
  const titles: string[] = [];
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
      } else if (effect.type === 'title') {
        const titleStr = String(effect.value ?? '');
        if (titleStr && !titles.includes(titleStr)) titles.push(titleStr);
      } else if (effect.type === 'rare_weight_multiplier') {
        rare_weight_multiplier *= (effect.value as number) ?? 1.0;
      }
    }
  }

  // Per-gen achievement effects (encounter_rate_bonus, rare_weight_multiplier from
  // first_badge, four_badges, eight_badges) are NOT aggregated here. They are
  // applied to per-gen state when the achievement triggers via applyAchievementEffects().
  // Aggregating them into commonState would leak per-gen bonuses across all generations.

  commonState.encounter_rate_bonus = encounter_rate_bonus;
  commonState.xp_bonus_multiplier = xp_bonus_multiplier;
  commonState.max_party_size_bonus = max_party_size_bonus;
  commonState.rare_weight_multiplier = rare_weight_multiplier;

  // Rebuild titles authoritatively from common achievements only
  commonState.titles = titles;

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
