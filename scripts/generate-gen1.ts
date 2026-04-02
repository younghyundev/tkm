#!/usr/bin/env tsx
/**
 * Gen 1 (Kanto) Data Generator
 * Fetches from PokeAPI: 151 species, evolution chains, sprites, cries, i18n names
 * Generates: pokemon.json, regions.json, achievements.json, pokedex-rewards.json, i18n/{en,ko}.json
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const GEN1_DATA_DIR = join(PROJECT_ROOT, 'data', 'gen1');
const GEN1_I18N_DIR = join(GEN1_DATA_DIR, 'i18n');
const CRIES_DIR = join(PROJECT_ROOT, 'cries');
const SPRITES_RAW_DIR = join(PROJECT_ROOT, 'sprites', 'raw');

const GEN1_START = 1;
const GEN1_END = 151;
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const DELAY_MS = 80;

// --- Kanto region assignment by route/area ---
// 9 regions matching Gen 4's structure
const KANTO_REGIONS: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }> = {
  '1': { pokemon_pool: [], level_range: [1, 15], unlock_condition: null }, // Pallet/Route 1-2
  '2': { pokemon_pool: [], level_range: [8, 22], unlock_condition: { type: 'pokedex_seen', value: 5 } }, // Pewter/Mt. Moon
  '3': { pokemon_pool: [], level_range: [15, 30], unlock_condition: { type: 'pokedex_seen', value: 15 } }, // Cerulean/Route 24-25
  '4': { pokemon_pool: [], level_range: [20, 35], unlock_condition: { type: 'pokedex_caught', value: 10 } }, // Vermilion/Rock Tunnel
  '5': { pokemon_pool: [], level_range: [25, 40], unlock_condition: { type: 'pokedex_caught', value: 20 } }, // Celadon/Cycling Road
  '6': { pokemon_pool: [], level_range: [30, 45], unlock_condition: { type: 'pokedex_caught', value: 30 } }, // Fuchsia/Safari Zone
  '7': { pokemon_pool: [], level_range: [35, 55], unlock_condition: { type: 'pokedex_caught', value: 45 } }, // Saffron/Silph Co
  '8': { pokemon_pool: [], level_range: [40, 65], unlock_condition: { type: 'pokedex_caught', value: 60 } }, // Cinnabar/Seafoam
  '9': { pokemon_pool: [], level_range: [50, 100], unlock_condition: { type: 'pokedex_caught', value: 80 } }, // Victory Road/Indigo
};

// Assign pokemon to regions based on their game appearance areas (simplified)
function assignRegion(id: number, types: string[], bst: number, isLegendary: boolean): string {
  // Legendaries → region 9
  if (isLegendary || id === 150 || id === 151) return '9';
  // Starters + early route pokemon
  if (id <= 9 || id === 16 || id === 17 || id === 18 || id === 19 || id === 20 || id === 10 || id === 11 || id === 12 || id === 13 || id === 14 || id === 15) return '1';
  // Pewter/Mt. Moon area: Clefairy, Geodude, Zubat lines, Paras
  if ([35, 36, 41, 42, 46, 47, 74, 75, 76, 21, 22, 23, 24, 27, 28, 29, 30, 31, 32, 33, 34].includes(id)) return '2';
  // Cerulean area: Water pokemon, Abra line, Oddish, Bellsprout
  if ([54, 55, 60, 61, 62, 63, 64, 65, 43, 44, 45, 69, 70, 71, 118, 119, 129].includes(id)) return '3';
  // Vermilion/Rock Tunnel: Diglett, Voltorb, Magnemite, Onix
  if ([25, 26, 50, 51, 81, 82, 95, 100, 101, 66, 67, 68, 72, 73, 96, 97].includes(id)) return '4';
  // Celadon: Eevee, Porygon, Grimer, Koffing
  if ([133, 134, 135, 136, 88, 89, 109, 110, 137, 102, 103, 48, 49, 52, 53].includes(id)) return '5';
  // Fuchsia/Safari: Kangaskhan, Tauros, Scyther, Pinsir, Chansey, Exeggcute, Rhyhorn
  if ([115, 128, 123, 127, 113, 114, 111, 112, 122, 124, 125, 126, 83, 84, 85].includes(id)) return '6';
  // Saffron: Psychic pokemon, Hitmonlee/chan, Mr. Mime
  if ([106, 107, 108, 131, 132, 138, 139, 140, 141, 142, 143, 104, 105].includes(id)) return '7';
  // Cinnabar/Seafoam: Fire, fossil pokemon
  if ([58, 59, 37, 38, 77, 78, 86, 87, 90, 91, 116, 117, 120, 121, 130, 98, 99].includes(id)) return '8';
  // Victory Road / high-level
  if ([144, 145, 146, 147, 148, 149, 150, 151, 56, 57, 79, 80, 92, 93, 94].includes(id)) return '9';
  // Fallback by type
  if (types.includes('water')) return '3';
  if (types.includes('fire')) return '8';
  if (types.includes('psychic')) return '7';
  if (types.includes('ground') || types.includes('rock')) return '4';
  if (types.includes('poison')) return '5';
  return '1';
}

// --- Helpers ---
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    } catch (err: any) {
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
}

// --- Rarity assignment ---
function assignRarity(stage: number, bst: number, isLegendary: boolean, isMythical: boolean): string {
  if (isMythical) return 'mythical';
  if (isLegendary) return 'legendary';
  if (stage >= 2) return 'rare';
  if (stage === 1 || (stage === 0 && bst >= 350)) return 'uncommon';
  return 'common';
}

// --- Evolution chain parsing ---
interface EvoNode {
  species: { name: string; url: string };
  evolution_details: any[];
  evolves_to: EvoNode[];
}

function idFromUrl(url: string): number {
  return parseInt(url.split('/').filter(Boolean).pop()!);
}

function flattenChain(node: EvoNode): number[] {
  const ids: number[] = [];
  function walk(n: EvoNode) {
    ids.push(idFromUrl(n.species.url));
    for (const child of n.evolves_to) walk(child);
  }
  walk(node);
  return ids;
}

function findNode(node: EvoNode, targetId: number): EvoNode | null {
  if (idFromUrl(node.species.url) === targetId) return node;
  for (const child of node.evolves_to) {
    const found = findNode(child, targetId);
    if (found) return found;
  }
  return null;
}

function getEvolvesAtLevel(chain: EvoNode, sourceId: number): number | null {
  const node = findNode(chain, sourceId);
  if (!node || node.evolves_to.length === 0) return null;
  const nextEvo = node.evolves_to[0];
  const detail = nextEvo.evolution_details[0];
  return detail?.min_level ?? null;
}

function getEvolvesCondition(chain: EvoNode, sourceId: number): string | null {
  const node = findNode(chain, sourceId);
  if (!node || node.evolves_to.length === 0) return null;
  const nextEvo = node.evolves_to[0];
  const detail = nextEvo.evolution_details[0];
  if (!detail) return null;
  if (detail.min_level != null) return null;
  if (detail.min_happiness) return 'friendship';
  if (detail.item) return `item:${detail.item.name}`;
  if (detail.held_item) return `held_item:${detail.held_item.name}`;
  if (detail.known_move) return `move:${detail.known_move.name}`;
  if (detail.trigger?.name === 'trade') return detail.held_item ? `trade_item:${detail.held_item.name}` : 'trade';
  return 'special';
}

function getEvolvesTo(chain: EvoNode, sourceId: number): string | { name: string; condition: string }[] | undefined {
  const node = findNode(chain, sourceId);
  if (!node || node.evolves_to.length === 0) return undefined;
  if (node.evolves_to.length === 1) {
    const nextId = idFromUrl(node.evolves_to[0].species.url);
    if (nextId >= GEN1_START && nextId <= GEN1_END) return String(nextId);
    return undefined;
  }
  // Branching evolution (e.g., Eevee)
  const branches = node.evolves_to
    .filter(e => {
      const eid = idFromUrl(e.species.url);
      return eid >= GEN1_START && eid <= GEN1_END;
    })
    .map(e => {
      const detail = e.evolution_details[0];
      let condition = 'special';
      if (detail?.item) condition = `item:${detail.item.name}`;
      else if (detail?.min_level) condition = `level:${detail.min_level}`;
      else if (detail?.min_happiness) condition = 'friendship';
      else if (detail?.trigger?.name === 'trade') condition = 'trade';
      return { name: String(idFromUrl(e.species.url)), condition };
    });
  return branches.length > 0 ? branches : undefined;
}

function getStage(chainIds: number[], targetId: number): number {
  const idx = chainIds.indexOf(targetId);
  return idx >= 0 ? idx : 0;
}

// --- Exp group mapping ---
const GROWTH_RATE_MAP: Record<string, string> = {
  'medium': 'medium_fast', 'medium-fast': 'medium_fast',
  'medium-slow': 'medium_slow', 'slow': 'slow', 'fast': 'fast',
  'erratic': 'erratic', 'fluctuating': 'fluctuating',
};

// --- Main ---
async function main() {
  console.log('Gen 1 (Kanto) Data Generator — Fetching #1-#151 from PokeAPI\n');

  for (const dir of [GEN1_DATA_DIR, GEN1_I18N_DIR, CRIES_DIR, SPRITES_RAW_DIR]) {
    mkdirSync(dir, { recursive: true });
  }

  const evoChainCache: Record<string, any> = {};
  const pokemonEntries: Record<string, any> = {};
  const i18nEn: Record<string, string> = {};
  const i18nKo: Record<string, string> = {};
  const errors: string[] = [];

  // Phase 1: Fetch all pokemon data
  for (let id = GEN1_START; id <= GEN1_END; id++) {
    try {
      process.stdout.write(`  #${id}...`);

      const [pokemonData, speciesData] = await Promise.all([
        fetchJSON(`${POKEAPI_BASE}/pokemon/${id}`),
        fetchJSON(`${POKEAPI_BASE}/pokemon-species/${id}`),
      ]);

      // Names
      const enName = speciesData.names.find((n: any) => n.language.name === 'en')?.name || speciesData.name;
      const koName = speciesData.names.find((n: any) => n.language.name === 'ko')?.name || enName;
      i18nEn[String(id)] = enName;
      i18nKo[String(id)] = koName;

      // Types (English)
      const types = pokemonData.types
        .sort((a: any, b: any) => a.slot - b.slot)
        .map((t: any) => t.type.name);

      // Base stats
      const statMap: Record<string, number> = {};
      for (const s of pokemonData.stats) {
        statMap[s.stat.name] = s.base_stat;
      }
      const base_stats = {
        hp: statMap['hp'] || 0,
        attack: statMap['attack'] || 0,
        defense: statMap['defense'] || 0,
        speed: statMap['speed'] || 0,
      };
      const bst = Object.values(statMap).reduce((a, b) => a + b, 0);

      const catch_rate = speciesData.capture_rate;
      const growthRateName = speciesData.growth_rate?.name || 'medium-slow';
      const exp_group = GROWTH_RATE_MAP[growthRateName] || 'medium_slow';

      // Evolution chain
      const evoChainUrl = speciesData.evolution_chain?.url;
      let chainIds: number[] = [];
      let evolves_at: number | null = null;
      let evolves_condition: string | null = null;
      let evolves_to: any = undefined;
      let stage = 0;

      if (evoChainUrl) {
        if (!evoChainCache[evoChainUrl]) {
          evoChainCache[evoChainUrl] = await fetchJSON(evoChainUrl);
        }
        const chainData = evoChainCache[evoChainUrl];
        chainIds = flattenChain(chainData.chain);
        stage = getStage(chainIds, id);
        evolves_at = getEvolvesAtLevel(chainData.chain, id);
        evolves_condition = getEvolvesCondition(chainData.chain, id);
        evolves_to = getEvolvesTo(chainData.chain, id);
      }

      const gen1ChainIds = chainIds.filter(cid => cid >= GEN1_START && cid <= GEN1_END);
      const isLegendary = speciesData.is_legendary;
      const isMythical = speciesData.is_mythical;
      const rarity = assignRarity(stage, bst, isLegendary, isMythical);
      const region = assignRegion(id, types, bst, isLegendary || isMythical);

      let unlock = stage > 0 ? 'evolution' : 'encounter';
      if (isLegendary || isMythical) unlock = 'encounter';
      if ([1, 4, 7].includes(id)) unlock = 'starter';

      const entry: any = {
        id,
        name: String(id),
        types,
        stage,
        line: gen1ChainIds.map(String),
        evolves_at,
        unlock,
        exp_group,
        rarity,
        region,
        base_stats,
        catch_rate,
      };

      if (evolves_condition) entry.evolves_condition = evolves_condition;
      if (evolves_to !== undefined) entry.evolves_to = evolves_to;

      pokemonEntries[String(id)] = entry;

      // Download cry
      const cryUrl = pokemonData.cries?.latest || pokemonData.cries?.legacy;
      if (cryUrl) {
        await downloadFile(cryUrl, join(CRIES_DIR, `${id}.ogg`));
      }

      // Download sprite
      const spriteUrl = pokemonData.sprites?.front_default;
      if (spriteUrl) {
        await downloadFile(spriteUrl, join(SPRITES_RAW_DIR, `${id}.png`));
      }

      process.stdout.write(` ${enName} (${koName})\n`);
      await sleep(DELAY_MS);
    } catch (err: any) {
      console.error(` Error on #${id}: ${err.message}`);
      errors.push(`#${id}: ${err.message}`);
    }
  }

  // Fix line arrays: ensure self-reference for single-pokemon lines
  for (const entry of Object.values(pokemonEntries) as any[]) {
    if (!entry.line || entry.line.length === 0) {
      entry.line = [String(entry.id)];
    }
  }

  // Assign pokemon to region pools
  for (const entry of Object.values(pokemonEntries) as any[]) {
    const r = entry.region;
    if (KANTO_REGIONS[r] && entry.unlock !== 'starter') {
      KANTO_REGIONS[r].pokemon_pool.push(entry.id);
    }
  }

  // --- Write pokemon.json ---
  const sortedPokemon: Record<string, any> = {};
  const sorted = Object.values(pokemonEntries).sort((a: any, b: any) => a.id - b.id);
  for (const entry of sorted) {
    sortedPokemon[String((entry as any).id)] = entry;
  }

  const pokemonOutput = {
    pokemon: sortedPokemon,
    starters: ['1', '4', '7'],
  };
  writeFileSync(join(GEN1_DATA_DIR, 'pokemon.json'), JSON.stringify(pokemonOutput, null, 2) + '\n', 'utf-8');
  console.log(`\n✓ pokemon.json: ${Object.keys(sortedPokemon).length} species`);

  // --- Write regions.json ---
  const regionsData: Record<string, any> = {};
  for (const [rid, rdata] of Object.entries(KANTO_REGIONS)) {
    regionsData[rid] = {
      id: parseInt(rid),
      level_range: rdata.level_range,
      pokemon_pool: rdata.pokemon_pool.map(String).sort((a: string, b: string) => parseInt(a) - parseInt(b)),
      unlock_condition: rdata.unlock_condition,
    };
  }
  writeFileSync(join(GEN1_DATA_DIR, 'regions.json'), JSON.stringify({ regions: regionsData, default_region: '1' }, null, 2) + '\n', 'utf-8');
  console.log(`✓ regions.json: ${Object.keys(regionsData).length} regions`);

  // --- Write i18n ---
  // Region names
  const regionNamesEn: Record<string, { name: string; description: string }> = {
    '1': { name: 'Pallet Town', description: 'Where your journey begins' },
    '2': { name: 'Pewter City', description: 'A stone gray city' },
    '3': { name: 'Cerulean City', description: 'A mysterious blue aura surrounds it' },
    '4': { name: 'Vermilion City', description: 'The port of exquisite sunsets' },
    '5': { name: 'Celadon City', description: 'The city of rainbow dreams' },
    '6': { name: 'Fuchsia City', description: 'Happening and Pokemon ninja' },
    '7': { name: 'Saffron City', description: 'Shining golden land of commerce' },
    '8': { name: 'Cinnabar Island', description: 'The fiery town of burning desire' },
    '9': { name: 'Indigo Plateau', description: 'The ultimate Pokemon League challenge' },
  };
  const regionNamesKo: Record<string, { name: string; description: string }> = {
    '1': { name: '태초마을', description: '모험이 시작되는 곳' },
    '2': { name: '회색시티', description: '돌빛 도시' },
    '3': { name: '블루시티', description: '신비로운 파란빛이 감도는 곳' },
    '4': { name: '갈색시티', description: '아름다운 석양의 항구' },
    '5': { name: '무지개시티', description: '무지개빛 꿈의 도시' },
    '6': { name: '연분홍시티', description: '닌자와 포켓몬의 도시' },
    '7': { name: '노랑시티', description: '빛나는 황금빛 상업의 땅' },
    '8': { name: '홍련섬', description: '뜨거운 열정의 불꽃 마을' },
    '9': { name: '석영고원', description: '포켓몬 리그 최종 도전' },
  };

  // Type names
  const typeNamesEn: Record<string, string> = {
    normal: 'Normal', fire: 'Fire', water: 'Water', electric: 'Electric',
    grass: 'Grass', ice: 'Ice', fighting: 'Fighting', poison: 'Poison',
    ground: 'Ground', flying: 'Flying', psychic: 'Psychic', bug: 'Bug',
    rock: 'Rock', ghost: 'Ghost', dragon: 'Dragon', dark: 'Dark',
    steel: 'Steel', fairy: 'Fairy',
  };
  const typeNamesKo: Record<string, string> = {
    normal: '노말', fire: '불꽃', water: '물', electric: '전기',
    grass: '풀', ice: '얼음', fighting: '격투', poison: '독',
    ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레',
    rock: '바위', ghost: '고스트', dragon: '드래곤', dark: '악',
    steel: '강철', fairy: '페어리',
  };

  // Achievement names
  const achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }> = {
    first_catch: { name: 'First Catch', description: 'Catch your first wild Pokémon', rarity_label: 'Common' },
    catch_10: { name: 'Boulder Badge', description: 'Catch 10 Pokémon', rarity_label: 'Common' },
    catch_25: { name: 'Cascade Badge', description: 'Catch 25 Pokémon', rarity_label: 'Uncommon' },
    catch_50: { name: 'Thunder Badge', description: 'Catch 50 Pokémon', rarity_label: 'Uncommon' },
    catch_75: { name: 'Rainbow Badge', description: 'Catch 75 Pokémon', rarity_label: 'Rare' },
    catch_100: { name: 'Soul Badge', description: 'Catch 100 Pokémon', rarity_label: 'Rare' },
    catch_120: { name: 'Marsh Badge', description: 'Catch 120 Pokémon', rarity_label: 'Epic' },
    catch_140: { name: 'Volcano Badge', description: 'Catch 140 Pokémon', rarity_label: 'Epic' },
    catch_151: { name: 'Earth Badge', description: 'Complete the Kanto Pokédex!', rarity_label: 'Legendary' },
    first_evolution: { name: 'First Evolution', description: 'Evolve a Pokémon for the first time', rarity_label: 'Common' },
    evolve_10: { name: 'Evolution Expert', description: 'Evolve 10 Pokémon', rarity_label: 'Uncommon' },
    win_10: { name: 'Rising Trainer', description: 'Win 10 battles', rarity_label: 'Common' },
    win_50: { name: 'Battle Veteran', description: 'Win 50 battles', rarity_label: 'Uncommon' },
    win_100: { name: 'Battle Master', description: 'Win 100 battles', rarity_label: 'Rare' },
    level_50: { name: 'Power Trainer', description: 'Reach level 50 with any Pokémon', rarity_label: 'Rare' },
    level_100: { name: 'Champion', description: 'Reach level 100 with any Pokémon', rarity_label: 'Epic' },
    streak_7: { name: 'Weekly Warrior', description: 'Maintain a 7-day streak', rarity_label: 'Uncommon' },
    streak_30: { name: 'Monthly Master', description: 'Maintain a 30-day streak', rarity_label: 'Rare' },
    all_types: { name: 'Type Collector', description: 'Catch at least one Pokémon of every type', rarity_label: 'Rare' },
    all_starters: { name: 'Professor\'s Pride', description: 'Obtain all three Kanto starters', rarity_label: 'Uncommon' },
    eevee_trio: { name: 'Eevee Master', description: 'Obtain all three Eevee evolutions', rarity_label: 'Rare' },
  };
  const achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }> = {
    first_catch: { name: '첫 포획', description: '처음으로 야생 포켓몬을 잡다', rarity_label: '일반' },
    catch_10: { name: '회색배지', description: '포켓몬 10마리 포획', rarity_label: '일반' },
    catch_25: { name: '블루배지', description: '포켓몬 25마리 포획', rarity_label: '고급' },
    catch_50: { name: '오렌지배지', description: '포켓몬 50마리 포획', rarity_label: '고급' },
    catch_75: { name: '무지개배지', description: '포켓몬 75마리 포획', rarity_label: '희귀' },
    catch_100: { name: '핑크배지', description: '포켓몬 100마리 포획', rarity_label: '희귀' },
    catch_120: { name: '골드배지', description: '포켓몬 120마리 포획', rarity_label: '에픽' },
    catch_140: { name: '크림슨배지', description: '포켓몬 140마리 포획', rarity_label: '에픽' },
    catch_151: { name: '그린배지', description: '관동 도감을 완성하라!', rarity_label: '전설' },
    first_evolution: { name: '첫 진화', description: '처음으로 포켓몬을 진화시키다', rarity_label: '일반' },
    evolve_10: { name: '진화 전문가', description: '포켓몬 10마리 진화', rarity_label: '고급' },
    win_10: { name: '떠오르는 트레이너', description: '배틀 10승', rarity_label: '일반' },
    win_50: { name: '배틀 베테랑', description: '배틀 50승', rarity_label: '고급' },
    win_100: { name: '배틀 마스터', description: '배틀 100승', rarity_label: '희귀' },
    level_50: { name: '파워 트레이너', description: '아무 포켓몬 레벨 50 달성', rarity_label: '희귀' },
    level_100: { name: '챔피언', description: '아무 포켓몬 레벨 100 달성', rarity_label: '에픽' },
    streak_7: { name: '주간 전사', description: '7일 연속 스트릭 유지', rarity_label: '고급' },
    streak_30: { name: '월간 마스터', description: '30일 연속 스트릭 유지', rarity_label: '희귀' },
    all_types: { name: '타입 수집가', description: '모든 타입의 포켓몬을 잡다', rarity_label: '희귀' },
    all_starters: { name: '박사의 자부심', description: '관동 스타터 3마리 모두 획득', rarity_label: '고급' },
    eevee_trio: { name: '이브이 마스터', description: '이브이 진화형 3종 모두 획득', rarity_label: '희귀' },
  };

  const i18nEnData = {
    pokemon: i18nEn,
    types: typeNamesEn,
    regions: regionNamesEn,
    achievements: achievementNamesEn,
  };
  const i18nKoData = {
    pokemon: i18nKo,
    types: typeNamesKo,
    regions: regionNamesKo,
    achievements: achievementNamesKo,
  };

  writeFileSync(join(GEN1_I18N_DIR, 'en.json'), JSON.stringify(i18nEnData, null, 2) + '\n', 'utf-8');
  writeFileSync(join(GEN1_I18N_DIR, 'ko.json'), JSON.stringify(i18nKoData, null, 2) + '\n', 'utf-8');
  console.log(`✓ i18n: en.json (${Object.keys(i18nEn).length} names), ko.json (${Object.keys(i18nKo).length} names)`);

  // --- Write achievements.json ---
  const achievements = {
    achievements: [
      { id: 'first_catch', trigger_type: 'catch_count', trigger_value: 1, reward_pokemon: null, rarity: 1 },
      { id: 'catch_10', trigger_type: 'catch_count', trigger_value: 10, reward_pokemon: null, rarity: 1 },
      { id: 'catch_25', trigger_type: 'catch_count', trigger_value: 25, reward_pokemon: null, rarity: 2 },
      { id: 'catch_50', trigger_type: 'catch_count', trigger_value: 50, reward_pokemon: null, rarity: 2 },
      { id: 'catch_75', trigger_type: 'catch_count', trigger_value: 75, reward_pokemon: null, rarity: 3 },
      { id: 'catch_100', trigger_type: 'catch_count', trigger_value: 100, reward_pokemon: null, rarity: 3 },
      { id: 'catch_120', trigger_type: 'catch_count', trigger_value: 120, reward_pokemon: null, rarity: 4 },
      { id: 'catch_140', trigger_type: 'catch_count', trigger_value: 140, reward_pokemon: null, rarity: 4 },
      { id: 'catch_151', trigger_type: 'catch_count', trigger_value: 151, reward_pokemon: '151', rarity: 5 },
      { id: 'first_evolution', trigger_type: 'evolution_count', trigger_value: 1, reward_pokemon: null, rarity: 1 },
      { id: 'evolve_10', trigger_type: 'evolution_count', trigger_value: 10, reward_pokemon: null, rarity: 2 },
      { id: 'win_10', trigger_type: 'battle_wins', trigger_value: 10, reward_pokemon: null, rarity: 1 },
      { id: 'win_50', trigger_type: 'battle_wins', trigger_value: 50, reward_pokemon: null, rarity: 2 },
      { id: 'win_100', trigger_type: 'battle_wins', trigger_value: 100, reward_pokemon: null, rarity: 3 },
      { id: 'level_50', trigger_type: 'max_level', trigger_value: 50, reward_pokemon: null, rarity: 3 },
      { id: 'level_100', trigger_type: 'max_level', trigger_value: 100, reward_pokemon: null, rarity: 4 },
      { id: 'streak_7', trigger_type: 'streak_days', trigger_value: 7, reward_pokemon: null, rarity: 2 },
      { id: 'streak_30', trigger_type: 'streak_days', trigger_value: 30, reward_pokemon: null, rarity: 3 },
      { id: 'all_types', trigger_type: 'unique_types', trigger_value: 15, reward_pokemon: null, rarity: 3 },
      { id: 'all_starters', trigger_type: 'specific_pokemon', trigger_value: 3, reward_pokemon: null, rarity: 2,
        reward_effects: [{ type: 'require_pokemon', pokemon: ['1', '4', '7'] }] },
      { id: 'eevee_trio', trigger_type: 'specific_pokemon', trigger_value: 3, reward_pokemon: null, rarity: 3,
        reward_effects: [{ type: 'require_pokemon', pokemon: ['134', '135', '136'] }] },
    ],
  };
  writeFileSync(join(GEN1_DATA_DIR, 'achievements.json'), JSON.stringify(achievements, null, 2) + '\n', 'utf-8');
  console.log(`✓ achievements.json: ${achievements.achievements.length} achievements`);

  // --- Write pokedex-rewards.json ---
  const pokedexRewards = {
    milestones: [
      { id: 'catch_10_reward', threshold: 10, reward_type: 'pokeball', reward_value: 3, label: { en: 'Catch 10 — 3 Poké Balls', ko: '10마리 포획 — 몬스터볼 3개' } },
      { id: 'catch_25_reward', threshold: 25, reward_type: 'pokeball', reward_value: 5, label: { en: 'Catch 25 — 5 Poké Balls', ko: '25마리 포획 — 몬스터볼 5개' } },
      { id: 'catch_50_reward', threshold: 50, reward_type: 'xp_multiplier', reward_value: 1.1, legendary_bonus: 'legendary_birds', label: { en: 'Catch 50 — Articuno encounter!', ko: '50마리 포획 — 프리저 조우!' } },
      { id: 'catch_70_reward', threshold: 70, reward_type: 'legendary_unlock', reward_value: 'legendary_birds', legendary_bonus: 'legendary_birds', label: { en: 'Catch 70 — Zapdos encounter!', ko: '70마리 포획 — 썬더 조우!' } },
      { id: 'catch_90_reward', threshold: 90, reward_type: 'legendary_unlock', reward_value: 'legendary_birds', legendary_bonus: 'legendary_birds', label: { en: 'Catch 90 — Moltres encounter!', ko: '90마리 포획 — 파이어 조우!' } },
      { id: 'catch_120_reward', threshold: 120, reward_type: 'legendary_unlock', reward_value: 'mewtwo', label: { en: 'Catch 120 — Mewtwo encounter!', ko: '120마리 포획 — 뮤츠 조우!' } },
      { id: 'catch_151_reward', threshold: 151, reward_type: 'legendary_unlock', reward_value: 'mew', label: { en: 'Catch all 151 — Mew encounter!', ko: '151마리 포획 — 뮤 조우!' } },
    ],
    legendary_groups: {
      legendary_birds: {
        label: { en: 'Legendary Birds', ko: '전설의 새' },
        description: { en: 'The three legendary birds of Kanto', ko: '관동 지방의 전설의 새 3마리' },
        options: ['144', '145', '146'],
      },
      mewtwo: {
        label: { en: 'Mewtwo', ko: '뮤츠' },
        description: { en: 'The ultimate genetic Pokémon', ko: '궁극의 유전자 포켓몬' },
        options: ['150'],
      },
      mew: {
        label: { en: 'Mew', ko: '뮤' },
        description: { en: 'The mythical ancestor Pokémon', ko: '환상의 조상 포켓몬' },
        options: ['151'],
      },
      special_legends: {
        label: { en: 'Special Legends', ko: '스페셜 전설' },
        description: { en: 'Unlocked through type mastery', ko: '타입 마스터를 통해 해금' },
        options: ['150', '151'],
      },
    },
    type_master: {
      xp_bonus: 0.1,
      legendary_unlock_threshold: 3,
      legendary_group: 'special_legends',
      special_legends: {
        label: { en: 'Special Legends', ko: '스페셜 전설' },
        description: { en: 'Master 3 types to unlock', ko: '3개 타입 마스터 달성 시 해금' },
        options: ['150', '151'],
      },
    },
    chain_completion_reward: {
      pokeball_count: 1,
    },
  };
  writeFileSync(join(GEN1_DATA_DIR, 'pokedex-rewards.json'), JSON.stringify(pokedexRewards, null, 2) + '\n', 'utf-8');
  console.log('✓ pokedex-rewards.json');

  // Summary
  console.log(`\n=== Gen 1 Generation Complete ===`);
  console.log(`  Species: ${Object.keys(sortedPokemon).length}`);
  console.log(`  Regions: ${Object.keys(regionsData).length}`);
  console.log(`  Achievements: ${achievements.achievements.length}`);
  console.log(`  i18n: en + ko`);
  const regionDist: Record<string, number> = {};
  for (const p of Object.values(sortedPokemon) as any[]) {
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
