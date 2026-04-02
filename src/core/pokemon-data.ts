import { readFileSync } from 'fs';
import { join } from 'path';
import { POKEMON_JSON_PATH, ACHIEVEMENTS_JSON_PATH, REGIONS_JSON_PATH, EVENTS_JSON_PATH, POKEDEX_REWARDS_JSON_PATH, I18N_DATA_DIR } from './paths.js';
import type { PokemonDB, AchievementsDB, RegionsDB, EventsDB, PokedexRewardsDB } from './types.js';
import { getLocale } from '../i18n/index.js';

let _pokemonDB: PokemonDB | null = null;
let _achievementsDB: AchievementsDB | null = null;
let _regionsDB: RegionsDB | null = null;
let _eventsDB: EventsDB | null = null;
let _pokedexRewardsDB: PokedexRewardsDB | null = null;

export function getPokemonDB(): PokemonDB {
  if (!_pokemonDB) {
    _pokemonDB = JSON.parse(readFileSync(POKEMON_JSON_PATH, 'utf-8')) as PokemonDB;
  }
  return _pokemonDB;
}

export function getAchievementsDB(): AchievementsDB {
  if (!_achievementsDB) {
    _achievementsDB = JSON.parse(readFileSync(ACHIEVEMENTS_JSON_PATH, 'utf-8')) as AchievementsDB;
  }
  return _achievementsDB;
}

export function getRegionsDB(): RegionsDB {
  if (!_regionsDB) {
    _regionsDB = JSON.parse(readFileSync(REGIONS_JSON_PATH, 'utf-8')) as RegionsDB;
  }
  return _regionsDB;
}

export function getEventsDB(): EventsDB {
  if (!_eventsDB) {
    _eventsDB = JSON.parse(readFileSync(EVENTS_JSON_PATH, 'utf-8')) as EventsDB;
  }
  return _eventsDB;
}

export function getPokedexRewardsDB(): PokedexRewardsDB {
  if (!_pokedexRewardsDB) {
    _pokedexRewardsDB = JSON.parse(readFileSync(POKEDEX_REWARDS_JSON_PATH, 'utf-8')) as PokedexRewardsDB;
  }
  return _pokedexRewardsDB;
}

interface GameI18nData {
  pokemon: Record<string, string>;
  types: Record<string, string>;
  regions: Record<string, { name: string; description: string }>;
  achievements: Record<string, { name: string; description: string; rarity_label: string }>;
}

let _gameI18n: Record<string, GameI18nData> = {};

export function getGameI18n(locale?: string): GameI18nData {
  const loc = locale || getLocale();
  if (!_gameI18n[loc]) {
    const filePath = join(I18N_DATA_DIR, `${loc}.json`);
    _gameI18n[loc] = JSON.parse(readFileSync(filePath, 'utf-8')) as GameI18nData;
  }
  return _gameI18n[loc];
}

export function getPokemonName(id: string | number): string {
  const i18n = getGameI18n();
  return i18n.pokemon[String(id)] || String(id);
}

/**
 * Resolve a display name or ID string to a pokemon ID.
 * Accepts numeric ID strings ("390") or localized names ("불꽃숭이", "Chimchar").
 * Checks current locale first, then falls back to other locales.
 * Returns null if no match found.
 */
export function resolveNameToId(nameOrId: string): string | null {
  const db = getPokemonDB();
  // Direct ID match
  if (db.pokemon[nameOrId]) return nameOrId;

  // Search by display name across all loaded locales
  for (const loc of ['ko', 'en']) {
    try {
      const i18n = getGameI18n(loc);
      const found = Object.entries(i18n.pokemon).find(([, name]) => name === nameOrId);
      if (found) return found[0];
    } catch { /* locale file may not exist */ }
  }
  return null;
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

export function getRegionName(id: string | number): string {
  const i18n = getGameI18n();
  return i18n.regions[String(id)]?.name || String(id);
}

export function getRegionDescription(id: string | number): string {
  const i18n = getGameI18n();
  return i18n.regions[String(id)]?.description || '';
}

export function getAchievementName(id: string): string {
  const i18n = getGameI18n();
  return i18n.achievements[id]?.name || id;
}

export function getAchievementDescription(id: string): string {
  const i18n = getGameI18n();
  return i18n.achievements[id]?.description || '';
}

export function getAchievementRarityLabel(id: string): string {
  const i18n = getGameI18n();
  return i18n.achievements[id]?.rarity_label || '';
}

// Reverse lookup: name (any locale) → pokemon ID string
export function pokemonIdByName(name: string): string | undefined {
  for (const locale of ['ko', 'en']) {
    const i18n = getGameI18n(locale);
    for (const [id, pokeName] of Object.entries(i18n.pokemon)) {
      if (pokeName === name) return id;
    }
  }
  return undefined;
}

// Reverse lookup: region name (any locale) → region ID string
export function regionIdByName(name: string): string | undefined {
  for (const locale of ['ko', 'en']) {
    const i18n = getGameI18n(locale);
    for (const [id, region] of Object.entries(i18n.regions)) {
      if (region.name === name) return id;
    }
  }
  return undefined;
}

export function _resetForTesting(): void {
  _pokemonDB = null;
  _achievementsDB = null;
  _regionsDB = null;
  _eventsDB = null;
  _pokedexRewardsDB = null;
  _gameI18n = {};
}
