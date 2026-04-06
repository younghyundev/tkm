/**
 * Shared PokeAPI utilities for generation scripts.
 * Extracted from generate-gen1.ts to avoid duplication across 9 gen scripts.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
export const DELAY_MS = 80;

// --- Helpers ---
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchJSON(url: string): Promise<any> {
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

export async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
}

// --- Rarity assignment ---
export function assignRarity(stage: number, bst: number, isLegendary: boolean, isMythical: boolean): string {
  if (isMythical) return 'mythical';
  if (isLegendary) return 'legendary';
  if (stage >= 2) return 'rare';
  if (stage === 1 || (stage === 0 && bst >= 350)) return 'uncommon';
  return 'common';
}

// --- Evolution chain parsing ---
export interface EvoNode {
  species: { name: string; url: string };
  evolution_details: any[];
  evolves_to: EvoNode[];
}

export function idFromUrl(url: string): number {
  return parseInt(url.split('/').filter(Boolean).pop()!);
}

export function flattenChain(node: EvoNode): number[] {
  const ids: number[] = [];
  function walk(n: EvoNode) {
    ids.push(idFromUrl(n.species.url));
    for (const child of n.evolves_to) walk(child);
  }
  walk(node);
  return ids;
}

export function findNode(node: EvoNode, targetId: number): EvoNode | null {
  if (idFromUrl(node.species.url) === targetId) return node;
  for (const child of node.evolves_to) {
    const found = findNode(child, targetId);
    if (found) return found;
  }
  return null;
}

export function getEvolvesAtLevel(chain: EvoNode, sourceId: number): number | null {
  const node = findNode(chain, sourceId);
  if (!node || node.evolves_to.length === 0) return null;
  const nextEvo = node.evolves_to[0];
  const detail = nextEvo.evolution_details[0];
  return detail?.min_level ?? null;
}

export function getEvolvesCondition(chain: EvoNode, sourceId: number): string | null {
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

export function getEvolvesTo(
  chain: EvoNode,
  sourceId: number,
  genStart: number,
  genEnd: number,
): string | { name: string; condition: string }[] | undefined {
  const node = findNode(chain, sourceId);
  if (!node || node.evolves_to.length === 0) return undefined;
  if (node.evolves_to.length === 1) {
    const nextId = idFromUrl(node.evolves_to[0].species.url);
    if (nextId >= genStart && nextId <= genEnd) return String(nextId);
    return undefined;
  }
  // Branching evolution (e.g., Eevee, Kirlia)
  const branches = node.evolves_to
    .filter(e => {
      const eid = idFromUrl(e.species.url);
      return eid >= genStart && eid <= genEnd;
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

export function getStage(chainIds: number[], targetId: number): number {
  const idx = chainIds.indexOf(targetId);
  return idx >= 0 ? idx : 0;
}

// --- Exp group mapping ---
export const GROWTH_RATE_MAP: Record<string, string> = {
  'medium': 'medium_fast', 'medium-fast': 'medium_fast',
  'medium-slow': 'medium_slow', 'slow': 'slow', 'fast': 'fast',
  'erratic': 'erratic', 'fluctuating': 'fluctuating',
};

// --- Shared type names (all gens use the same 18 types) ---
export const TYPE_NAMES_EN: Record<string, string> = {
  normal: 'Normal', fire: 'Fire', water: 'Water', electric: 'Electric',
  grass: 'Grass', ice: 'Ice', fighting: 'Fighting', poison: 'Poison',
  ground: 'Ground', flying: 'Flying', psychic: 'Psychic', bug: 'Bug',
  rock: 'Rock', ghost: 'Ghost', dragon: 'Dragon', dark: 'Dark',
  steel: 'Steel', fairy: 'Fairy',
};

export const TYPE_NAMES_KO: Record<string, string> = {
  normal: '노말', fire: '불꽃', water: '물', electric: '전기',
  grass: '풀', ice: '얼음', fighting: '격투', poison: '독',
  ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레',
  rock: '바위', ghost: '고스트', dragon: '드래곤', dark: '악',
  steel: '강철', fairy: '페어리',
};

// --- Common pokemon fetch logic ---
export interface PokemonFetchResult {
  pokemonEntries: Record<string, any>;
  i18nEn: Record<string, string>;
  i18nKo: Record<string, string>;
  errors: string[];
}

export async function fetchPokemonRange(
  genStart: number,
  genEnd: number,
  starterIds: number[],
  assignRegionFn: (id: number, types: string[], bst: number, isLegendary: boolean) => string,
  criesDir: string,
  spritesDir: string,
): Promise<PokemonFetchResult> {
  const evoChainCache: Record<string, any> = {};
  const pokemonEntries: Record<string, any> = {};
  const i18nEn: Record<string, string> = {};
  const i18nKo: Record<string, string> = {};
  const errors: string[] = [];

  for (let id = genStart; id <= genEnd; id++) {
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

      // Types
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
        evolves_to = getEvolvesTo(chainData.chain, id, genStart, genEnd);
      }

      const genChainIds = chainIds.filter(cid => cid >= genStart && cid <= genEnd);
      const isLegendary = speciesData.is_legendary;
      const isMythical = speciesData.is_mythical;
      const rarity = assignRarity(stage, bst, isLegendary, isMythical);
      const region = assignRegionFn(id, types, bst, isLegendary || isMythical);

      let unlock = stage > 0 ? 'evolution' : 'encounter';
      if (isLegendary || isMythical) unlock = 'encounter';
      if (starterIds.includes(id)) unlock = 'starter';

      const entry: any = {
        id,
        name: String(id),
        types,
        stage,
        line: genChainIds.length > 0 ? genChainIds.map(String) : [String(id)],
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
        await downloadFile(cryUrl, `${criesDir}/${id}.ogg`);
      }

      // Download sprite
      const spriteUrl = pokemonData.sprites?.front_default;
      if (spriteUrl) {
        await downloadFile(spriteUrl, `${spritesDir}/${id}.png`);
      }

      process.stdout.write(` ${enName} (${koName})\n`);
      await sleep(DELAY_MS);
    } catch (err: any) {
      console.error(` Error on #${id}: ${err.message}`);
      errors.push(`#${id}: ${err.message}`);
    }
  }

  return { pokemonEntries, i18nEn, i18nKo, errors };
}

// --- Output helpers ---
export function writePokemonJson(
  dir: string,
  pokemonEntries: Record<string, any>,
  starters: string[],
): void {
  const sortedPokemon: Record<string, any> = {};
  const sorted = Object.values(pokemonEntries).sort((a: any, b: any) => a.id - b.id);
  for (const entry of sorted) {
    sortedPokemon[String((entry as any).id)] = entry;
  }
  const output = { pokemon: sortedPokemon, starters };
  writeFileSync(`${dir}/pokemon.json`, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`\n✓ pokemon.json: ${Object.keys(sortedPokemon).length} species`);
}

export function writeRegionsJson(
  dir: string,
  regions: Record<string, { pokemon_pool: number[]; level_range: [number, number]; unlock_condition: { type: string; value: number } | null }>,
  pokemonEntries: Record<string, any>,
): void {
  // Assign pokemon to region pools
  for (const entry of Object.values(pokemonEntries) as any[]) {
    const r = entry.region;
    if (regions[r] && entry.unlock !== 'starter') {
      regions[r].pokemon_pool.push(entry.id);
    }
  }

  const regionsData: Record<string, any> = {};
  for (const [rid, rdata] of Object.entries(regions)) {
    regionsData[rid] = {
      id: parseInt(rid),
      level_range: rdata.level_range,
      pokemon_pool: rdata.pokemon_pool.map(String).sort((a: string, b: string) => parseInt(a) - parseInt(b)),
      unlock_condition: rdata.unlock_condition,
    };
  }
  writeFileSync(`${dir}/regions.json`, JSON.stringify({ regions: regionsData, default_region: '1' }, null, 2) + '\n', 'utf-8');
  console.log(`✓ regions.json: ${Object.keys(regionsData).length} regions`);
}

export function writeI18nJson(
  dir: string,
  i18nEn: Record<string, string>,
  i18nKo: Record<string, string>,
  regionNamesEn: Record<string, { name: string; description: string }>,
  regionNamesKo: Record<string, { name: string; description: string }>,
  achievementNamesEn: Record<string, { name: string; description: string; rarity_label: string }>,
  achievementNamesKo: Record<string, { name: string; description: string; rarity_label: string }>,
): void {
  mkdirSync(`${dir}/i18n`, { recursive: true });
  const enData = { pokemon: i18nEn, types: TYPE_NAMES_EN, regions: regionNamesEn, achievements: achievementNamesEn };
  const koData = { pokemon: i18nKo, types: TYPE_NAMES_KO, regions: regionNamesKo, achievements: achievementNamesKo };
  writeFileSync(`${dir}/i18n/en.json`, JSON.stringify(enData, null, 2) + '\n', 'utf-8');
  writeFileSync(`${dir}/i18n/ko.json`, JSON.stringify(koData, null, 2) + '\n', 'utf-8');
  console.log(`✓ i18n: en.json (${Object.keys(i18nEn).length} names), ko.json (${Object.keys(i18nKo).length} names)`);
}

export function writeAchievementsJson(dir: string, achievements: any[]): void {
  writeFileSync(`${dir}/achievements.json`, JSON.stringify({ achievements }, null, 2) + '\n', 'utf-8');
  console.log(`✓ achievements.json: ${achievements.length} achievements`);
}

export function writePokedexRewardsJson(dir: string, rewards: any): void {
  writeFileSync(`${dir}/pokedex-rewards.json`, JSON.stringify(rewards, null, 2) + '\n', 'utf-8');
  console.log('✓ pokedex-rewards.json');
}
