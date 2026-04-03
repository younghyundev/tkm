#!/usr/bin/env tsx
/**
 * Gen 6 (Kalos) Data Generator
 * Fetches from PokeAPI: 72 species (#650-#721), evolution chains, sprites, cries, i18n names
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
const DATA_DIR = join(PROJECT_ROOT, 'data', 'gen6');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN_START = 650;
const GEN_END = 721;
const STARTERS: number[] = [650, 653, 656];

const REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15],   unlock_condition: null },
  '2': { pokemon_pool: [], level_range: [8, 22],   unlock_condition: { type: 'pokedex_seen', value: 5 } },
  '3': { pokemon_pool: [], level_range: [15, 30],  unlock_condition: { type: 'pokedex_seen', value: 10 } },
  '4': { pokemon_pool: [], level_range: [20, 35],  unlock_condition: { type: 'pokedex_caught', value: 8 } },
  '5': { pokemon_pool: [], level_range: [25, 40],  unlock_condition: { type: 'pokedex_caught', value: 15 } },
  '6': { pokemon_pool: [], level_range: [30, 45],  unlock_condition: { type: 'pokedex_caught', value: 22 } },
  '7': { pokemon_pool: [], level_range: [35, 55],  unlock_condition: { type: 'pokedex_caught', value: 30 } },
  '8': { pokemon_pool: [], level_range: [40, 65],  unlock_condition: { type: 'pokedex_caught', value: 40 } },
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 55 } },
};

const REGION1 = new Set([650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 672, 673]);
const REGION2 = new Set([669, 670, 671, 676, 677, 678]);
const REGION3 = new Set([679, 680, 681, 688, 689, 690, 691, 692, 693, 694, 695]);
const REGION4 = new Set([674, 675, 686, 687, 696, 697, 698, 699, 701]);
const REGION5 = new Set([682, 683, 684, 685, 702, 703, 704, 705, 706]);
const REGION6 = new Set([707, 708, 709, 710, 711, 712, 713, 714, 715]);
const REGION7 = new Set([700]);
const REGION8 = new Set([]);
const REGION9 = new Set([716, 717, 718, 719, 720, 721]);

function assignRegion(id: number, types: string[], _bst: number, isLegendary: boolean): string {
  if (isLegendary || id >= 716) return '9';
  if (REGION1.has(id)) return '1';
  if (REGION2.has(id)) return '2';
  if (REGION3.has(id)) return '3';
  if (REGION4.has(id)) return '4';
  if (REGION5.has(id)) return '5';
  if (REGION6.has(id)) return '6';
  if (REGION7.has(id)) return '7';
  if (types.includes('fairy')) return '7';
  if (types.includes('ghost') || types.includes('ice')) return '6';
  if (types.includes('dragon')) return '5';
  if (types.includes('fighting') || types.includes('rock')) return '4';
  if (types.includes('water') || types.includes('steel')) return '3';
  if (types.includes('bug') || types.includes('grass')) return '2';
  return '1';
}

const regionNamesEn: Record<string, { name: string; description: string }> = {
  '1': { name: 'Vaniville Town',  description: 'A Pokemon adventure begins in this Pokemon-friendly town' },
  '2': { name: 'Santalune City',  description: 'A fragrant city enveloped in flowers' },
  '3': { name: 'Cyllage City',    description: 'A city nestled between the cliffs and the sea' },
  '4': { name: 'Shalour City',    description: 'A city of ancient secrets and mega evolution' },
  '5': { name: 'Coumarine City',  description: 'A seaside city with a bustling marketplace' },
  '6': { name: 'Lumiose City',    description: 'The dazzling City of Light and center of Kalos' },
  '7': { name: 'Laverre City',    description: 'A fairy-tale city overflowing with nature' },
  '8': { name: 'Anistar City',    description: 'A mysterious city with a sundial of cosmic origin' },
  '9': { name: 'Snowbelle City',  description: 'A frozen city in the depths of the Kalos wilderness' },
};

const regionNamesKo: Record<string, { name: string; description: string }> = {
  '1': { name: '아사메마을',   description: '포켓몬과 함께하는 모험이 시작되는 마을' },
  '2': { name: '백단시티',     description: '꽃향기에 감싸인 도시' },
  '3': { name: '쇼요시티',     description: '절벽과 바다 사이에 자리한 도시' },
  '4': { name: '샤라시티',     description: '고대의 비밀과 메가진화의 도시' },
  '5': { name: '향전시티',     description: '활기찬 시장이 있는 해변 도시' },
  '6': { name: '미아레시티',   description: '빛의 도시, 칼로스의 중심' },
  '7': { name: '쿠노에시티',   description: '자연이 넘치는 동화 같은 도시' },
  '8': { name: '혜성시티',     description: '우주 기원의 해시계가 있는 신비한 도시' },
  '9': { name: '에이세쓰시티', description: '칼로스 오지의 얼어붙은 도시' },
};

const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: 'First Catch',        description: 'Catch your first wild Pokémon',             rarity_label: 'Common' },
  catch_10:         { name: 'Bug Badge',           description: 'Catch 10 Pokémon',                          rarity_label: 'Common' },
  catch_20:         { name: 'Cliff Badge',         description: 'Catch 20 Pokémon',                          rarity_label: 'Uncommon' },
  catch_30:         { name: 'Rumble Badge',        description: 'Catch 30 Pokémon',                          rarity_label: 'Uncommon' },
  catch_40:         { name: 'Plant Badge',         description: 'Catch 40 Pokémon',                          rarity_label: 'Rare' },
  catch_50:         { name: 'Voltage Badge',       description: 'Catch 50 Pokémon',                          rarity_label: 'Rare' },
  catch_60:         { name: 'Fairy Badge',         description: 'Catch 60 Pokémon',                          rarity_label: 'Epic' },
  catch_72:         { name: 'Iceberg Badge',       description: 'Complete the Kalos Pokédex!',               rarity_label: 'Legendary' },
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
  all_starters:     { name: "Sycamore's Pride",    description: 'Obtain all three Kalos starters',           rarity_label: 'Uncommon' },
  fossil_duo:       { name: 'Fossil Duo',          description: 'Obtain both Tyrunt and Amaura',             rarity_label: 'Rare' },
};

const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: '첫 포획',          description: '처음으로 야생 포켓몬을 잡다',             rarity_label: '일반' },
  catch_10:         { name: '벅배지',           description: '포켓몬 10마리 포획',                      rarity_label: '일반' },
  catch_20:         { name: '클리프배지',       description: '포켓몬 20마리 포획',                      rarity_label: '고급' },
  catch_30:         { name: '럼블배지',         description: '포켓몬 30마리 포획',                      rarity_label: '고급' },
  catch_40:         { name: '플랜트배지',       description: '포켓몬 40마리 포획',                      rarity_label: '희귀' },
  catch_50:         { name: '볼티지배지',       description: '포켓몬 50마리 포획',                      rarity_label: '희귀' },
  catch_60:         { name: '페어리배지',       description: '포켓몬 60마리 포획',                      rarity_label: '에픽' },
  catch_72:         { name: '아이스버그배지',   description: '칼로스 도감을 완성하라!',                 rarity_label: '전설' },
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
  all_starters:     { name: '플라타느 박사의 자부심', description: '칼로스 스타터 3마리 모두 획득',     rarity_label: '고급' },
  fossil_duo:       { name: '화석 듀오',        description: '티고라스와 아마루스 모두 획득',          rarity_label: '희귀' },
};

const achievements = [
  { id: 'first_catch',     trigger_type: 'catch_count',     trigger_value: 1,   reward_pokemon: null, rarity: 1 },
  { id: 'catch_10',        trigger_type: 'catch_count',     trigger_value: 10,  reward_pokemon: null, rarity: 1 },
  { id: 'catch_20',        trigger_type: 'catch_count',     trigger_value: 20,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_30',        trigger_type: 'catch_count',     trigger_value: 30,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_40',        trigger_type: 'catch_count',     trigger_value: 40,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_50',        trigger_type: 'catch_count',     trigger_value: 50,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_60',        trigger_type: 'catch_count',     trigger_value: 60,  reward_pokemon: null, rarity: 4 },
  { id: 'catch_72',        trigger_type: 'catch_count',     trigger_value: 72,  reward_pokemon: '721', rarity: 5 },
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
    reward_effects: [{ type: 'require_pokemon', pokemon: ['650', '653', '656'] }] },
  { id: 'fossil_duo',      trigger_type: 'specific_pokemon', trigger_value: 2,  reward_pokemon: null, rarity: 3,
    reward_effects: [{ type: 'require_pokemon', pokemon: ['696', '698'] }] },
];

const pokedexRewards = {
  milestones: [
    { id: 'catch_10_reward',  threshold: 10,  reward_type: 'pokeball',         reward_value: 3,   label: { en: 'Catch 10 — 3 Poké Balls',            ko: '10마리 포획 — 몬스터볼 3개' } },
    { id: 'catch_20_reward',  threshold: 20,  reward_type: 'pokeball',         reward_value: 5,   label: { en: 'Catch 20 — 5 Poké Balls',            ko: '20마리 포획 — 몬스터볼 5개' } },
    { id: 'catch_35_reward',  threshold: 35,  reward_type: 'xp_multiplier',    reward_value: 1.1, legendary_bonus: 'aura_trio', label: { en: 'Catch 35 — Aura Trio encounter!', ko: '35마리 포획 — 오라 트리오 조우!' } },
    { id: 'catch_50_reward',  threshold: 50,  reward_type: 'legendary_unlock', reward_value: 'aura_trio', label: { en: 'Catch 50 — Aura Trio encounter!', ko: '50마리 포획 — 오라 트리오 조우!' } },
    { id: 'catch_60_reward',  threshold: 60,  reward_type: 'legendary_unlock', reward_value: 'aura_trio', label: { en: 'Catch 60 — Aura Trio encounter!', ko: '60마리 포획 — 오라 트리오 조우!' } },
    { id: 'catch_72_reward',  threshold: 72,  reward_type: 'legendary_unlock', reward_value: 'mythicals', label: { en: 'Catch all 72 — Mythicals!', ko: '72마리 포획 — 환상의 포켓몬!' } },
  ],
  legendary_groups: {
    aura_trio: {
      label:       { en: 'Aura Trio', ko: '오라 트리오' },
      description: { en: 'The legendary trio of life, destruction, and order', ko: '생명, 파괴, 질서의 전설 트리오' },
      options: ['716', '717', '718'],
    },
    mythicals: {
      label:       { en: 'Kalos Mythicals', ko: '칼로스 환상' },
      description: { en: 'The mythical Pokémon of Kalos', ko: '칼로스 지방의 환상 포켓몬' },
      options: ['719', '720', '721'],
    },
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
      options: ['716', '717', '718'],
    },
  },
  type_master: {
    xp_bonus: 0.1,
    legendary_unlock_threshold: 3,
    legendary_group: 'special_legends',
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
      options: ['716', '717', '718'],
    },
  },
  chain_completion_reward: { pokeball_count: 1 },
};

async function main() {
  console.log('Gen 6 (Kalos) Data Generator — Fetching #650-#721 from PokeAPI\n');
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

  console.log(`\n=== Gen 6 Generation Complete ===`);
  console.log(`  Species: ${Object.keys(pokemonEntries).length}`);
  console.log(`  Regions: 9 | Achievements: ${achievements.length} | i18n: en + ko`);
  if (errors.length > 0) {
    console.log(`\n  ${errors.length} errors:`);
    for (const e of errors) console.log(`    ${e}`);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
