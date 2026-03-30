import { readFileSync } from 'fs';
import { POKEMON_JSON_PATH, ACHIEVEMENTS_JSON_PATH } from './paths.js';
import type { PokemonDB, AchievementsDB } from './types.js';

let _pokemonDB: PokemonDB | null = null;
let _achievementsDB: AchievementsDB | null = null;

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
