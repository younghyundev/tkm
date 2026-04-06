#!/usr/bin/env tsx
/**
 * Gen 3 (Hoenn) Data Generator
 * Fetches from PokeAPI: 135 species (#252-#386), evolution chains, sprites, cries, i18n names
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
} from './lib/pokeapi-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const GEN3_DATA_DIR = join(PROJECT_ROOT, 'data', 'gen3');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN3_START = 252;
const GEN3_END = 386;
const STARTERS = [252, 255, 258];

// --- Hoenn region definitions ---
const HOENN_REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15],   unlock_condition: null },                                    // Littleroot Town / Route 101-103
  '2': { pokemon_pool: [], level_range: [8, 22],   unlock_condition: { type: 'pokedex_seen', value: 5 } },     // Rustboro City / Petalburg Woods
  '3': { pokemon_pool: [], level_range: [15, 30],  unlock_condition: { type: 'pokedex_seen', value: 15 } },    // Dewford Town / Granite Cave
  '4': { pokemon_pool: [], level_range: [20, 35],  unlock_condition: { type: 'pokedex_caught', value: 10 } },  // Slateport City / Route 110
  '5': { pokemon_pool: [], level_range: [25, 40],  unlock_condition: { type: 'pokedex_caught', value: 20 } },  // Mauville City / New Mauville
  '6': { pokemon_pool: [], level_range: [30, 45],  unlock_condition: { type: 'pokedex_caught', value: 30 } },  // Fortree City / Safari Zone
  '7': { pokemon_pool: [], level_range: [35, 55],  unlock_condition: { type: 'pokedex_caught', value: 45 } },  // Lilycove City / Mt. Pyre
  '8': { pokemon_pool: [], level_range: [40, 65],  unlock_condition: { type: 'pokedex_caught', value: 60 } },  // Mossdeep City / Seafloor Cavern
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 80 } },  // Ever Grande City / Victory Road
};

// --- Region pokemon assignment ---
function assignRegion(id: number, types: string[], bst: number, isLegendary: boolean): string {
  // Legendaries and mythicals → region 9
  if (isLegendary || [377, 378, 379, 380, 381, 382, 383, 384, 385, 386].includes(id)) return '9';

  // Region 1: Starters + early routes
  if ([252, 253, 254, 255, 256, 257, 258, 259, 260,
       261, 262, 263, 264, 265, 266, 267, 268, 269,
       270, 271, 272, 273, 274, 275, 276, 277, 278, 279,
       280, 281, 282].includes(id)) return '1';

  // Region 2: Rustboro / Petalburg Woods
  if ([285, 286, 287, 288, 289, 290, 291, 292,
       293, 294, 295, 296, 297, 299, 300, 301].includes(id)) return '2';

  // Region 3: Dewford / Granite Cave (Sableye, Mawile, Aron line, Meditite line, Zubat, Geodude, Abra)
  if ([302, 303, 304, 305, 306, 307, 308,
       41, 42, 74, 75, 76, 63, 64, 65].includes(id)) return '3';

  // Region 4: Slateport area
  if ([309, 311, 312, 316, 317, 318, 319, 322, 325, 326].includes(id)) return '4';

  // Region 5: Mauville / New Mauville
  if ([100, 101, 81, 82, 310, 313, 314, 315, 320].includes(id)) return '5';

  // Region 6: Fortree / Safari Zone
  if ([328, 329, 330, 333, 334, 335, 336, 352, 357, 359].includes(id)) return '6';

  // Region 7: Lilycove / Mt. Pyre
  if ([323, 324, 327, 353, 354, 355, 356, 358].includes(id)) return '7';

  // Region 8: Mossdeep / Seafloor / Underwater
  if ([120, 121, 183, 184, 339, 340, 366, 367, 368, 369, 370,
       321, 222].includes(id)) return '8';

  // Region 9: Victory Road / Legendaries (handled above, but include Dratini line if present)
  if ([371, 372, 373, 374, 375, 376].includes(id)) return '9';

  // Type-based fallback
  if (types.includes('water')) return '4';
  if (types.includes('fire')) return '7';
  if (types.includes('psychic')) return '6';
  if (types.includes('ground') || types.includes('rock')) return '3';
  if (types.includes('electric')) return '5';
  if (types.includes('ghost') || types.includes('dark')) return '7';
  if (types.includes('dragon')) return '9';
  return '2';
}

// --- i18n ---
const regionNamesEn: Record<string, { name: string; description: string }> = {
  '1': { name: 'Littleroot Town',   description: 'Where your Hoenn journey begins' },
  '2': { name: 'Rustboro City',     description: 'The stone-carved city of nature and science' },
  '3': { name: 'Dewford Town',      description: 'A tiny island in the middle of the sea' },
  '4': { name: 'Slateport City',    description: 'A port city full of energy and people' },
  '5': { name: 'Mauville City',     description: 'A city of electric energy and neon lights' },
  '6': { name: 'Fortree City',      description: 'A city of treetops and aerial Pokémon' },
  '7': { name: 'Lilycove City',     description: 'Where the land ends and the sea begins' },
  '8': { name: 'Mossdeep City',     description: 'A serene island city by the deep sea' },
  '9': { name: 'Ever Grande City',  description: 'The ultimate challenge of the Hoenn League' },
};

const regionNamesKo: Record<string, { name: string; description: string }> = {
  '1': { name: '미로마을',  description: '호연 모험이 시작되는 곳' },
  '2': { name: '금탄시티',  description: '자연과 과학이 공존하는 도시' },
  '3': { name: '무로마을',  description: '바다 한가운데 작은 섬마을' },
  '4': { name: '잿빛시티',  description: '활기차고 사람이 넘치는 항구 도시' },
  '5': { name: '등화시티',  description: '전기 에너지와 네온빛의 도시' },
  '6': { name: '영시티',    description: '나무 위 마을과 하늘의 포켓몬' },
  '7': { name: '해변시티',  description: '육지가 끝나고 바다가 시작되는 곳' },
  '8': { name: '루네시티',  description: '깊은 바다 옆 고요한 섬 도시' },
  '9': { name: '그랜드시티', description: '호연 리그의 최종 도전' },
};

const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:     { name: 'First Catch',       description: 'Catch your first wild Pokémon',             rarity_label: 'Common' },
  catch_10:        { name: 'Stone Badge',        description: 'Catch 10 Pokémon',                          rarity_label: 'Common' },
  catch_25:        { name: 'Knuckle Badge',      description: 'Catch 25 Pokémon',                          rarity_label: 'Uncommon' },
  catch_50:        { name: 'Dynamo Badge',       description: 'Catch 50 Pokémon',                          rarity_label: 'Uncommon' },
  catch_75:        { name: 'Heat Badge',         description: 'Catch 75 Pokémon',                          rarity_label: 'Rare' },
  catch_100:       { name: 'Balance Badge',      description: 'Catch 100 Pokémon',                         rarity_label: 'Rare' },
  catch_120:       { name: 'Feather Badge',      description: 'Catch 120 Pokémon',                         rarity_label: 'Epic' },
  catch_130:       { name: 'Mind Badge',         description: 'Catch 130 Pokémon',                         rarity_label: 'Epic' },
  catch_135:       { name: 'Rain Badge',         description: 'Complete the Hoenn Pokédex! Deoxys awaits!', rarity_label: 'Legendary' },
  first_evolution: { name: 'First Evolution',    description: 'Evolve a Pokémon for the first time',       rarity_label: 'Common' },
  evolve_10:       { name: 'Evolution Expert',   description: 'Evolve 10 Pokémon',                         rarity_label: 'Uncommon' },
  win_10:          { name: 'Rising Trainer',     description: 'Win 10 battles',                            rarity_label: 'Common' },
  win_50:          { name: 'Battle Veteran',     description: 'Win 50 battles',                            rarity_label: 'Uncommon' },
  win_100:         { name: 'Battle Master',      description: 'Win 100 battles',                           rarity_label: 'Rare' },
  level_50:        { name: 'Power Trainer',      description: 'Reach level 50 with any Pokémon',           rarity_label: 'Rare' },
  level_100:       { name: 'Champion',           description: 'Reach level 100 with any Pokémon',          rarity_label: 'Epic' },
  streak_7:        { name: 'Weekly Warrior',     description: 'Maintain a 7-day streak',                   rarity_label: 'Uncommon' },
  streak_30:       { name: 'Monthly Master',     description: 'Maintain a 30-day streak',                  rarity_label: 'Rare' },
  all_types:       { name: 'Type Collector',     description: 'Catch at least one Pokémon of every type',  rarity_label: 'Rare' },
  all_starters:    { name: "Norman's Pride",     description: 'Obtain all three Hoenn starters',           rarity_label: 'Uncommon' },
  regi_trio:       { name: 'Ancient Guardians',  description: 'Obtain all three Regi Pokémon',             rarity_label: 'Rare' },
};

const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
  first_catch:     { name: '첫 포획',          description: '처음으로 야생 포켓몬을 잡다',              rarity_label: '일반' },
  catch_10:        { name: '스톤배지',          description: '포켓몬 10마리 포획',                       rarity_label: '일반' },
  catch_25:        { name: '너클배지',          description: '포켓몬 25마리 포획',                       rarity_label: '고급' },
  catch_50:        { name: '다이나모배지',       description: '포켓몬 50마리 포획',                       rarity_label: '고급' },
  catch_75:        { name: '히트배지',          description: '포켓몬 75마리 포획',                       rarity_label: '희귀' },
  catch_100:       { name: '밸런스배지',         description: '포켓몬 100마리 포획',                      rarity_label: '희귀' },
  catch_120:       { name: '페더배지',          description: '포켓몬 120마리 포획',                       rarity_label: '에픽' },
  catch_130:       { name: '마인드배지',         description: '포켓몬 130마리 포획',                       rarity_label: '에픽' },
  catch_135:       { name: '레인배지',          description: '호연 도감을 완성하라! 데오키시스 조우!',     rarity_label: '전설' },
  first_evolution: { name: '첫 진화',           description: '처음으로 포켓몬을 진화시키다',              rarity_label: '일반' },
  evolve_10:       { name: '진화 전문가',        description: '포켓몬 10마리 진화',                        rarity_label: '고급' },
  win_10:          { name: '떠오르는 트레이너',  description: '배틀 10승',                                rarity_label: '일반' },
  win_50:          { name: '배틀 베테랑',        description: '배틀 50승',                                rarity_label: '고급' },
  win_100:         { name: '배틀 마스터',        description: '배틀 100승',                               rarity_label: '희귀' },
  level_50:        { name: '파워 트레이너',      description: '아무 포켓몬 레벨 50 달성',                  rarity_label: '희귀' },
  level_100:       { name: '챔피언',             description: '아무 포켓몬 레벨 100 달성',                 rarity_label: '에픽' },
  streak_7:        { name: '주간 전사',          description: '7일 연속 스트릭 유지',                      rarity_label: '고급' },
  streak_30:       { name: '월간 마스터',        description: '30일 연속 스트릭 유지',                     rarity_label: '희귀' },
  all_types:       { name: '타입 수집가',        description: '모든 타입의 포켓몬을 잡다',                  rarity_label: '희귀' },
  all_starters:    { name: '노만의 자부심',       description: '호연 스타터 3마리 모두 획득',               rarity_label: '고급' },
  regi_trio:       { name: '고대의 수호자',       description: '레지 포켓몬 3마리 모두 획득',               rarity_label: '희귀' },
};

async function main() {
  console.log('=== Gen 3 (Hoenn) Data Generator ===');
  console.log(`Fetching #${GEN3_START}–#${GEN3_END} (${GEN3_END - GEN3_START + 1} species)\n`);

  mkdirSync(GEN3_DATA_DIR, { recursive: true });
  mkdirSync(join(GEN3_DATA_DIR, 'i18n'), { recursive: true });

  const { pokemonEntries, i18nEn, i18nKo, errors } = await fetchPokemonRange(
    GEN3_START,
    GEN3_END,
    STARTERS,
    assignRegion,
    CRIES_DIR,
    SPRITES_RAW_DIR,
  );

  // --- Write pokemon.json ---
  writePokemonJson(GEN3_DATA_DIR, pokemonEntries, STARTERS.map(String));

  // --- Write regions.json ---
  writeRegionsJson(GEN3_DATA_DIR, HOENN_REGIONS, pokemonEntries);

  // --- Write i18n ---
  writeI18nJson(
    GEN3_DATA_DIR,
    i18nEn,
    i18nKo,
    regionNamesEn,
    regionNamesKo,
    achievementNamesEn,
    achievementNamesKo,
  );

  // --- Write achievements.json ---
  const achievements = [
    { id: 'first_catch',     trigger_type: 'catch_count',      trigger_value: 1,   reward_pokemon: null, rarity: 1 },
    { id: 'catch_10',        trigger_type: 'catch_count',      trigger_value: 10,  reward_pokemon: null, rarity: 1 },
    { id: 'catch_25',        trigger_type: 'catch_count',      trigger_value: 25,  reward_pokemon: null, rarity: 2 },
    { id: 'catch_50',        trigger_type: 'catch_count',      trigger_value: 50,  reward_pokemon: null, rarity: 2 },
    { id: 'catch_75',        trigger_type: 'catch_count',      trigger_value: 75,  reward_pokemon: null, rarity: 3 },
    { id: 'catch_100',       trigger_type: 'catch_count',      trigger_value: 100, reward_pokemon: null, rarity: 3 },
    { id: 'catch_120',       trigger_type: 'catch_count',      trigger_value: 120, reward_pokemon: null, rarity: 4 },
    { id: 'catch_130',       trigger_type: 'catch_count',      trigger_value: 130, reward_pokemon: null, rarity: 4 },
    { id: 'catch_135',       trigger_type: 'catch_count',      trigger_value: 135, reward_pokemon: '386', rarity: 5 },
    { id: 'first_evolution', trigger_type: 'evolution_count',  trigger_value: 1,   reward_pokemon: null, rarity: 1 },
    { id: 'evolve_10',       trigger_type: 'evolution_count',  trigger_value: 10,  reward_pokemon: null, rarity: 2 },
    { id: 'win_10',          trigger_type: 'battle_wins',      trigger_value: 10,  reward_pokemon: null, rarity: 1 },
    { id: 'win_50',          trigger_type: 'battle_wins',      trigger_value: 50,  reward_pokemon: null, rarity: 2 },
    { id: 'win_100',         trigger_type: 'battle_wins',      trigger_value: 100, reward_pokemon: null, rarity: 3 },
    { id: 'level_50',        trigger_type: 'max_level',        trigger_value: 50,  reward_pokemon: null, rarity: 3 },
    { id: 'level_100',       trigger_type: 'max_level',        trigger_value: 100, reward_pokemon: null, rarity: 4 },
    { id: 'streak_7',        trigger_type: 'streak_days',      trigger_value: 7,   reward_pokemon: null, rarity: 2 },
    { id: 'streak_30',       trigger_type: 'streak_days',      trigger_value: 30,  reward_pokemon: null, rarity: 3 },
    { id: 'all_types',       trigger_type: 'unique_types',     trigger_value: 15,  reward_pokemon: null, rarity: 3 },
    {
      id: 'all_starters', trigger_type: 'specific_pokemon', trigger_value: 3, reward_pokemon: null, rarity: 2,
      reward_effects: [{ type: 'require_pokemon', pokemon: ['252', '255', '258'] }],
    },
    {
      id: 'regi_trio', trigger_type: 'specific_pokemon', trigger_value: 3, reward_pokemon: null, rarity: 3,
      reward_effects: [{ type: 'require_pokemon', pokemon: ['377', '378', '379'] }],
    },
  ];
  writeAchievementsJson(GEN3_DATA_DIR, achievements);

  // --- Write pokedex-rewards.json ---
  const pokedexRewards = {
    milestones: [
      {
        id: 'catch_10_reward', threshold: 10, reward_type: 'pokeball', reward_value: 3,
        label: { en: 'Catch 10 — 3 Poké Balls', ko: '10마리 포획 — 몬스터볼 3개' },
      },
      {
        id: 'catch_25_reward', threshold: 25, reward_type: 'pokeball', reward_value: 5,
        label: { en: 'Catch 25 — 5 Poké Balls', ko: '25마리 포획 — 몬스터볼 5개' },
      },
      {
        id: 'catch_50_reward', threshold: 50, reward_type: 'xp_multiplier', reward_value: 1.1,
        legendary_bonus: 'weather_trio',
        label: { en: 'Catch 50 — XP boost + Weather Trio encounter!', ko: '50마리 포획 — 경험치 부스트 + 날씨 트리오 조우!' },
      },
      {
        id: 'catch_70_reward', threshold: 70, reward_type: 'legendary_unlock', reward_value: 'weather_trio',
        legendary_bonus: 'weather_trio',
        label: { en: 'Catch 70 — Weather Trio encounter!', ko: '70마리 포획 — 날씨 트리오 조우!' },
      },
      {
        id: 'catch_90_reward', threshold: 90, reward_type: 'legendary_unlock', reward_value: 'regis',
        label: { en: 'Catch 90 — Regi Trio encounter!', ko: '90마리 포획 — 레지 트리오 조우!' },
      },
      {
        id: 'catch_120_reward', threshold: 120, reward_type: 'legendary_unlock', reward_value: 'eon_duo',
        label: { en: 'Catch 120 — Eon Duo encounter!', ko: '120마리 포획 — 이온 듀오 조우!' },
      },
      {
        id: 'catch_135_reward', threshold: 135, reward_type: 'legendary_unlock', reward_value: 'mythicals',
        label: { en: 'Catch all 135 — Deoxys & Jirachi!', ko: '135마리 포획 — 데오키시스 & 지라치!' },
      },
    ],
    legendary_groups: {
      weather_trio: {
        label: { en: 'Weather Trio', ko: '날씨 트리오' },
        description: { en: 'The three weather legendary Pokémon of Hoenn', ko: '호연 지방 날씨 전설 포켓몬 3마리' },
        options: ['382', '383', '384'],
      },
      regis: {
        label: { en: 'Regi Trio', ko: '레지 트리오' },
        description: { en: 'The three ancient golem Pokémon', ko: '세 고대 골렘 포켓몬' },
        options: ['377', '378', '379'],
      },
      eon_duo: {
        label: { en: 'Eon Duo', ko: '이온 듀오' },
        description: { en: 'The roaming eon Pokémon of Hoenn', ko: '호연을 떠도는 이온 포켓몬' },
        options: ['380', '381'],
      },
      mythicals: {
        label: { en: 'Mythicals', ko: '환상의 포켓몬' },
        description: { en: 'Jirachi and Deoxys', ko: '지라치와 데오키시스' },
        options: ['385', '386'],
      },
      special_legends: {
        label: { en: 'Special Legends', ko: '스페셜 전설' },
        description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
        options: ['382', '383', '384'],
      },
    },
    type_master: {
      xp_bonus: 0.1,
      legendary_unlock_threshold: 3,
      legendary_group: 'special_legends',
      special_legends: {
        label: { en: 'Special Legends', ko: '스페셜 전설' },
        description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
        options: ['382', '383', '384'],
      },
    },
    chain_completion_reward: {
      pokeball_count: 1,
    },
  };
  writePokedexRewardsJson(GEN3_DATA_DIR, pokedexRewards);

  // Summary
  console.log(`\n=== Gen 3 Generation Complete ===`);
  console.log(`  Species: ${Object.keys(pokemonEntries).length}`);
  console.log(`  Regions: ${Object.keys(HOENN_REGIONS).length}`);
  console.log(`  Achievements: ${achievements.length}`);
  console.log(`  i18n: en + ko`);

  const regionDist: Record<string, number> = {};
  for (const p of Object.values(pokemonEntries) as any[]) {
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
