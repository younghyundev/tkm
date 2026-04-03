#!/usr/bin/env tsx
/**
 * Gen 2 (Johto) Data Generator
 * Fetches from PokeAPI: 100 species (#152-#251), evolution chains, sprites, cries, i18n names
 * Generates: pokemon.json, regions.json, achievements.json, pokedex-rewards.json, i18n/{en,ko}.json
 */

import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  fetchPokemonRange,
  writePokemonJson,
  writeRegionsJson,
  writeI18nJson,
  writeAchievementsJson,
  writePokedexRewardsJson,
} from './lib/pokeapi-utils.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const GEN2_DATA_DIR = join(PROJECT_ROOT, 'data', 'gen2');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN2_START = 152;
const GEN2_END = 251;
const STARTERS: number[] = [152, 155, 158];

// --- Johto region definitions ---
const JOHTO_REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15],   unlock_condition: null },                                    // New Bark Town / Route 29-30
  '2': { pokemon_pool: [], level_range: [8, 22],   unlock_condition: { type: 'pokedex_seen', value: 5 } },     // Violet City / Sprout Tower
  '3': { pokemon_pool: [], level_range: [15, 30],  unlock_condition: { type: 'pokedex_seen', value: 15 } },    // Azalea Town / Slowpoke Well
  '4': { pokemon_pool: [], level_range: [20, 35],  unlock_condition: { type: 'pokedex_caught', value: 10 } },  // Goldenrod City / National Park
  '5': { pokemon_pool: [], level_range: [25, 40],  unlock_condition: { type: 'pokedex_caught', value: 20 } },  // Ecruteak City / Burned Tower
  '6': { pokemon_pool: [], level_range: [30, 45],  unlock_condition: { type: 'pokedex_caught', value: 30 } },  // Olivine City / Route 40-41
  '7': { pokemon_pool: [], level_range: [35, 55],  unlock_condition: { type: 'pokedex_caught', value: 45 } },  // Mahogany Town / Lake of Rage
  '8': { pokemon_pool: [], level_range: [40, 65],  unlock_condition: { type: 'pokedex_caught', value: 60 } },  // Blackthorn City / Dragon's Den
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 80 } },  // Mt. Silver / Victory Road
};

// Region 1: New Bark / early routes
const REGION1 = new Set([152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 172, 173, 174, 175, 176]);
// Region 2: Violet / Sprout Tower
const REGION2 = new Set([169, 170, 171, 177, 178, 179, 180, 181, 182, 187, 188, 189]);
// Region 3: Azalea / Slowpoke Well
const REGION3 = new Set([193, 194, 195, 204, 205, 213, 214]);
// Region 4: Goldenrod / National Park
const REGION4 = new Set([183, 184, 185, 186, 190, 191, 192, 196, 197, 241]);
// Region 5: Ecruteak / Burned Tower
const REGION5 = new Set([198, 199, 200, 201, 202, 203, 206, 207, 208, 209, 210, 235]);
// Region 6: Olivine / Sea routes
const REGION6 = new Set([211, 212, 218, 219, 220, 221, 222, 223, 224, 225, 226, 230]);
// Region 7: Mahogany / Lake of Rage (Ice, some Dark)
const REGION7 = new Set([215, 216, 217, 225, 227, 238, 239, 240, 242]);
// Region 8: Blackthorn / Dragon's Den
const REGION8 = new Set([147, 148, 149, 198, 227, 228, 229, 246, 247, 248]);
// Region 9: Mt. Silver / Victory Road / Legendaries
const REGION9 = new Set([233, 234, 236, 237, 243, 244, 245, 249, 250, 251]);

function assignRegion(id: number, types: string[], bst: number, isLegendary: boolean): string {
  if (isLegendary || id === 249 || id === 250 || id === 251) return '9';
  if (REGION1.has(id)) return '1';
  if (REGION2.has(id)) return '2';
  if (REGION3.has(id)) return '3';
  if (REGION4.has(id)) return '4';
  if (REGION5.has(id)) return '5';
  if (REGION6.has(id)) return '6';
  if (REGION7.has(id)) return '7';
  if (REGION8.has(id)) return '8';
  if (REGION9.has(id)) return '9';
  // Fallback by type affinity
  if (types.includes('dragon')) return '8';
  if (types.includes('ice')) return '7';
  if (types.includes('water')) return '6';
  if (types.includes('ghost') || types.includes('psychic')) return '5';
  if (types.includes('normal') || types.includes('fairy')) return '4';
  if (types.includes('bug') || types.includes('poison')) return '3';
  if (types.includes('electric') || types.includes('flying')) return '2';
  if (types.includes('fire') || types.includes('grass')) return '1';
  return '4';
}

