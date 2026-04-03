#!/usr/bin/env tsx
/**
 * Gen 8 (Galar) Data Generator
 * Fetches from PokeAPI: 96 species (#810-#905), evolution chains, sprites, cries, i18n names
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
const DATA_DIR = join(PROJECT_ROOT, 'data', 'gen8');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN_START = 810;
const GEN_END = 905;
const STARTERS: number[] = [810, 813, 816];

const REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15],   unlock_condition: null },
  '2': { pokemon_pool: [], level_range: [8, 22],   unlock_condition: { type: 'pokedex_seen', value: 5 } },
  '3': { pokemon_pool: [], level_range: [15, 30],  unlock_condition: { type: 'pokedex_seen', value: 10 } },
  '4': { pokemon_pool: [], level_range: [20, 35],  unlock_condition: { type: 'pokedex_caught', value: 8 } },
  '5': { pokemon_pool: [], level_range: [25, 40],  unlock_condition: { type: 'pokedex_caught', value: 15 } },
  '6': { pokemon_pool: [], level_range: [30, 45],  unlock_condition: { type: 'pokedex_caught', value: 25 } },
  '7': { pokemon_pool: [], level_range: [35, 55],  unlock_condition: { type: 'pokedex_caught', value: 35 } },
  '8': { pokemon_pool: [], level_range: [40, 65],  unlock_condition: { type: 'pokedex_caught', value: 50 } },
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 65 } },
};

// Postwick / Route 1-2
const REGION1 = new Set([810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826]);
// Turffield / Route 3-4
const REGION2 = new Set([827, 828, 829, 830, 831, 832, 833, 834, 835, 836]);
// Hulbury / Route 5
const REGION3 = new Set([837, 838, 839, 840, 841, 842, 843, 844, 845, 846, 847]);
// Motostoke / Wild Area
const REGION4 = new Set([848, 849, 850, 851, 852, 853, 854, 855, 856, 857, 858]);
// Stow-on-Side / Glimwood Tangle
const REGION5 = new Set([859, 860, 861, 862, 863, 864, 865, 866, 867, 868, 869]);
// Ballonlea / Circhester
const REGION6 = new Set([870, 871, 872, 873, 874, 875, 876, 877, 878, 879, 880, 881, 882, 883, 884]);
// Spikemuth
const REGION7 = new Set([885, 886, 887]);
// Crown Tundra / Isle of Armor DLC
const REGION8 = new Set([891, 892, 893, 894, 895, 896, 897, 898, 899, 900, 901, 902, 903, 904, 905]);
// Wyndon / Legendaries
const REGION9 = new Set([888, 889, 890]);

function assignRegion(id: number, types: string[], _bst: number, isLegendary: boolean): string {
  if (isLegendary || id === 888 || id === 889 || id === 890) return '9';
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
  if (types.includes('fairy') || types.includes('ghost')) return '5';
  if (types.includes('ice') || types.includes('rock')) return '6';
  if (types.includes('fire') || types.includes('poison')) return '4';
  if (types.includes('water')) return '3';
  if (types.includes('grass')) return '2';
  return '1';
}

const regionNamesEn: Record<string, { name: string; description: string }> = {
  '1': { name: 'Postwick',       description: 'A quiet village where your adventure begins' },
  '2': { name: 'Turffield',      description: 'A town with mysterious geoglyphs on the hillside' },
  '3': { name: 'Hulbury',        description: 'A port town with a bustling marketplace' },
  '4': { name: 'Motostoke',      description: 'An industrial city powered by steam' },
  '5': { name: 'Stow-on-Side',   description: 'A town built into the face of a cliff' },
  '6': { name: 'Circhester',     description: 'A snowy city with a famous restaurant row' },
  '7': { name: 'Spikemuth',      description: 'A dark punk town nestled in the shadows' },
  '8': { name: 'Crown Tundra',   description: 'A frozen wilderness full of legendary Pokémon' },
  '9': { name: 'Wyndon',         description: 'The capital city where the Champion Cup is held' },
};

const regionNamesKo: Record<string, { name: string; description: string }> = {
  '1': { name: '브래서턴',     description: '모험이 시작되는 조용한 마을' },
  '2': { name: '터프시티',     description: '언덕 위 신비한 지상화가 있는 마을' },
  '3': { name: '바우타운',     description: '활기찬 시장이 있는 항구 마을' },
  '4': { name: '엔진시티',     description: '증기로 움직이는 산업 도시' },
  '5': { name: '라테라타운',   description: '절벽에 지어진 마을' },
  '6': { name: '키르크스타운', description: '유명한 레스토랑 거리의 눈 덮인 도시' },
  '7': { name: '스파이크타운', description: '그림자 속에 숨은 어둡고 펑크한 마을' },
  '8': { name: '크라운 툰드라', description: '전설 포켓몬으로 가득한 얼어붙은 황야' },
  '9': { name: '슛시티',       description: '챔피언 컵이 열리는 수도' },
};

const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: 'First Catch',        description: 'Catch your first wild Pokémon',             rarity_label: 'Common' },
  catch_10:         { name: 'Grass Badge',         description: 'Catch 10 Pokémon',                          rarity_label: 'Common' },
  catch_20:         { name: 'Water Badge',         description: 'Catch 20 Pokémon',                          rarity_label: 'Uncommon' },
  catch_30:         { name: 'Fire Badge',          description: 'Catch 30 Pokémon',                          rarity_label: 'Uncommon' },
  catch_40:         { name: 'Fighting Badge',      description: 'Catch 40 Pokémon',                          rarity_label: 'Rare' },
  catch_55:         { name: 'Fairy Badge',         description: 'Catch 55 Pokémon',                          rarity_label: 'Rare' },
  catch_70:         { name: 'Rock Badge',          description: 'Catch 70 Pokémon',                          rarity_label: 'Epic' },
  catch_85:         { name: 'Dragon Badge',        description: 'Catch 85 Pokémon',                          rarity_label: 'Epic' },
  catch_96:         { name: 'Galar Champion',      description: 'Complete the Galar Pokédex!',               rarity_label: 'Legendary' },
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
  all_starters:     { name: "Magnolia's Pride",    description: 'Obtain all three Galar starters',           rarity_label: 'Uncommon' },
};

const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: '첫 포획',          description: '처음으로 야생 포켓몬을 잡다',             rarity_label: '일반' },
  catch_10:         { name: '그래스배지',       description: '포켓몬 10마리 포획',                      rarity_label: '일반' },
  catch_20:         { name: '워터배지',         description: '포켓몬 20마리 포획',                      rarity_label: '고급' },
  catch_30:         { name: '파이어배지',       description: '포켓몬 30마리 포획',                      rarity_label: '고급' },
  catch_40:         { name: '파이팅배지',       description: '포켓몬 40마리 포획',                      rarity_label: '희귀' },
  catch_55:         { name: '페어리배지',       description: '포켓몬 55마리 포획',                      rarity_label: '희귀' },
  catch_70:         { name: '록배지',           description: '포켓몬 70마리 포획',                      rarity_label: '에픽' },
  catch_85:         { name: '드래곤배지',       description: '포켓몬 85마리 포획',                      rarity_label: '에픽' },
  catch_96:         { name: '가라르 챔피언',    description: '가라르 도감을 완성하라!',                 rarity_label: '전설' },
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
  all_starters:     { name: '매그놀리아 박사의 자부심', description: '가라르 스타터 3마리 모두 획득',   rarity_label: '고급' },
};

const achievements = [
  { id: 'first_catch',     trigger_type: 'catch_count',     trigger_value: 1,   reward_pokemon: null, rarity: 1 },
  { id: 'catch_10',        trigger_type: 'catch_count',     trigger_value: 10,  reward_pokemon: null, rarity: 1 },
  { id: 'catch_20',        trigger_type: 'catch_count',     trigger_value: 20,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_30',        trigger_type: 'catch_count',     trigger_value: 30,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_40',        trigger_type: 'catch_count',     trigger_value: 40,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_55',        trigger_type: 'catch_count',     trigger_value: 55,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_70',        trigger_type: 'catch_count',     trigger_value: 70,  reward_pokemon: null, rarity: 4 },
  { id: 'catch_85',        trigger_type: 'catch_count',     trigger_value: 85,  reward_pokemon: null, rarity: 4 },
  { id: 'catch_96',        trigger_type: 'catch_count',     trigger_value: 96,  reward_pokemon: '890', rarity: 5 },
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
    reward_effects: [{ type: 'require_pokemon', pokemon: ['810', '813', '816'] }] },
];

const pokedexRewards = {
  milestones: [
    { id: 'catch_10_reward',  threshold: 10,  reward_type: 'pokeball',         reward_value: 3,   label: { en: 'Catch 10 — 3 Poké Balls',             ko: '10마리 포획 — 몬스터볼 3개' } },
    { id: 'catch_20_reward',  threshold: 20,  reward_type: 'pokeball',         reward_value: 5,   label: { en: 'Catch 20 — 5 Poké Balls',             ko: '20마리 포획 — 몬스터볼 5개' } },
    { id: 'catch_40_reward',  threshold: 40,  reward_type: 'xp_multiplier',    reward_value: 1.1, legendary_bonus: 'hero_duo', label: { en: 'Catch 40 — Hero Duo encounter!', ko: '40마리 포획 — 영웅 듀오 조우!' } },
    { id: 'catch_55_reward',  threshold: 55,  reward_type: 'legendary_unlock', reward_value: 'hero_duo', label: { en: 'Catch 55 — Hero Duo encounter!', ko: '55마리 포획 — 영웅 듀오 조우!' } },
    { id: 'catch_70_reward',  threshold: 70,  reward_type: 'legendary_unlock', reward_value: 'eternatus', label: { en: 'Catch 70 — Eternatus!', ko: '70마리 포획 — 무한다이노 조우!' } },
    { id: 'catch_85_reward',  threshold: 85,  reward_type: 'legendary_unlock', reward_value: 'crown_legends', label: { en: 'Catch 85 — Crown Legends!', ko: '85마리 포획 — 크라운 전설!' } },
    { id: 'catch_96_reward',  threshold: 96,  reward_type: 'legendary_unlock', reward_value: 'mythicals', label: { en: 'Catch all 96 — Mythicals!', ko: '96마리 포획 — 환상의 포켓몬!' } },
  ],
  legendary_groups: {
    hero_duo: {
      label:       { en: 'Hero Duo', ko: '영웅 듀오' },
      description: { en: 'The legendary wolves of Galar', ko: '가라르의 전설의 늑대' },
      options: ['888', '889'],
    },
    eternatus: {
      label:       { en: 'Eternatus', ko: '무한다이노' },
      description: { en: 'The Pokémon that nearly caused the Darkest Day', ko: '다크니스 데이를 일으킬 뻔한 포켓몬' },
      options: ['890'],
    },
    crown_legends: {
      label:       { en: 'Crown Tundra Legends', ko: '크라운 툰드라 전설' },
      description: { en: 'Legendary Pokémon of the Crown Tundra', ko: '크라운 툰드라의 전설 포켓몬' },
      options: ['894', '895', '896', '897', '898'],
    },
    mythicals: {
      label:       { en: 'Galar Mythicals', ko: '가라르 환상' },
      description: { en: 'The mythical Pokémon of Galar', ko: '가라르 지방의 환상 포켓몬' },
      options: ['891', '892', '893'],
    },
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
      options: ['888', '889', '890'],
    },
  },
  type_master: {
    xp_bonus: 0.1,
    legendary_unlock_threshold: 3,
    legendary_group: 'special_legends',
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
      options: ['888', '889', '890'],
    },
  },
  chain_completion_reward: { pokeball_count: 1 },
};

async function main() {
  console.log('Gen 8 (Galar) Data Generator — Fetching #810-#905 from PokeAPI\n');
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

  console.log(`\n=== Gen 8 Generation Complete ===`);
  console.log(`  Species: ${Object.keys(pokemonEntries).length}`);
  console.log(`  Regions: 9 | Achievements: ${achievements.length} | i18n: en + ko`);
  if (errors.length > 0) {
    console.log(`\n  ${errors.length} errors:`);
    for (const e of errors) console.log(`    ${e}`);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
