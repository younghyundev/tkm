#!/usr/bin/env tsx
/**
 * Gen 9 (Paldea) Data Generator
 * Fetches from PokeAPI: 120 species (#906-#1025), evolution chains, sprites, cries, i18n names
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
const DATA_DIR = join(PROJECT_ROOT, 'data', 'gen9');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN_START = 906;
const GEN_END = 1025;
const STARTERS: number[] = [906, 909, 912];

const REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15],   unlock_condition: null },
  '2': { pokemon_pool: [], level_range: [8, 22],   unlock_condition: { type: 'pokedex_seen', value: 5 } },
  '3': { pokemon_pool: [], level_range: [15, 30],  unlock_condition: { type: 'pokedex_seen', value: 12 } },
  '4': { pokemon_pool: [], level_range: [20, 35],  unlock_condition: { type: 'pokedex_caught', value: 10 } },
  '5': { pokemon_pool: [], level_range: [25, 40],  unlock_condition: { type: 'pokedex_caught', value: 20 } },
  '6': { pokemon_pool: [], level_range: [30, 45],  unlock_condition: { type: 'pokedex_caught', value: 30 } },
  '7': { pokemon_pool: [], level_range: [35, 55],  unlock_condition: { type: 'pokedex_caught', value: 40 } },
  '8': { pokemon_pool: [], level_range: [40, 65],  unlock_condition: { type: 'pokedex_caught', value: 55 } },
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 75 } },
};

// Cabo Poco / South Province
const REGION1 = new Set([906, 907, 908, 909, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925]);
// Cortondo area
const REGION2 = new Set([926, 927, 928, 929, 930, 931, 932, 933, 934, 935]);
// Artazon area
const REGION3 = new Set([936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948]);
// Levincia area
const REGION4 = new Set([949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961]);
// Cascarrafa area
const REGION5 = new Set([962, 963, 964, 965, 966, 967, 968, 969, 970, 971, 972, 973, 974, 975]);
// Medali area
const REGION6 = new Set([976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990]);
// Montenevera area
const REGION7 = new Set([991, 992, 993, 994, 995, 996, 997, 998, 999, 1000]);
// Alfornada / Kitakami DLC
const REGION8 = new Set([1001, 1002, 1003, 1004, 1005, 1006, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023]);
// Area Zero / Legendaries
const REGION9 = new Set([1007, 1008, 1024, 1025]);

function assignRegion(id: number, types: string[], _bst: number, isLegendary: boolean): string {
  if (isLegendary || id === 1007 || id === 1008 || id === 1024 || id === 1025) return '9';
  if (REGION1.has(id)) return '1';
  if (REGION2.has(id)) return '2';
  if (REGION3.has(id)) return '3';
  if (REGION4.has(id)) return '4';
  if (REGION5.has(id)) return '5';
  if (REGION6.has(id)) return '6';
  if (REGION7.has(id)) return '7';
  if (REGION8.has(id)) return '8';
  if (REGION9.has(id)) return '9';
  if (types.includes('dragon')) return '7';
  if (types.includes('ice') || types.includes('ghost')) return '7';
  if (types.includes('steel') || types.includes('dark')) return '6';
  if (types.includes('water') || types.includes('electric')) return '4';
  if (types.includes('fire') || types.includes('fighting')) return '5';
  if (types.includes('grass') || types.includes('bug')) return '3';
  return '1';
}

const regionNamesEn: Record<string, { name: string; description: string }> = {
  '1': { name: 'Cabo Poco',     description: 'A small seaside town at the southern tip of Paldea' },
  '2': { name: 'Cortondo',      description: 'A farming town surrounded by olive groves' },
  '3': { name: 'Artazon',       description: 'A vibrant town of art and creativity' },
  '4': { name: 'Levincia',      description: 'An electric city that never stops streaming' },
  '5': { name: 'Cascarrafa',    description: 'A desert oasis city with flowing waterfalls' },
  '6': { name: 'Medali',        description: 'A gourmet city where flavor reigns supreme' },
  '7': { name: 'Montenevera',   description: 'A snowy mountain town with ghostly charm' },
  '8': { name: 'Alfornada',     description: 'A hidden town nestled in the mountain peaks' },
  '9': { name: 'Area Zero',     description: 'The mysterious depths of the Great Crater of Paldea' },
};

const regionNamesKo: Record<string, { name: string; description: string }> = {
  '1': { name: '마을입구마을',   description: '팔데아 남쪽 끝의 작은 해변 마을' },
  '2': { name: '콜론도',         description: '올리브 숲에 둘러싸인 농업 마을' },
  '3': { name: '마중마을',       description: '예술과 창의성의 활기찬 마을' },
  '4': { name: '테이블시티',     description: '스트리밍이 끊이지 않는 전기 도시' },
  '5': { name: '카스카라파',     description: '폭포가 흐르는 사막 오아시스 도시' },
  '6': { name: '메다리',         description: '맛이 최고인 미식 도시' },
  '7': { name: '프리지타운',     description: '유령 같은 매력의 눈 덮인 산악 마을' },
  '8': { name: '나페',           description: '산봉우리 사이에 숨겨진 마을' },
  '9': { name: '에리어 제로',    description: '팔데아 대분화구의 신비로운 깊은 곳' },
};

const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: 'First Catch',        description: 'Catch your first wild Pokémon',             rarity_label: 'Common' },
  catch_10:         { name: 'Bug Badge',           description: 'Catch 10 Pokémon',                          rarity_label: 'Common' },
  catch_20:         { name: 'Grass Badge',         description: 'Catch 20 Pokémon',                          rarity_label: 'Uncommon' },
  catch_35:         { name: 'Electric Badge',      description: 'Catch 35 Pokémon',                          rarity_label: 'Uncommon' },
  catch_50:         { name: 'Water Badge',         description: 'Catch 50 Pokémon',                          rarity_label: 'Rare' },
  catch_65:         { name: 'Normal Badge',        description: 'Catch 65 Pokémon',                          rarity_label: 'Rare' },
  catch_80:         { name: 'Ghost Badge',         description: 'Catch 80 Pokémon',                          rarity_label: 'Epic' },
  catch_100:        { name: 'Psychic Badge',       description: 'Catch 100 Pokémon',                         rarity_label: 'Epic' },
  catch_120:        { name: 'Ice Badge',           description: 'Complete the Paldea Pokédex!',              rarity_label: 'Legendary' },
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
  all_starters:     { name: "Clavell's Pride",     description: 'Obtain all three Paldea starters',          rarity_label: 'Uncommon' },
  ruin_quartet:     { name: 'Treasures of Ruin',   description: 'Obtain all four Treasures of Ruin',         rarity_label: 'Rare' },
};

const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: '첫 포획',          description: '처음으로 야생 포켓몬을 잡다',             rarity_label: '일반' },
  catch_10:         { name: '벅배지',           description: '포켓몬 10마리 포획',                      rarity_label: '일반' },
  catch_20:         { name: '그래스배지',       description: '포켓몬 20마리 포획',                      rarity_label: '고급' },
  catch_35:         { name: '일렉트릭배지',     description: '포켓몬 35마리 포획',                      rarity_label: '고급' },
  catch_50:         { name: '워터배지',         description: '포켓몬 50마리 포획',                      rarity_label: '희귀' },
  catch_65:         { name: '노말배지',         description: '포켓몬 65마리 포획',                      rarity_label: '희귀' },
  catch_80:         { name: '고스트배지',       description: '포켓몬 80마리 포획',                      rarity_label: '에픽' },
  catch_100:        { name: '사이킥배지',       description: '포켓몬 100마리 포획',                     rarity_label: '에픽' },
  catch_120:        { name: '아이스배지',       description: '팔데아 도감을 완성하라!',                 rarity_label: '전설' },
  first_evolution:  { name: '첫 진화',          description: '처음으로 포켓몬을 진화시키다',            rarity_label: '일반' },
  evolve_10:        { name: '진화 전문가',      description: '포켓몬 10마리 진화',                      rarity_label: '고급' },
  win_10:           { name: '떠오르는 트레이너', description: '배틀 10승',                               rarity_label: '일반' },
  win_50:           { name: '배틀 베테랑',      description: '배틀 50승',                               rarity_label: '고급' },
  win_100:          { name: '배틀 마스터',      description: '배틀 100승',                              rarity_label: '희귀' },
  level_50:         { name: '파워 트레이너',    description: '아무 포켓몬 레벨 50 달성',               rarity_label: '희귀' },
  level_100:        { name: '챔피언',           description: '아무 포켓몬 레벨 100 달성',              rarity_label: '에픽' },
  streak_7:         { name: '주간 전사',        description: '7일 연속 스트릭 유지',                   rarity_label: '고급' },
  streak_30:        { name: '월간 마스터',      description: '30일 연속 스트릭 유지',                  rarity_label: '희귀' },
  all_types:        { name: '타입 수집가',      description: '모든 타입의 포켓몬을 잡다',              rarity_label: '희귀' },
  all_starters:     { name: '클라벨 교장의 자부심', description: '팔데아 스타터 3마리 모두 획득',       rarity_label: '고급' },
  ruin_quartet:     { name: '재앙의 보물',      description: '재앙의 보물 4마리 모두 획득',            rarity_label: '희귀' },
};

const achievements = [
  { id: 'first_catch',     trigger_type: 'catch_count',     trigger_value: 1,   reward_pokemon: null, rarity: 1 },
  { id: 'catch_10',        trigger_type: 'catch_count',     trigger_value: 10,  reward_pokemon: null, rarity: 1 },
  { id: 'catch_20',        trigger_type: 'catch_count',     trigger_value: 20,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_35',        trigger_type: 'catch_count',     trigger_value: 35,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_50',        trigger_type: 'catch_count',     trigger_value: 50,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_65',        trigger_type: 'catch_count',     trigger_value: 65,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_80',        trigger_type: 'catch_count',     trigger_value: 80,  reward_pokemon: null, rarity: 4 },
  { id: 'catch_100',       trigger_type: 'catch_count',     trigger_value: 100, reward_pokemon: null, rarity: 4 },
  { id: 'catch_120',       trigger_type: 'catch_count',     trigger_value: 120, reward_pokemon: '1025', rarity: 5 },
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
  { id: 'all_starters',    trigger_type: 'specific_pokemon', trigger_value: 3,  reward_pokemon: null, rarity: 2,
    reward_effects: [{ type: 'require_pokemon', pokemon: ['906', '909', '912'] }] },
  { id: 'ruin_quartet',    trigger_type: 'specific_pokemon', trigger_value: 4,  reward_pokemon: null, rarity: 3,
    reward_effects: [{ type: 'require_pokemon', pokemon: ['1001', '1002', '1003', '1004'] }] },
];

const pokedexRewards = {
  milestones: [
    { id: 'catch_10_reward',   threshold: 10,  reward_type: 'pokeball',         reward_value: 3,   label: { en: 'Catch 10 — 3 Poké Balls',              ko: '10마리 포획 — 몬스터볼 3개' } },
    { id: 'catch_25_reward',   threshold: 25,  reward_type: 'pokeball',         reward_value: 5,   label: { en: 'Catch 25 — 5 Poké Balls',              ko: '25마리 포획 — 몬스터볼 5개' } },
    { id: 'catch_50_reward',   threshold: 50,  reward_type: 'xp_multiplier',    reward_value: 1.1, legendary_bonus: 'ride_legends', label: { en: 'Catch 50 — Ride Legend encounter!', ko: '50마리 포획 — 라이드 전설 조우!' } },
    { id: 'catch_70_reward',   threshold: 70,  reward_type: 'legendary_unlock', reward_value: 'treasures_of_ruin', label: { en: 'Catch 70 — Treasures of Ruin!', ko: '70마리 포획 — 재앙의 보물!' } },
    { id: 'catch_90_reward',   threshold: 90,  reward_type: 'legendary_unlock', reward_value: 'ride_legends', label: { en: 'Catch 90 — Ride Legends!', ko: '90마리 포획 — 라이드 전설!' } },
    { id: 'catch_110_reward',  threshold: 110, reward_type: 'legendary_unlock', reward_value: 'dlc_legends', label: { en: 'Catch 110 — DLC Legends!', ko: '110마리 포획 — DLC 전설!' } },
    { id: 'catch_120_reward',  threshold: 120, reward_type: 'legendary_unlock', reward_value: 'mythicals', label: { en: 'Catch all 120 — Mythicals!', ko: '120마리 포획 — 환상의 포켓몬!' } },
  ],
  legendary_groups: {
    ride_legends: {
      label:       { en: 'Ride Legends', ko: '라이드 전설' },
      description: { en: 'The legendary ride Pokémon of Paldea', ko: '팔데아의 전설 라이드 포켓몬' },
      options: ['1007', '1008'],
    },
    treasures_of_ruin: {
      label:       { en: 'Treasures of Ruin', ko: '재앙의 보물' },
      description: { en: 'The four cursed treasures sealed across Paldea', ko: '팔데아 곳곳에 봉인된 네 재앙의 보물' },
      options: ['1001', '1002', '1003', '1004'],
    },
    dlc_legends: {
      label:       { en: 'DLC Legends', ko: 'DLC 전설' },
      description: { en: 'Legendary Pokémon from The Hidden Treasure of Area Zero', ko: '에리어 제로의 숨겨진 보물의 전설 포켓몬' },
      options: ['1017', '1024', '1025'],
    },
    mythicals: {
      label:       { en: 'Paldea Mythicals', ko: '팔데아 환상' },
      description: { en: 'The mythical Pokémon of Paldea', ko: '팔데아 지방의 환상 포켓몬' },
      options: ['1007', '1008', '1024', '1025'],
    },
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
      options: ['1007', '1008'],
    },
  },
  type_master: {
    xp_bonus: 0.1,
    legendary_unlock_threshold: 3,
    legendary_group: 'special_legends',
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
      options: ['1007', '1008'],
    },
  },
  chain_completion_reward: { pokeball_count: 1 },
};

async function main() {
  console.log('Gen 9 (Paldea) Data Generator — Fetching #906-#1025 from PokeAPI\n');
  for (const dir of [DATA_DIR, join(DATA_DIR, 'i18n'), CRIES_DIR, SPRITES_RAW_DIR]) {
    mkdirSync(dir, { recursive: true });
  }

  const { pokemonEntries, i18nEn, i18nKo, errors } = await fetchPokemonRange(
    GEN_START, GEN_END, STARTERS, assignRegion, CRIES_DIR, SPRITES_RAW_DIR,
  );

  for (const entry of Object.values(pokemonEntries) as any[]) {
    if (!entry.line || entry.line.length === 0) entry.line = [String(entry.id)];
  }

  writePokemonJson(DATA_DIR, pokemonEntries, STARTERS.map(String));
  writeRegionsJson(DATA_DIR, REGIONS, pokemonEntries);
  writeI18nJson(DATA_DIR, i18nEn, i18nKo, regionNamesEn, regionNamesKo, achievementNamesEn, achievementNamesKo);
  writeAchievementsJson(DATA_DIR, achievements);
  writePokedexRewardsJson(DATA_DIR, pokedexRewards);

  console.log(`\n=== Gen 9 Generation Complete ===`);
  console.log(`  Species: ${Object.keys(pokemonEntries).length}`);
  console.log(`  Regions: 9 | Achievements: ${achievements.length} | i18n: en + ko`);
  if (errors.length > 0) {
    console.log(`\n  ${errors.length} errors:`);
    for (const e of errors) console.log(`    ${e}`);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