// --- i18n data ---
const regionNamesEn: Record<string, { name: string; description: string }> = {
  '1': { name: 'New Bark Town',    description: 'The town where winds of a new beginning blow' },
  '2': { name: 'Violet City',      description: 'The city of nostalgic scents' },
  '3': { name: 'Azalea Town',      description: 'A town that works in harmony with Pokémon' },
  '4': { name: 'Goldenrod City',   description: 'A happening city that never sleeps' },
  '5': { name: 'Ecruteak City',    description: 'A historical city where the past meets the present' },
  '6': { name: 'Olivine City',     description: 'A port city with a famous lighthouse' },
  '7': { name: 'Mahogany Town',    description: 'Home of the lake of enrage' },
  '8': { name: 'Blackthorn City',  description: 'A quiet city nestled among the mountains' },
  '9': { name: 'Mt. Silver',       description: 'The ultimate challenge at the edge of Johto' },
};

const regionNamesKo: Record<string, { name: string; description: string }> = {
  '1': { name: '연두마을',    description: '새로운 시작의 바람이 부는 마을' },
  '2': { name: '도라지시티',  description: '향수 어린 냄새의 도시' },
  '3': { name: '진달래마을',  description: '포켓몬과 조화롭게 사는 마을' },
  '4': { name: '금빛시티',    description: '잠들지 않는 번화한 도시' },
  '5': { name: '단풍마을',    description: '과거와 현재가 만나는 역사적인 도시' },
  '6': { name: '담청시티',    description: '유명한 등대가 있는 항구 도시' },
  '7': { name: '다갈시티',    description: '분노의 호수의 고향' },
  '8': { name: '블랙쏜시티',  description: '산 사이에 자리한 조용한 도시' },
  '9': { name: '은빛산',      description: '성도 끝자락의 최강 도전' },
};

const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: 'First Catch',        description: 'Catch your first wild Pokémon',             rarity_label: 'Common' },
  catch_10:         { name: 'Zephyr Badge',        description: 'Catch 10 Pokémon',                          rarity_label: 'Common' },
  catch_25:         { name: 'Hive Badge',          description: 'Catch 25 Pokémon',                          rarity_label: 'Uncommon' },
  catch_50:         { name: 'Plain Badge',         description: 'Catch 50 Pokémon',                          rarity_label: 'Uncommon' },
  catch_75:         { name: 'Fog Badge',           description: 'Catch 75 Pokémon',                          rarity_label: 'Rare' },
  catch_100:        { name: 'Storm Badge',         description: 'Complete the Johto Pokédex!',               rarity_label: 'Legendary' },
  first_evolution:  { name: 'First Evolution',     description: 'Evolve a Pokémon for the first time',       rarity_label: 'Common' },
  evolve_10:        { name: 'Evolution Expert',    description: 'Evolve 10 Pokémon',                         rarity_label: 'Uncommon' },
  win_10:           { name: 'Rising Trainer',      description: 'Win 10 battles',                            rarity_label: 'Common' },
  win_50:           { name: 'Battle Veteran',      description: 'Win 50 battles',                            rarity_label: 'Uncommon' },
  win_100:          { name: 'Battle Master',       description: 'Win 100 battles',                           rarity_label: 'Rare' },
  level_50:         { name: 'Power Trainer',       description: 'Reach level 50 with any Pokémon',           rarity_label: 'Rare' },
  level_100:        { name: 'Champion',            description: 'Reach level 100 with any Pokémon',          rarity_label: 'Epic' },
  streak_7:         { name: 'Weekly Warrior',      description: 'Maintain a 7-day streak',                   rarity_label: 'Uncommon' },
  streak_30:        { name: 'Monthly Master',      description: 'Maintain a 30-day streak',                  rarity_label: 'Rare' },
  all_types:        { name: 'Type Collector',      description: 'Catch at least one Pokémon of every type',  rarity_label: 'Rare' },
  all_starters:     { name: "Professor Elm's Pride", description: 'Obtain all three Johto starters',          rarity_label: 'Uncommon' },
  eevee_duo:        { name: 'Eevee Duo',           description: 'Obtain both Espeon and Umbreon',            rarity_label: 'Rare' },
};

