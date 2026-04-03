#!/usr/bin/env tsx
/**
 * Gen 7 (Alola) Data Generator
 * Fetches from PokeAPI: 88 species (#722-#809), evolution chains, sprites, cries, i18n names
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
const DATA_DIR = join(PROJECT_ROOT, 'data', 'gen7');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN_START = 722;
const GEN_END = 809;
const STARTERS: number[] = [722, 725, 728];

const REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15],   unlock_condition: null },
  '2': { pokemon_pool: [], level_range: [8, 22],   unlock_condition: { type: 'pokedex_seen', value: 5 } },
  '3': { pokemon_pool: [], level_range: [15, 30],  unlock_condition: { type: 'pokedex_seen', value: 10 } },
  '4': { pokemon_pool: [], level_range: [20, 35],  unlock_condition: { type: 'pokedex_caught', value: 8 } },
  '5': { pokemon_pool: [], level_range: [25, 40],  unlock_condition: { type: 'pokedex_caught', value: 15 } },
  '6': { pokemon_pool: [], level_range: [30, 45],  unlock_condition: { type: 'pokedex_caught', value: 25 } },
  '7': { pokemon_pool: [], level_range: [35, 55],  unlock_condition: { type: 'pokedex_caught', value: 35 } },
  '8': { pokemon_pool: [], level_range: [40, 65],  unlock_condition: { type: 'pokedex_caught', value: 45 } },
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 60 } },
};

// Melemele Island
const REGION1 = new Set([722, 723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736, 737, 738]);
// Hau'oli City area
const REGION2 = new Set([739, 740, 741, 742, 743, 744, 745, 746]);
// Akala Island - Heahea/Royal Avenue
const REGION3 = new Set([747, 748, 749, 750, 751, 752, 753, 754, 755, 756]);
// Akala Island - Konikoni
const REGION4 = new Set([757, 758, 759, 760, 761, 762, 763, 764, 765]);
// Ula'ula Island - Malie
const REGION5 = new Set([766, 767, 768, 769, 770, 771, 772, 773, 774, 775]);
// Ula'ula - Po Town area
const REGION6 = new Set([776, 777, 778, 779, 780, 781, 782, 783, 784]);
// Tapu Village
const REGION7 = new Set([785, 786, 787, 788]);
// Ultra Beasts
const REGION8 = new Set([793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806]);
// Mount Lanakila / Legendaries
const REGION9 = new Set([789, 790, 791, 792, 800, 801, 802, 807, 808, 809]);

function assignRegion(id: number, types: string[], _bst: number, isLegendary: boolean): string {
  if (isLegendary || id >= 789) return '9';
  if (REGION1.has(id)) return '1';
  if (REGION2.has(id)) return '2';
  if (REGION3.has(id)) return '3';
  if (REGION4.has(id)) return '4';
  if (REGION5.has(id)) return '5';
  if (REGION6.has(id)) return '6';
  if (REGION7.has(id)) return '7';
  if (REGION8.has(id)) return '8';
  if (REGION9.has(id)) return '9';
  if (types.includes('dragon')) return '6';
  if (types.includes('ghost') || types.includes('dark')) return '5';
  if (types.includes('water') || types.includes('poison')) return '3';
  if (types.includes('fire') || types.includes('fighting')) return '4';
  if (types.includes('electric') || types.includes('steel')) return '2';
  return '1';
}

const regionNamesEn: Record<string, { name: string; description: string }> = {
  '1': { name: 'Iki Town',         description: 'A town where traditions of Alola are celebrated' },
  '2': { name: "Hau'oli City",     description: 'The largest city in the Alola region' },
  '3': { name: 'Heahea City',      description: 'A resort city on Akala Island' },
  '4': { name: 'Konikoni City',    description: 'A seaside city with a vibrant market' },
  '5': { name: 'Malie City',       description: 'A city with a Far East-inspired garden' },
  '6': { name: 'Po Town',          description: 'A town taken over by Team Skull' },
  '7': { name: 'Tapu Village',     description: 'A village destroyed by the Tapu long ago' },
  '8': { name: 'Ultra Space',      description: 'An alternate dimension home to Ultra Beasts' },
  '9': { name: 'Mount Lanakila',   description: 'The peak of Alola where the League awaits' },
};

const regionNamesKo: Record<string, { name: string; description: string }> = {
  '1': { name: '이키마을',       description: '알로라의 전통을 기념하는 마을' },
  '2': { name: '하우올리시티',   description: '알로라 지방에서 가장 큰 도시' },
  '3': { name: '카니칼시티',     description: '아칼라섬의 리조트 도시' },
  '4': { name: '코니코시티',     description: '활기찬 시장이 있는 해변 도시' },
  '5': { name: '말리에시티',     description: '동양풍 정원이 있는 도시' },
  '6': { name: '포타운',         description: '스컬단이 점거한 마을' },
  '7': { name: '카푸마을',       description: '오래 전 카푸에 의해 파괴된 마을' },
  '8': { name: '울트라스페이스', description: '울트라비스트가 사는 이차원 공간' },
  '9': { name: '라나키라마운틴', description: '리그가 기다리는 알로라의 정상' },
};

const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: 'First Catch',        description: 'Catch your first wild Pokémon',             rarity_label: 'Common' },
  catch_10:         { name: 'Melemele Trial',      description: 'Catch 10 Pokémon',                          rarity_label: 'Common' },
  catch_20:         { name: 'Akala Trial',         description: 'Catch 20 Pokémon',                          rarity_label: 'Uncommon' },
  catch_35:         { name: "Ula'ula Trial",       description: 'Catch 35 Pokémon',                          rarity_label: 'Uncommon' },
  catch_50:         { name: 'Poni Trial',          description: 'Catch 50 Pokémon',                          rarity_label: 'Rare' },
  catch_65:         { name: 'Island Challenge',    description: 'Catch 65 Pokémon',                          rarity_label: 'Epic' },
  catch_80:         { name: 'Grand Trial',         description: 'Catch 80 Pokémon',                          rarity_label: 'Epic' },
  catch_88:         { name: 'Alola Champion',      description: 'Complete the Alola Pokédex!',               rarity_label: 'Legendary' },
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
  all_starters:     { name: "Kukui's Pride",       description: 'Obtain all three Alola starters',           rarity_label: 'Uncommon' },
  tapu_quartet:     { name: 'Guardian Deities',    description: 'Obtain all four Tapu guardians',            rarity_label: 'Rare' },
};

const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:      { name: '첫 포획',          description: '처음으로 야생 포켓몬을 잡다',             rarity_label: '일반' },
  catch_10:         { name: '멜레멜레 시련',    description: '포켓몬 10마리 포획',                      rarity_label: '일반' },
  catch_20:         { name: '아칼라 시련',      description: '포켓몬 20마리 포획',                      rarity_label: '고급' },
  catch_35:         { name: '울라울라 시련',    description: '포켓몬 35마리 포획',                      rarity_label: '고급' },
  catch_50:         { name: '포니 시련',        description: '포켓몬 50마리 포획',                      rarity_label: '희귀' },
  catch_65:         { name: '섬 순례',          description: '포켓몬 65마리 포획',                      rarity_label: '에픽' },
  catch_80:         { name: '대시련',           description: '포켓몬 80마리 포획',                      rarity_label: '에픽' },
  catch_88:         { name: '알로라 챔피언',    description: '알로라 도감을 완성하라!',                 rarity_label: '전설' },
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
  all_starters:     { name: '쿠쿠이 박사의 자부심', description: '알로라 스타터 3마리 모두 획득',       rarity_label: '고급' },
  tapu_quartet:     { name: '수호신 사천왕',    description: '카푸 수호신 4마리 모두 획득',            rarity_label: '희귀' },
};

const achievements = [
  { id: 'first_catch',     trigger_type: 'catch_count',     trigger_value: 1,   reward_pokemon: null, rarity: 1 },
  { id: 'catch_10',        trigger_type: 'catch_count',     trigger_value: 10,  reward_pokemon: null, rarity: 1 },
  { id: 'catch_20',        trigger_type: 'catch_count',     trigger_value: 20,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_35',        trigger_type: 'catch_count',     trigger_value: 35,  reward_pokemon: null, rarity: 2 },
  { id: 'catch_50',        trigger_type: 'catch_count',     trigger_value: 50,  reward_pokemon: null, rarity: 3 },
  { id: 'catch_65',        trigger_type: 'catch_count',     trigger_value: 65,  reward_pokemon: null, rarity: 4 },
  { id: 'catch_80',        trigger_type: 'catch_count',     trigger_value: 80,  reward_pokemon: null, rarity: 4 },
  { id: 'catch_88',        trigger_type: 'catch_count',     trigger_value: 88,  reward_pokemon: '809', rarity: 5 },
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
    reward_effects: [{ type: 'require_pokemon', pokemon: ['722', '725', '728'] }] },
  { id: 'tapu_quartet',    trigger_type: 'specific_pokemon', trigger_value: 4,  reward_pokemon: null, rarity: 3,
    reward_effects: [{ type: 'require_pokemon', pokemon: ['785', '786', '787', '788'] }] },
];

const pokedexRewards = {
  milestones: [
    { id: 'catch_10_reward',  threshold: 10,  reward_type: 'pokeball',         reward_value: 3,   label: { en: 'Catch 10 — 3 Poké Balls',             ko: '10마리 포획 — 몬스터볼 3개' } },
    { id: 'catch_20_reward',  threshold: 20,  reward_type: 'pokeball',         reward_value: 5,   label: { en: 'Catch 20 — 5 Poké Balls',             ko: '20마리 포획 — 몬스터볼 5개' } },
    { id: 'catch_35_reward',  threshold: 35,  reward_type: 'xp_multiplier',    reward_value: 1.1, legendary_bonus: 'tapus', label: { en: 'Catch 35 — Tapu encounter!', ko: '35마리 포획 — 카푸 조우!' } },
    { id: 'catch_50_reward',  threshold: 50,  reward_type: 'legendary_unlock', reward_value: 'tapus', label: { en: 'Catch 50 — Tapu encounter!', ko: '50마리 포획 — 카푸 조우!' } },
    { id: 'catch_65_reward',  threshold: 65,  reward_type: 'legendary_unlock', reward_value: 'light_trio', label: { en: 'Catch 65 — Light Trio!', ko: '65마리 포획 — 빛 트리오 조우!' } },
    { id: 'catch_80_reward',  threshold: 80,  reward_type: 'legendary_unlock', reward_value: 'ultra_beasts', label: { en: 'Catch 80 — Ultra Beasts!', ko: '80마리 포획 — 울트라비스트!' } },
    { id: 'catch_88_reward',  threshold: 88,  reward_type: 'legendary_unlock', reward_value: 'mythicals', label: { en: 'Catch all 88 — Mythicals!', ko: '88마리 포획 — 환상의 포켓몬!' } },
  ],
  legendary_groups: {
    tapus: {
      label:       { en: 'Guardian Deities', ko: '수호신' },
      description: { en: 'The four guardian deities of Alola', ko: '알로라의 네 수호신' },
      options: ['785', '786', '787', '788'],
    },
    light_trio: {
      label:       { en: 'Light Trio', ko: '빛 트리오' },
      description: { en: 'The emissaries of the sun and moon', ko: '태양과 달의 사자' },
      options: ['791', '792', '800'],
    },
    ultra_beasts: {
      label:       { en: 'Ultra Beasts', ko: '울트라비스트' },
      description: { en: 'Mysterious creatures from Ultra Space', ko: '울트라스페이스의 신비한 존재' },
      options: ['793', '794', '795', '796', '797', '798', '799', '803', '804', '805', '806'],
    },
    mythicals: {
      label:       { en: 'Alola Mythicals', ko: '알로라 환상' },
      description: { en: 'The mythical Pokémon of Alola', ko: '알로라 지방의 환상 포켓몬' },
      options: ['801', '802', '807', '808', '809'],
    },
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
      options: ['791', '792', '800'],
    },
  },
  type_master: {
    xp_bonus: 0.1,
    legendary_unlock_threshold: 3,
    legendary_group: 'special_legends',
    special_legends: {
      label:       { en: 'Special Legends', ko: '스페셜 전설' },
      description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
      options: ['791', '792', '800'],
    },
  },
  chain_completion_reward: { pokeball_count: 1 },
};

async function main() {
  console.log('Gen 7 (Alola) Data Generator — Fetching #722-#809 from PokeAPI\n');
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

  console.log(`\n=== Gen 7 Generation Complete ===`);
  console.log(`  Species: ${Object.keys(pokemonEntries).length}`);
  console.log(`  Regions: 9 | Achievements: ${achievements.length} | i18n: en + ko`);
  if (errors.length > 0) {
    console.log(`\n  ${errors.length} errors:`);
    for (const e of errors) console.log(`    ${e}`);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
