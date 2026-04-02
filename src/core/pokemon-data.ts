import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  pokemonJsonPath, achievementsJsonPath, regionsJsonPath,
  pokedexRewardsJsonPath, i18nDataDir, getActiveGeneration,
  EVENTS_JSON_PATH, SHARED_JSON_PATH,
  GENERATIONS_JSON_PATH,
  // Legacy compat
  POKEMON_JSON_PATH, ACHIEVEMENTS_JSON_PATH, REGIONS_JSON_PATH,
  POKEDEX_REWARDS_JSON_PATH, I18N_DATA_DIR,
} from './paths.js';
import type { PokemonDB, AchievementsDB, RegionsDB, EventsDB, PokedexRewardsDB, GenerationsDB, SharedDB } from './types.js';
import { getLocale } from '../i18n/index.js';

// ── Gen-keyed caches ──
const _pokemonDBCache: Record<string, PokemonDB> = {};
const _achievementsDBCache: Record<string, AchievementsDB> = {};
const _regionsDBCache: Record<string, RegionsDB> = {};
const _pokedexRewardsDBCache: Record<string, PokedexRewardsDB> = {};

// Shared/global caches (not per-gen)
let _eventsDB: EventsDB | null = null;
let _generationsDB: GenerationsDB | null = null;
let _sharedDB: SharedDB | null = null;

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function resolveDataPath(perGenPath: string, legacyPath: string, gen?: string): string {
  if (existsSync(perGenPath)) return perGenPath;
  // Legacy fallback only valid for gen4 (original generation)
  if (gen && gen !== 'gen4') {
    throw new Error(`Missing data file for ${gen}: ${perGenPath}`);
  }
  return legacyPath;
}

export function getSharedDB(): SharedDB {
  if (!_sharedDB) {
    if (existsSync(SHARED_JSON_PATH)) {
      _sharedDB = loadJson<SharedDB>(SHARED_JSON_PATH);
    } else {
      // Fall back: load from legacy pokemon.json which contains these fields
      const legacyDB = loadJson<PokemonDB>(POKEMON_JSON_PATH);
      _sharedDB = {
        type_colors: legacyDB.type_colors,
        type_chart: legacyDB.type_chart,
        rarity_weights: legacyDB.rarity_weights,
      };
    }
  }
  return _sharedDB;
}

export function getGenerationsDB(): GenerationsDB {
  if (!_generationsDB) {
    if (existsSync(GENERATIONS_JSON_PATH)) {
      _generationsDB = loadJson<GenerationsDB>(GENERATIONS_JSON_PATH);
    } else {
      // Default: gen4 only
      _generationsDB = {
        generations: {
          gen4: {
            id: 'gen4',
            name: 'Generation IV',
            region_name: 'Sinnoh',
            pokemon_range: [280, 493],
            starters: ['387', '390', '393'],
            order: 4,
          },
        },
        default_generation: 'gen4',
      };
    }
  }
  return _generationsDB;
}

export function getPokemonDB(gen?: string): PokemonDB {
  const g = gen ?? getActiveGeneration();
  if (!_pokemonDBCache[g]) {
    const perGen = pokemonJsonPath(g);
    const path = resolveDataPath(perGen, POKEMON_JSON_PATH, g);
    const raw = loadJson<any>(path);
    const shared = getSharedDB();
    // Merge: per-gen pokemon data + shared type data
    _pokemonDBCache[g] = {
      pokemon: raw.pokemon,
      starters: raw.starters ?? getGenerationsDB().generations[g]?.starters ?? [],
      type_colors: raw.type_colors ?? shared.type_colors,
      type_chart: raw.type_chart ?? shared.type_chart,
      rarity_weights: raw.rarity_weights ?? shared.rarity_weights,
    };
  }
  return _pokemonDBCache[g];
}

export function getAchievementsDB(gen?: string): AchievementsDB {
  const g = gen ?? getActiveGeneration();
  if (!_achievementsDBCache[g]) {
    const perGen = achievementsJsonPath(g);
    const path = resolveDataPath(perGen, ACHIEVEMENTS_JSON_PATH, g);
    _achievementsDBCache[g] = loadJson<AchievementsDB>(path);
  }
  return _achievementsDBCache[g];
}

export function getRegionsDB(gen?: string): RegionsDB {
  const g = gen ?? getActiveGeneration();
  if (!_regionsDBCache[g]) {
    const perGen = regionsJsonPath(g);
    const path = resolveDataPath(perGen, REGIONS_JSON_PATH, g);
    _regionsDBCache[g] = loadJson<RegionsDB>(path);
  }
  return _regionsDBCache[g];
}

export function getEventsDB(): EventsDB {
  if (!_eventsDB) {
    _eventsDB = loadJson<EventsDB>(EVENTS_JSON_PATH);
  }
  return _eventsDB;
}