const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: '첫 포획',          description: '처음으로 야생 포켓몬을 잡다',             rarity_label: '일반' },
  catch_10:         { name: '제피르배지',        description: '포켓몬 10마리 포획',                      rarity_label: '일반' },
  catch_25:         { name: '인섹트배지',        description: '포켓몬 25마리 포획',                      rarity_label: '고급' },
  catch_50:         { name: '레귤러배지',        description: '포켓몬 50마리 포획',                      rarity_label: '고급' },
  catch_75:         { name: '팬텀배지',          description: '포켓몬 75마리 포획',                      rarity_label: '희귀' },
  catch_100:        { name: '스톰배지',          description: '성도 도감을 완성하라!',                   rarity_label: '전설' },
  first_evolution:  { name: '첫 진화',          description: '처음으로 포켓몬을 진화시키다',            rarity_label: '일반' },
  evolve_10:        { name: '진화 전문가',       description: '포켓몬 10마리 진화',                      rarity_label: '고급' },
  win_10:           { name: '떠오르는 트레이너', description: '배틀 10승',                               rarity_label: '일반' },
  win_50:           { name: '배틀 베테랑',       description: '배틀 50승',                               rarity_label: '고급' },
  win_100:          { name: '배틀 마스터',       description: '배틀 100승',                              rarity_label: '희귀' },
  level_50:         { name: '파워 트레이너',     description: '아무 포켓몬 레벨 50 달성',               rarity_label: '희귀' },
  level_100:        { name: '챔피언',            description: '아무 포켓몬 레벨 100 달성',              rarity_label: '에픽' },
  streak_7:         { name: '주간 전사',         description: '7일 연속 스트릭 유지',                   rarity_label: '고급' },
  streak_30:        { name: '월간 마스터',       description: '30일 연속 스트릭 유지',                  rarity_label: '희귀' },
  all_types:        { name: '타입 수집가',       description: '모든 타입의 포켓몬을 잡다',              rarity_label: '희귀' },
  all_starters:     { name: '엘름 박사의 자부심', description: '성도 스타터 3마리 모두 획득',            rarity_label: '고급' },
  eevee_duo:        { name: '이브이 듀오',       description: '에스피온과 블래키 모두 획득',            rarity_label: '희귀' },
};

// --- Achievements data ---
const achievements = [
  { id: 'first_catch',     trigger_type: 'catch_count',     trigger_value: 1,   reward_pokemon: null, rarity: 1 },
  { id: 'catch_10',        trigger_type: 'catch_count',     trigger_value: 10,  reward_pokemon: null, rarity: 1 },
  { id: 'catch_25',        trigger_type: 'catch_count',     trigger_value: 25,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_50',        trigger_type: 'catch_count',     trigger_value: 50,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_75',        trigger_type: 'catch_count',     trigger_value: 75,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_100',       trigger_type: 'catch_count',     trigger_value: 100, reward_pokemon: '251', rarity: 5 },
  { id: 'first_evolution', trigger_type: 'evolution_count', trigger_value: 1,   reward_pokemon: null, rarity: 1 },
  { id: 'evolve_10',       trigger_type: 'evolution_count', trigger_value: 10,  reward_pokemon: null, rarity: 2 },
  { id: 'win_10',          trigger_type: 'battle_wins',     trigger_value: 10,  reward_pokemon: null, rarity: 1 },
  { id: 'win_50',          trigger_type: 'battle_wins',     trigger_value: 50,  reward_pokemon: null, rarity: 2 },
  { id: 'win_100',         trigger_type: 'battle_wins',     trigger_value: 100, reward_pokemon: null, rarity: 3 },
  { id: 'level_50',        trigger_type: 'max_level',       trigger_value: 50,  reward_pokemon: null, rarity: 3 },
  { id: 'level_100',       trigger_type: 'max_level',       trigger_value: 100, reward_pokemon: null, rarity: 4 },
  { id: 'streak_7',        trigger_type: 'streak_days',     trigger_value: 7,   reward_pokemon: null, rarity: 2 },
  { id: 'streak_30',       trigger_type: 'streak_days',     trigger_value: 30,  reward_pokemon: null, rarity: 3 },
  { id: 'all_types',       trigger_type: 'unique_types',    trigger_value: 15,  reward_pokemon: null, rarity: 3 },
  {
    id: 'all_starters', trigger_type: 'specific_pokemon', trigger_value: 3, reward_pokemon: null, rarity: 2,
    reward_effects: [{ type: 'require_pokemon', pokemon: ['152', '155', '158'] }],
  },
  {
    id: 'eevee_duo', trigger_type: 'specific_pokemon', trigger_value: 2, reward_pokemon: null, rarity: 3,
    reward_effects: [{ type: 'require_pokemon', pokemon: ['196', '197'] }],
  },
];

// --- Pokedex rewards ---
const pokedexRewards = {
  milestones: [
    { id: 'catch_10_reward',  threshold: 10,  reward_type: 'pokeball',          reward_value: 3,   label: { en: 'Catch 10 — 3 Poké Balls',              ko: '10마리 포획 — 몬스터볼 3개' } },
    { id: 'catch_25_reward',  threshold: 25,  reward_type: 'pokeball',          reward_value: 5,   label: { en: 'Catch 25 — 5 Poké Balls',              ko: '25마리 포획 — 몬스터볼 5개' } },
    { id: 'catch_50_reward',  threshold: 50,  reward_type: 'xp_multiplier',     reward_value: 1.1, legendary_bonus: 'legendary_beasts', label: { en: 'Catch 50 — Raikou encounter!',  ko: '50마리 포획 — 라이코 조우!' } },
    { id: 'catch_70_reward',  threshold: 70,  reward_type: 'legendary_unlock',  reward_value: 'legendary_beasts', legendary_bonus: 'legendary_beasts', label: { en: 'Catch 70 — Entei encounter!',   ko: '70마리 포획 — 앤테이 조우!' } },
    { id: 'catch_90_reward',  threshold: 90,  reward_type: 'legendary_unlock',  reward_value: 'legendary_beasts', legendary_bonus: 'legendary_beasts', label: { en: 'Catch 90 — Suicune encounter!', ko: '90마리 포획 — 스이쿤 조우!' } },
    { id: 'catch_100_reward', threshold: 100, reward_type: 'legendary_unlock',  reward_value: 'tower_duo',        label: { en: 'Catch all 100 — Ho-Oh & Lugia!', ko: '100마리 포획 — 칠색조 & 루기아!' } },
  ],
  legendary_groups: {
    legendary_beasts: {
      label:       { en: 'Legendary Beasts', ko: '전설의 개' },
      description: { en: 'The three legendary beasts of Johto', ko: '성도 지방의 전설의 개 3마리' },
      options: ['243', '244', '245'],
    },
    tower_duo: {
      label:       { en: 'Tower Duo', ko: '탑 듀오' },
      description: { en: 'The guardian legendaries of the towers', ko: '탑을 지키는 전설의 포켓몬' },
      options: ['249', '250'],
    },
    celebi: {
      label:       { en: 'Celebi', ko: '세레비' },
      description: { en: 'The mythical time-traveling Pokémon', ko: '환상의 시간여행 포켓몬' },
      options: ['251'],
    },
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
      options: ['249', '250', '251'],
    },
  },
  type_master: {
    xp_bonus: 0.1,
    legendary_unlock_threshold: 3,
    legendary_group: 'special_legends',
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
      options: ['249', '250', '251'],
    },
  },
  chain_completion_reward: {
    pokeball_count: 1,
  },
};

