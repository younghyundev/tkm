#!/usr/bin/env tsx
/**
 * Gen 5 (Unova) Data Generator
 * Fetches from PokeAPI: 156 species (#494-#649), evolution chains, sprites, cries, i18n names
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
const DATA_DIR = join(PROJECT_ROOT, 'data', 'gen5');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN_START = 494;
const GEN_END = 649;
const STARTERS: number[] = [495, 498, 501];

// --- Unova region definitions (real game locations) ---
const REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15],   unlock_condition: null },                                    // Nuvema Town / Route 1-3
  '2': { pokemon_pool: [], level_range: [8, 22],   unlock_condition: { type: 'pokedex_seen', value: 5 } },     // Striaton City / Dreamyard
  '3': { pokemon_pool: [], level_range: [15, 30],  unlock_condition: { type: 'pokedex_seen', value: 15 } },    // Nacrene City / Pinwheel Forest
  '4': { pokemon_pool: [], level_range: [20, 35],  unlock_condition: { type: 'pokedex_caught', value: 10 } },  // Castelia City / Route 4
  '5': { pokemon_pool: [], level_range: [25, 40],  unlock_condition: { type: 'pokedex_caught', value: 20 } },  // Nimbasa City / Desert Resort
  '6': { pokemon_pool: [], level_range: [30, 45],  unlock_condition: { type: 'pokedex_caught', value: 30 } },  // Driftveil City / Cold Storage
  '7': { pokemon_pool: [], level_range: [35, 55],  unlock_condition: { type: 'pokedex_caught', value: 45 } },  // Mistralton City / Chargestone Cave
  '8': { pokemon_pool: [], level_range: [40, 65],  unlock_condition: { type: 'pokedex_caught', value: 60 } },  // Icirrus City / Dragonspiral Tower
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 80 } },  // Opelucid City / Victory Road
};

// Region assignments based on real Unova locations
const REGION1 = new Set([494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 519, 520, 521, 517, 518]);
const REGION2 = new Set([511, 512, 513, 514, 515, 516, 522, 523, 531, 532, 533, 534]);
const REGION3 = new Set([535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549]);
const REGION4 = new Set([550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561]);
const REGION5 = new Set([562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581]);
const REGION6 = new Set([582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 616, 617]);
const REGION7 = new Set([602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 618, 619, 620, 621]);
const REGION8 = new Set([622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637]);
const REGION9 = new Set([638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649]);

function assignRegion(id: number, types: string[], _bst: number, isLegendary: boolean): string {
  if (isLegendary || id >= 638) return '9';
  if (REGION1.has(id)) return '1';
  if (REGION2.has(id)) return '2';
  if (REGION3.has(id)) return '3';
  if (REGION4.has(id)) return '4';
  if (REGION5.has(id)) return '5';
  if (REGION6.has(id)) return '6';
  if (REGION7.has(id)) return '7';
  if (REGION8.has(id)) return '8';
  if (REGION9.has(id)) return '9';
  if (types.includes('dragon')) return '8';
  if (types.includes('ice') || types.includes('steel')) return '7';
  if (types.includes('electric')) return '6';
  if (types.includes('ground') || types.includes('dark')) return '4';
  if (types.includes('bug') || types.includes('grass')) return '3';
  if (types.includes('fire') || types.includes('normal')) return '2';
  return '1';
}

// --- i18n data ---
const regionNamesEn: Record<string, { name: string; description: string }> = {
  '1': { name: 'Nuvema Town',     description: 'A rural town whose sea breezes give pokémon energy' },
  '2': { name: 'Striaton City',   description: 'Three brothers guard this vibrant city' },
  '3': { name: 'Nacrene City',    description: 'A city of art and ancient fossils' },
  '4': { name: 'Castelia City',   description: 'A massive metropolis of towering skyscrapers' },
  '5': { name: 'Nimbasa City',    description: 'An entertainment city of bright lights and energy' },
  '6': { name: 'Driftveil City',  description: 'A port city where commerce flows like the wind' },
  '7': { name: 'Mistralton City', description: 'A city where cargo planes take off into the sky' },
  '8': { name: 'Icirrus City',    description: 'A frozen city near the Dragonspiral Tower' },
  '9': { name: 'Opelucid City',   description: 'A city where the past and future collide' },
};

const regionNamesKo: Record<string, { name: string; description: string }> = {
  '1': { name: '넝쿨마을',       description: '바다 바람이 포켓몬에게 힘을 주는 시골 마을' },
  '2': { name: '산요우시티',     description: '세 형제가 지키는 활기찬 도시' },
  '3': { name: '시집시티',       description: '예술과 고대 화석의 도시' },
  '4': { name: '히운시티',       description: '우뚝 솟은 마천루의 거대 도시' },
  '5': { name: '라이몬시티',     description: '밝은 빛과 에너지의 엔터테인먼트 도시' },
  '6': { name: '호도모에시티',   description: '바람처럼 상업이 흐르는 항구 도시' },
  '7': { name: '후키요세시티',   description: '화물기가 하늘로 이륙하는 도시' },
  '8': { name: '셋카시티',       description: '용의 나선탑 근처 얼어붙은 도시' },
  '9': { name: '소류시티',       description: '과거와 미래가 충돌하는 도시' },
};

const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: 'First Catch',        description: 'Catch your first wild Pokémon',             rarity_label: 'Common' },
  catch_10:         { name: 'Trio Badge',          description: 'Catch 10 Pokémon',                          rarity_label: 'Common' },
  catch_25:         { name: 'Basic Badge',         description: 'Catch 25 Pokémon',                          rarity_label: 'Uncommon' },
  catch_50:         { name: 'Insect Badge',        description: 'Catch 50 Pokémon',                          rarity_label: 'Uncommon' },
  catch_75:         { name: 'Bolt Badge',          description: 'Catch 75 Pokémon',                          rarity_label: 'Rare' },
  catch_100:        { name: 'Quake Badge',         description: 'Catch 100 Pokémon',                         rarity_label: 'Rare' },
  catch_120:        { name: 'Jet Badge',           description: 'Catch 120 Pokémon',                         rarity_label: 'Epic' },
  catch_140:        { name: 'Freeze Badge',        description: 'Catch 140 Pokémon',                         rarity_label: 'Epic' },
  catch_156:        { name: 'Legend Badge',         description: 'Complete the Unova Pokédex!',               rarity_label: 'Legendary' },
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
  all_starters:     { name: "Juniper's Pride",     description: 'Obtain all three Unova starters',           rarity_label: 'Uncommon' },
  sword_trio:       { name: 'Swords of Justice',   description: 'Obtain Cobalion, Terrakion, and Virizion',  rarity_label: 'Rare' },
};

const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: '첫 포획',          description: '처음으로 야생 포켓몬을 잡다',             rarity_label: '일반' },
  catch_10:         { name: '트리오배지',       description: '포켓몬 10마리 포획',                      rarity_label: '일반' },
  catch_25:         { name: '베이직배지',       description: '포켓몬 25마리 포획',                      rarity_label: '고급' },
  catch_50:         { name: '인섹트배지',       description: '포켓몬 50마리 포획',                      rarity_label: '고급' },
  catch_75:         { name: '볼트배지',         description: '포켓몬 75마리 포획',                      rarity_label: '희귀' },
  catch_100:        { name: '퀘이크배지',       description: '포켓몬 100마리 포획',                     rarity_label: '희귀' },
  catch_120:        { name: '제트배지',         description: '포켓몬 120마리 포획',                     rarity_label: '에픽' },
  catch_140:        { name: '아이시클배지',     description: '포켓몬 140마리 포획',                     rarity_label: '에픽' },
  catch_156:        { name: '레전드배지',       description: '하나 도감을 완성하라!',                   rarity_label: '전설' },
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
  all_starters:     { name: '주박사의 자부심',  description: '하나 스타터 3마리 모두 획득',             rarity_label: '고급' },
  sword_trio:       { name: '삼검사',           description: '코바르온, 테라키온, 비리디온 모두 획득', rarity_label: '희귀' },
};

const achievements = [
  { id: 'first_catch',     trigger_type: 'catch_count',     trigger_value: 1,   reward_pokemon: null, rarity: 1 },
  { id: 'catch_10',        trigger_type: 'catch_count',     trigger_value: 10,  reward_pokemon: null, rarity: 1 },
  { id: 'catch_25',        trigger_type: 'catch_count',     trigger_value: 25,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_50',        trigger_type: 'catch_count',     trigger_value: 50,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_75',        trigger_type: 'catch_count',     trigger_value: 75,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_100',       trigger_type: 'catch_count',     trigger_value: 100, reward_pokemon: null, rarity: 3 },
  { id: 'catch_120',       trigger_type: 'catch_count',     trigger_value: 120, reward_pokemon: null, rarity: 4 },
  { id: 'catch_140',       trigger_type: 'catch_count',     trigger_value: 140, reward_pokemon: null, rarity: 4 },
  { id: 'catch_156',       trigger_type: 'catch_count',     trigger_value: 156, reward_pokemon: '649', rarity: 5 },
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
    reward_effects: [{ type: 'require_pokemon', pokemon: ['495', '498', '501'] }] },
  { id: 'sword_trio',      trigger_type: 'specific_pokemon', trigger_value: 3,  reward_pokemon: null, rarity: 3,
    reward_effects: [{ type: 'require_pokemon', pokemon: ['638', '639', '640'] }] },
];

const pokedexRewards = {
  milestones: [
    { id: 'catch_10_reward',  threshold: 10,  reward_type: 'pokeball',         reward_value: 3,   label: { en: 'Catch 10 — 3 Poké Balls',              ko: '10마리 포획 — 몬스터볼 3개' } },
    { id: 'catch_25_reward',  threshold: 25,  reward_type: 'pokeball',         reward_value: 5,   label: { en: 'Catch 25 — 5 Poké Balls',              ko: '25마리 포획 — 몬스터볼 5개' } },
    { id: 'catch_50_reward',  threshold: 50,  reward_type: 'xp_multiplier',    reward_value: 1.1, legendary_bonus: 'tao_trio', label: { en: 'Catch 50 — Tao Dragon encounter!', ko: '50마리 포획 — 도삼룡 조우!' } },
    { id: 'catch_70_reward',  threshold: 70,  reward_type: 'legendary_unlock', reward_value: 'tao_trio', legendary_bonus: 'tao_trio', label: { en: 'Catch 70 — Tao Dragon encounter!', ko: '70마리 포획 — 도삼룡 조우!' } },
    { id: 'catch_90_reward',  threshold: 90,  reward_type: 'legendary_unlock', reward_value: 'swords_of_justice', label: { en: 'Catch 90 — Swords of Justice!', ko: '90마리 포획 — 삼검사 조우!' } },
    { id: 'catch_120_reward', threshold: 120, reward_type: 'legendary_unlock', reward_value: 'forces_of_nature', label: { en: 'Catch 120 — Forces of Nature!', ko: '120마리 포획 — 자연의 힘 조우!' } },
    { id: 'catch_156_reward', threshold: 156, reward_type: 'legendary_unlock', reward_value: 'mythicals', label: { en: 'Catch all 156 — Mythicals!', ko: '156마리 포획 — 환상의 포켓몬!' } },
  ],
  legendary_groups: {
    tao_trio: {
      label:       { en: 'Tao Trio', ko: '도삼룡' },
      description: { en: 'The dragons of truth, ideals, and emptiness', ko: '진실, 이상, 공허의 드래곤' },
      options: ['643', '644', '646'],
    },
    swords_of_justice: {
      label:       { en: 'Swords of Justice', ko: '삼검사' },
      description: { en: 'The righteous sword trio of Unova', ko: '하나 지방의 정의의 삼검사' },
      options: ['638', '639', '640'],
    },
    forces_of_nature: {
      label:       { en: 'Forces of Nature', ko: '자연의 힘' },
      description: { en: 'The legendary forces that command weather', ko: '날씨를 지배하는 전설의 힘' },
      options: ['641', '642', '645'],
    },
    mythicals: {
      label:       { en: 'Unova Mythicals', ko: '하나 환상' },
      description: { en: 'The mythical Pokémon of Unova', ko: '하나 지방의 환상 포켓몬' },
      options: ['494', '647', '648', '649'],
    },
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
      options: ['643', '644', '646'],
    },
  },
  type_master: {
    xp_bonus: 0.1,
    legendary_unlock_threshold: 3,
    legendary_group: 'special_legends',
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
      options: ['643', '644', '646'],
    },
  },
  chain_completion_reward: { pokeball_count: 1 },
};

async function main() {
  console.log('Gen 5 (Unova) Data Generator — Fetching #494-#649 from PokeAPI\n');
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

  console.log(`\n=== Gen 5 Generation Complete ===`);
  console.log(`  Species: ${Object.keys(pokemonEntries).length}`);
  console.log(`  Regions: 9 | Achievements: ${achievements.length} | i18n: en + ko`);
  if (errors.length > 0) {
    console.log(`\n  ${errors.length} errors:`);
    for (const e of errors) console.log(`    ${e}`);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
