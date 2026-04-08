#!/usr/bin/env npx tsx
/**
 * Patch Base Stats: Add sp_attack & sp_defense to all pokemon.json files
 *
 * Reads each gen's pokemon.json, checks for missing sp_attack/sp_defense,
 * fetches from PokeAPI, and writes back.
 *
 * Usage: npx tsx scripts/patch-base-stats.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const DELAY_MS = 60;
const MAX_RETRIES = 3;

interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  sp_attack?: number;
  sp_defense?: number;
}

interface PokemonEntry {
  id: number;
  base_stats: BaseStats;
  [key: string]: any;
}

interface PokemonFile {
  pokemon: Record<string, PokemonEntry>;
  [key: string]: any;
}

// All files to patch: [filePath, description]
const FILES_TO_PATCH: [string, string][] = [
  [join(PROJECT_ROOT, 'data', 'gen1', 'pokemon.json'), 'gen1'],
  [join(PROJECT_ROOT, 'data', 'gen2', 'pokemon.json'), 'gen2'],
  [join(PROJECT_ROOT, 'data', 'gen3', 'pokemon.json'), 'gen3'],
  [join(PROJECT_ROOT, 'data', 'gen4', 'pokemon.json'), 'gen4'],
  [join(PROJECT_ROOT, 'data', 'gen5', 'pokemon.json'), 'gen5'],
  [join(PROJECT_ROOT, 'data', 'gen6', 'pokemon.json'), 'gen6'],
  [join(PROJECT_ROOT, 'data', 'gen7', 'pokemon.json'), 'gen7'],
  [join(PROJECT_ROOT, 'data', 'gen8', 'pokemon.json'), 'gen8'],
  [join(PROJECT_ROOT, 'data', 'gen9', 'pokemon.json'), 'gen9'],
  [join(PROJECT_ROOT, 'data', 'pokemon.json'), 'legacy (gen4)'],
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = Math.min(2000 * attempt, 10000);
        console.warn(`  Rate limited, waiting ${wait}ms (attempt ${attempt}/${retries})...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err: any) {
      if (attempt === retries) throw err;
      const wait = 1000 * attempt;
      console.warn(`  Fetch error (attempt ${attempt}/${retries}): ${err.message}, retrying in ${wait}ms...`);
      await sleep(wait);
    }
  }
}

async function fetchSpStats(pokemonId: number): Promise<{ sp_attack: number; sp_defense: number }> {
  const data = await fetchWithRetry(`${POKEAPI_BASE}/pokemon/${pokemonId}`);
  const statMap: Record<string, number> = {};
  for (const s of data.stats) {
    statMap[s.stat.name] = s.base_stat;
  }
  return {
    sp_attack: statMap['special-attack'] || 0,
    sp_defense: statMap['special-defense'] || 0,
  };
}

async function patchFile(filePath: string, label: string): Promise<number> {
  console.log(`\n=== Patching ${label}: ${filePath} ===`);

  const raw = readFileSync(filePath, 'utf-8');
  const data: PokemonFile = JSON.parse(raw);
  const pokemon = data.pokemon;
  const ids = Object.keys(pokemon).map(Number).sort((a, b) => a - b);

  // Find pokemon missing sp_attack/sp_defense
  const needsPatch = ids.filter((id) => {
    const entry = pokemon[String(id)];
    return (
      entry.base_stats.sp_attack === undefined ||
      entry.base_stats.sp_defense === undefined
    );
  });

  if (needsPatch.length === 0) {
    console.log(`  All ${ids.length} pokemon already have sp_attack/sp_defense. Skipping.`);
    return 0;
  }

  console.log(`  ${needsPatch.length}/${ids.length} pokemon need patching.`);

  let patched = 0;
  for (const id of needsPatch) {
    try {
      const { sp_attack, sp_defense } = await fetchSpStats(id);
      const entry = pokemon[String(id)];

      // Rebuild base_stats in consistent order
      entry.base_stats = {
        hp: entry.base_stats.hp,
        attack: entry.base_stats.attack,
        defense: entry.base_stats.defense,
        speed: entry.base_stats.speed,
        sp_attack,
        sp_defense,
      };

      patched++;
      if (patched % 25 === 0 || patched === needsPatch.length) {
        console.log(`  Patched ${patched}/${needsPatch.length} (current: #${id})`);
      }

      await sleep(DELAY_MS);
    } catch (err: any) {
      console.error(`  FAILED for pokemon #${id}: ${err.message}`);
      // Continue with remaining pokemon
    }
  }

  // Write back
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`  Wrote ${filePath} (${patched} pokemon patched)`);
  return patched;
}

async function main() {
  console.log('Patch Base Stats: Adding sp_attack & sp_defense to all pokemon data files');
  console.log(`DELAY_MS=${DELAY_MS}, MAX_RETRIES=${MAX_RETRIES}`);
  console.log(`Files to patch: ${FILES_TO_PATCH.length}`);

  // Collect all unique IDs to estimate total API calls
  const allIds = new Set<number>();
  for (const [filePath] of FILES_TO_PATCH) {
    const data: PokemonFile = JSON.parse(readFileSync(filePath, 'utf-8'));
    for (const id of Object.keys(data.pokemon)) {
      allIds.add(Number(id));
    }
  }
  console.log(`Total unique pokemon IDs across all files: ${allIds.size}`);

  // Cache fetched stats to avoid duplicate API calls for pokemon in multiple files
  const statsCache = new Map<number, { sp_attack: number; sp_defense: number }>();

  let totalPatched = 0;
  const startTime = Date.now();

  for (const [filePath, label] of FILES_TO_PATCH) {
    const raw = readFileSync(filePath, 'utf-8');
    const data: PokemonFile = JSON.parse(raw);
    const pokemon = data.pokemon;
    const ids = Object.keys(pokemon).map(Number).sort((a, b) => a - b);

    const needsPatch = ids.filter((id) => {
      const entry = pokemon[String(id)];
      return (
        entry.base_stats.sp_attack === undefined ||
        entry.base_stats.sp_defense === undefined
      );
    });

    if (needsPatch.length === 0) {
      console.log(`\n=== ${label}: All ${ids.length} pokemon already patched. Skipping. ===`);
      continue;
    }

    console.log(`\n=== Patching ${label} (${needsPatch.length}/${ids.length} need patching) ===`);

    let patched = 0;
    for (const id of needsPatch) {
      try {
        let stats = statsCache.get(id);
        if (!stats) {
          stats = await fetchSpStats(id);
          statsCache.set(id, stats);
          await sleep(DELAY_MS);
        }

        const entry = pokemon[String(id)];
        entry.base_stats = {
          hp: entry.base_stats.hp,
          attack: entry.base_stats.attack,
          defense: entry.base_stats.defense,
          speed: entry.base_stats.speed,
          sp_attack: stats.sp_attack,
          sp_defense: stats.sp_defense,
        };

        patched++;
        if (patched % 25 === 0 || patched === needsPatch.length) {
          console.log(`  ${label}: ${patched}/${needsPatch.length} (current: #${id})`);
        }
      } catch (err: any) {
        console.error(`  FAILED for pokemon #${id}: ${err.message}`);
      }
    }

    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(`  Wrote ${label} (${patched} pokemon patched)`);
    totalPatched += patched;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Patched ${totalPatched} pokemon entries across ${FILES_TO_PATCH.length} files in ${elapsed}s`);
  console.log(`API calls made: ${statsCache.size} (cached for duplicates)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