// --- Main ---
async function main() {
  console.log('Gen 2 (Johto) Data Generator — Fetching #152-#251 from PokeAPI\n');

  for (const dir of [GEN2_DATA_DIR, join(GEN2_DATA_DIR, 'i18n'), CRIES_DIR, SPRITES_RAW_DIR]) {
    mkdirSync(dir, { recursive: true });
  }

  // Phase 1: Fetch all pokemon data
  const { pokemonEntries, i18nEn, i18nKo, errors } = await fetchPokemonRange(
    GEN2_START,
    GEN2_END,
    STARTERS,
    assignRegion,
    CRIES_DIR,
    SPRITES_RAW_DIR,
  );

  // Fix line arrays: ensure self-reference for single-pokemon lines
  for (const entry of Object.values(pokemonEntries) as any[]) {
    if (!entry.line || entry.line.length === 0) {
      entry.line = [String(entry.id)];
    }
  }

  // Phase 2: Write output files
  writePokemonJson(GEN2_DATA_DIR, pokemonEntries, STARTERS.map(String));
  writeRegionsJson(GEN2_DATA_DIR, JOHTO_REGIONS, pokemonEntries);
  writeI18nJson(GEN2_DATA_DIR, i18nEn, i18nKo, regionNamesEn, regionNamesKo, achievementNamesEn, achievementNamesKo);
  writeAchievementsJson(GEN2_DATA_DIR, achievements);
  writePokedexRewardsJson(GEN2_DATA_DIR, pokedexRewards);

  // Summary
  const sortedPokemon = Object.values(pokemonEntries).sort((a: any, b: any) => a.id - b.id);
  console.log(`\n=== Gen 2 Generation Complete ===`);
  console.log(`  Species: ${sortedPokemon.length}`);
  console.log(`  Regions: 9`);
  console.log(`  Achievements: ${achievements.length}`);
  console.log(`  i18n: en + ko`);

  const regionDist: Record<string, number> = {};
  for (const p of sortedPokemon as any[]) {
    regionDist[p.region] = (regionDist[p.region] || 0) + 1;
  }
  console.log('\n  Region distribution:');
  for (const [r, cnt] of Object.entries(regionDist).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    console.log(`    Region ${r}: ${cnt}`);
  }

  if (errors.length > 0) {
    console.log(`\n  ${errors.length} errors:`);
    for (const e of errors) console.log(`    ${e}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