export function getPokedexRewardsDB(gen?: string): PokedexRewardsDB {
  const g = gen ?? getActiveGeneration();
  if (!_pokedexRewardsDBCache[g]) {
    const perGen = pokedexRewardsJsonPath(g);
    const path = resolveDataPath(perGen, POKEDEX_REWARDS_JSON_PATH, g);
    _pokedexRewardsDBCache[g] = loadJson<PokedexRewardsDB>(path);
  }
  return _pokedexRewardsDBCache[g];
}

// ── i18n helpers ──

interface GameI18nData {
  pokemon: Record<string, string>;
  types: Record<string, string>;
  regions: Record<string, { name: string; description: string }>;
  achievements: Record<string, { name: string; description: string; rarity_label: string }>;
}

const _gameI18n: Record<string, GameI18nData> = {};

function i18nCacheKey(locale: string, gen: string): string {
  return `${gen}:${locale}`;
}

export function getGameI18n(locale?: string, gen?: string): GameI18nData {
  const loc = locale || getLocale();
  const g = gen ?? getActiveGeneration();
  const key = i18nCacheKey(loc, g);
  if (!_gameI18n[key]) {
    const perGen = join(i18nDataDir(g), `${loc}.json`);
    const legacy = join(I18N_DATA_DIR, `${loc}.json`);
    const path = resolveDataPath(perGen, legacy, g);
    _gameI18n[key] = loadJson<GameI18nData>(path);
  }
  return _gameI18n[key];
}

export function getPokemonName(id: string | number, gen?: string, shiny?: boolean): string {
  const i18n = getGameI18n(undefined, gen);
  const name = i18n.pokemon[String(id)] || String(id);
  if (shiny) return '★' + name;
  return name;
}

/**
 * Resolve a display name or ID string to a pokemon ID.
 * Accepts numeric ID strings ("390") or localized names ("불꽃숭이", "Chimchar").
 * Delegates to existing pokemonIdByName for locale search.
 * Returns null if no match found.
 */
export function resolveNameToId(nameOrId: string): string | null {
  const db = getPokemonDB();
  // Direct ID match
  if (db.pokemon[nameOrId]) return nameOrId;

  // Delegate to existing locale-aware reverse lookup
  return pokemonIdByName(nameOrId) ?? null;
}

/**
 * Get the display name for a pokemon, preferring nickname over species name.
 */
export function getDisplayName(id: string | number, nickname?: string): string {
  if (nickname) return nickname;
  return getPokemonName(id);
}

export function getTypeName(typeId: string): string {
  const i18n = getGameI18n();
  return i18n.types[typeId] || typeId;
}

export function getRegionName(id: string | number, gen?: string): string {
  const i18n = getGameI18n(undefined, gen);
  return i18n.regions[String(id)]?.name || String(id);
}

export function getRegionDescription(id: string | number, gen?: string): string {
  const i18n = getGameI18n(undefined, gen);
  return i18n.regions[String(id)]?.description || '';
}

export function getAchievementName(id: string, gen?: string): string {
  const i18n = getGameI18n(undefined, gen);
  return i18n.achievements[id]?.name || id;
}

export function getAchievementDescription(id: string, gen?: string): string {
  const i18n = getGameI18n(undefined, gen);
  return i18n.achievements[id]?.description || '';
}

export function getAchievementRarityLabel(id: string, gen?: string): string {
  const i18n = getGameI18n(undefined, gen);
  return i18n.achievements[id]?.rarity_label || '';
}

// Reverse lookup: name (any locale) → pokemon ID string
export function pokemonIdByName(name: string, gen?: string): string | undefined {
  for (const locale of ['ko', 'en']) {
    const i18n = getGameI18n(locale, gen);
    for (const [id, pokeName] of Object.entries(i18n.pokemon)) {
      if (pokeName === name) return id;
    }
  }
  return undefined;
}

// Reverse lookup: region name (any locale) → region ID string
export function regionIdByName(name: string, gen?: string): string | undefined {
  for (const locale of ['ko', 'en']) {
    const i18n = getGameI18n(locale, gen);
    for (const [id, region] of Object.entries(i18n.regions)) {
      if (region.name === name) return id;
    }
  }
  return undefined;
}

// ── Cache management ──

export function invalidateGenCache(gen?: string): void {
  if (gen) {
    delete _pokemonDBCache[gen];
    delete _achievementsDBCache[gen];
    delete _regionsDBCache[gen];
    delete _pokedexRewardsDBCache[gen];
    // Clear i18n entries for this gen
    for (const key of Object.keys(_gameI18n)) {
      if (key.startsWith(`${gen}:`)) delete _gameI18n[key];
    }
  } else {
    _resetForTesting();
  }
}

export function _resetForTesting(): void {
  for (const key of Object.keys(_pokemonDBCache)) delete _pokemonDBCache[key];
  for (const key of Object.keys(_achievementsDBCache)) delete _achievementsDBCache[key];
  for (const key of Object.keys(_regionsDBCache)) delete _regionsDBCache[key];
  for (const key of Object.keys(_pokedexRewardsDBCache)) delete _pokedexRewardsDBCache[key];
  _eventsDB = null;
  _generationsDB = null;
  _sharedDB = null;
  for (const key of Object.keys(_gameI18n)) delete _gameI18n[key];
}
