#!/usr/bin/env tsx
/**
 * Move Data Generator — fetches move data from PokeAPI for all pokemon
 * across gen1–gen9 and curates 4–6 best moves per pokemon.
 *
 * Outputs:
 *   data/moves.json         — all move definitions used
 *   data/pokemon-moves.json — per-pokemon move pools (4–6 curated moves each)
 *
 * Runtime: ~15–30 min due to API rate limits. Idempotent.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const DELAY_MS = 60;
const MAX_RETRIES = 3;

// ─── Types ───────────────────────────────────────────────────────────

interface PokemonEntry {
  id: number;
  types: string[];
  [key: string]: unknown;
}

interface MoveDefinition {
  id: number;
  name: string;
  nameKo: string;
  nameEn: string;
  type: string;
  category: string; // 'physical' | 'special' | 'status'
  power: number;
  accuracy: number | null;
  pp: number;
}

interface PokemonMoveEntry {
  moveId: number;
  learnLevel: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<unknown> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = DELAY_MS * attempt * 2;
      console.warn(`  ⚠ Attempt ${attempt}/${retries} failed for ${url}, retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }
  throw new Error('unreachable');
}

// ─── Load all pokemon IDs from gen1–gen9 ─────────────────────────────

function loadAllPokemon(): Map<string, PokemonEntry> {
  const all = new Map<string, PokemonEntry>();
  for (let gen = 1; gen <= 9; gen++) {
    const filePath = join(DATA_DIR, `gen${gen}`, 'pokemon.json');
    if (!existsSync(filePath)) {
      console.warn(`Skipping gen${gen}: ${filePath} not found`);
      continue;
    }
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const pokemon = data.pokemon as Record<string, PokemonEntry>;
    for (const [id, entry] of Object.entries(pokemon)) {
      if (!all.has(id)) {
        all.set(id, entry);
      }
    }
  }
  return all;
}

// ─── Move cache ──────────────────────────────────────────────────────

const moveCache = new Map<number, MoveDefinition>();

async function fetchMoveData(moveId: number): Promise<MoveDefinition> {
  if (moveCache.has(moveId)) {
    return moveCache.get(moveId)!;
  }

  await sleep(DELAY_MS);
  const data = await fetchWithRetry(`${POKEAPI_BASE}/move/${moveId}`) as Record<string, any>;

  const nameKo = data.names?.find((n: any) => n.language?.name === 'ko')?.name ?? data.name;
  const nameEn = data.names?.find((n: any) => n.language?.name === 'en')?.name ?? data.name;

  const move: MoveDefinition = {
    id: moveId,
    name: data.name,
    nameKo,
    nameEn,
    type: data.type?.name ?? 'normal',
    category: data.damage_class?.name ?? 'status',
    power: data.power ?? 0,
    accuracy: data.accuracy ?? null,
    pp: data.pp ?? 0,
  };

  moveCache.set(moveId, move);
  return move;
}

// ─── Curation algorithm ──────────────────────────────────────────────

interface CandidateMove {
  move: MoveDefinition;
  learnLevel: number;
}

function curateMoves(candidates: CandidateMove[], pokemonTypes: string[]): PokemonMoveEntry[] {
  // 1. Filter to physical/special with power > 0
  const eligible = candidates.filter(
    c => (c.move.category === 'physical' || c.move.category === 'special') && c.move.power > 0
  );

  if (eligible.length === 0) {
    // Fallback: return whatever we have (up to 4), even status moves
    const fallback = candidates.slice(0, 4);
    return fallback
      .sort((a, b) => a.learnLevel - b.learnLevel)
      .map(c => ({ moveId: c.move.id, learnLevel: c.learnLevel }));
  }

  // 2. Separate STAB and non-STAB
  const stab = eligible.filter(c => pokemonTypes.includes(c.move.type));
  const nonStab = eligible.filter(c => !pokemonTypes.includes(c.move.type));

  // 3. Sort each by power descending
  stab.sort((a, b) => b.move.power - a.move.power);
  nonStab.sort((a, b) => b.move.power - a.move.power);

  // 4. Pick up to 3 STAB moves
  const selected: CandidateMove[] = [];
  for (const c of stab) {
    if (selected.length >= 3) break;
    selected.push(c);
  }

  // 5. Pick up to 3 coverage moves (different types preferred)
  const coveredTypes = new Set<string>();
  for (const c of nonStab) {
    if (selected.length >= 6) break;
    if (!coveredTypes.has(c.move.type)) {
      coveredTypes.add(c.move.type);
      selected.push(c);
    }
  }

  // If we still have room and less than 4, fill with remaining non-STAB by power
  if (selected.length < 4) {
    for (const c of nonStab) {
      if (selected.length >= 4) break;
      if (!selected.includes(c)) {
        selected.push(c);
      }
    }
  }

  // Also fill with more STAB if still under 4
  if (selected.length < 4) {
    for (const c of stab) {
      if (selected.length >= 4) break;
      if (!selected.includes(c)) {
        selected.push(c);
      }
    }
  }

  // 6. Sort final selection by learnLevel
  selected.sort((a, b) => a.learnLevel - b.learnLevel);

  return selected.map(c => ({ moveId: c.move.id, learnLevel: c.learnLevel }));
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading pokemon data from gen1–gen9...');
  const allPokemon = loadAllPokemon();
  console.log(`Found ${allPokemon.size} unique pokemon.\n`);

  const pokemonMoves: Record<string, { pool: PokemonMoveEntry[] }> = {};
  const usedMoveIds = new Set<number>();

  const pokemonIds = [...allPokemon.keys()].sort((a, b) => Number(a) - Number(b));
  let processed = 0;

  for (const pokemonId of pokemonIds) {
    const entry = allPokemon.get(pokemonId)!;
    processed++;

    if (processed % 50 === 0 || processed === 1) {
      console.log(`[${processed}/${pokemonIds.length}] Processing pokemon #${pokemonId}...`);
    }

    try {
      // Fetch pokemon learnset from PokeAPI
      await sleep(DELAY_MS);
      const pokeData = await fetchWithRetry(`${POKEAPI_BASE}/pokemon/${pokemonId}`) as Record<string, any>;

      // Extract level-up moves only
      const levelUpMoves: { moveId: number; learnLevel: number }[] = [];
      for (const moveEntry of (pokeData.moves ?? [])) {
        const versionDetails = moveEntry.version_group_details ?? [];
        // Find any level-up entry and use the highest level version
        let bestLevel = -1;
        for (const vd of versionDetails) {
          if (vd.move_learn_method?.name === 'level-up') {
            const lvl = vd.level_learned_at ?? 0;
            if (lvl > bestLevel) bestLevel = lvl;
          }
        }
        if (bestLevel >= 0) {
          const moveIdStr = moveEntry.move?.url?.split('/').filter(Boolean).pop();
          if (moveIdStr) {
            levelUpMoves.push({ moveId: Number(moveIdStr), learnLevel: bestLevel });
          }
        }
      }

      if (levelUpMoves.length === 0) {
        console.warn(`  ⚠ No level-up moves for pokemon #${pokemonId}, skipping`);
        pokemonMoves[pokemonId] = { pool: [] };
        continue;
      }

      // Fetch details for each candidate move
      const candidates: CandidateMove[] = [];
      for (const lm of levelUpMoves) {
        try {
          const moveDef = await fetchMoveData(lm.moveId);
          candidates.push({ move: moveDef, learnLevel: lm.learnLevel });
        } catch (err) {
          console.warn(`  ⚠ Failed to fetch move #${lm.moveId}: ${err}`);
        }
      }

      // Curate 4–6 best moves
      const curated = curateMoves(candidates, entry.types);
      pokemonMoves[pokemonId] = { pool: curated };

      for (const cm of curated) {
        usedMoveIds.add(cm.moveId);
      }
    } catch (err) {
      console.error(`  ✗ Failed to process pokemon #${pokemonId}: ${err}`);
      pokemonMoves[pokemonId] = { pool: [] };
    }
  }

  // Build moves.json from cached data (only moves that are actually used)
  const movesJson: Record<string, MoveDefinition> = {};
  for (const moveId of [...usedMoveIds].sort((a, b) => a - b)) {
    const m = moveCache.get(moveId);
    if (m) {
      movesJson[String(moveId)] = m;
    }
  }

  // Write outputs
  const movesPath = join(DATA_DIR, 'moves.json');
  const pokemonMovesPath = join(DATA_DIR, 'pokemon-moves.json');

  writeFileSync(movesPath, JSON.stringify(movesJson, null, 2) + '\n');
  writeFileSync(pokemonMovesPath, JSON.stringify(pokemonMoves, null, 2) + '\n');

  console.log(`\n✓ Done!`);
  console.log(`  Moves:   ${Object.keys(movesJson).length} definitions → ${movesPath}`);
  console.log(`  Pokemon: ${Object.keys(pokemonMoves).length} entries → ${pokemonMovesPath}`);

  // Quick stats
  const poolSizes = Object.values(pokemonMoves).map(p => p.pool.length);
  const avg = (poolSizes.reduce((a, b) => a + b, 0) / poolSizes.length).toFixed(1);
  const empty = poolSizes.filter(s => s === 0).length;
  console.log(`  Avg pool size: ${avg}, empty: ${empty}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
