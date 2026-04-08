# Battle System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add turn-based battle engine with gym system, move mechanics, and standalone TUI to Tokenmon.

**Architecture:** Pure-function battle engine in `src/core/`, standalone TUI process in `src/battle-tui/`, move/gym data generated via scripts. TUI spawned from Claude Code `/gym` skill, reads/writes Tokenmon state files. No token consumption.

**Tech Stack:** TypeScript, Node.js built-in test runner, custom ANSI rendering, PokeAPI for data generation.

---

### Task 1: Extend Types & BaseStats

**Files:**
- Modify: `src/core/types.ts`
- Modify: `test/helpers.ts`
- Test: `test/types.test.ts`

- [ ] **Step 1: Add sp_attack/sp_defense to BaseStats**

```ts
// src/core/types.ts — update BaseStats interface
export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  sp_attack?: number;
  sp_defense?: number;
}
```

- [ ] **Step 2: Add Move and battle-related types**

```ts
// src/core/types.ts — append new types

export type MoveCategory = 'physical' | 'special';

export interface MoveData {
  id: number;
  name: string;
  nameKo: string;
  nameEn: string;
  type: string;
  category: MoveCategory;
  power: number;
  accuracy: number;
  pp: number;
}

export interface PokemonMovePool {
  pool: Array<{ moveId: number; learnLevel: number }>;
}

export interface BattleMove {
  data: MoveData;
  currentPp: number;
}

export interface BattlePokemon {
  id: number;
  name: string;
  displayName: string;
  types: string[];
  level: number;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  moves: BattleMove[];
  fainted: boolean;
}

export interface BattleTeam {
  pokemon: BattlePokemon[];
  activeIndex: number;
}

export type TurnAction =
  | { type: 'move'; moveIndex: number }
  | { type: 'switch'; pokemonIndex: number }
  | { type: 'surrender' };

export interface TurnResult {
  messages: string[];
  playerFainted: boolean;
  opponentFainted: boolean;
}

export interface BattleState {
  player: BattleTeam;
  opponent: BattleTeam;
  turn: number;
  log: string[];
  phase: 'select_action' | 'resolve_turn' | 'fainted_switch' | 'battle_end';
  winner: 'player' | 'opponent' | null;
}

export interface GymData {
  id: number;
  leader: string;
  leaderKo: string;
  type: string;
  badge: string;
  badgeKo: string;
  team: GymPokemon[];
  region: string;
}

export interface GymPokemon {
  species: number;
  level: number;
  moves: number[];
}
```

- [ ] **Step 3: Extend PokemonState and State for moves/badges**

```ts
// src/core/types.ts — add to PokemonState interface
export interface PokemonState {
  // ... existing fields ...
  moves?: number[];  // Current move IDs (up to 4)
}

// src/core/types.ts — add to State interface
export interface State {
  // ... existing fields ...
  gym_badges?: string[];  // Array of badge IDs
}
```

- [ ] **Step 4: Update test helpers**

```ts
// test/helpers.ts — update makeState to include gym_badges
export function makeState(overrides: Partial<State> = {}): State {
  return {
    // ... all existing fields ...
    gym_badges: [],
    ...overrides,
  };
}
```

- [ ] **Step 5: Write type consistency test**

```ts
// test/types.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';

describe('battle types', () => {
  it('makeState includes gym_badges', () => {
    const state = makeState();
    assert.ok(Array.isArray(state.gym_badges));
  });

  it('BaseStats accepts sp_attack/sp_defense', () => {
    const stats = { hp: 45, attack: 49, defense: 49, speed: 45, sp_attack: 65, sp_defense: 65 };
    assert.equal(stats.sp_attack, 65);
    assert.equal(stats.sp_defense, 65);
  });

  it('PokemonState accepts moves', () => {
    const pokemon = { id: 1, xp: 0, level: 5, friendship: 0, ev: 0, moves: [1, 2, 3, 4] };
    assert.equal(pokemon.moves.length, 4);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/types.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts test/helpers.ts test/types.test.ts
git commit -m "feat: add battle type system (Move, BattlePokemon, GymData, etc.)"
```

---

### Task 2: Patch BaseStats Data (sp_attack/sp_defense)

**Files:**
- Create: `scripts/patch-base-stats.ts`
- Modify: `data/gen*/pokemon.json` (all 9 gens)
- Modify: `scripts/crawl-pokeapi.ts`
- Modify: `scripts/generate-gen1.ts` (pattern for all gen scripts)

- [ ] **Step 1: Create patch script**

The crawl scripts already fetch all 6 stats from PokeAPI (`statMap['special-attack']`, `statMap['special-defense']`) but only store 4. Create a script that patches existing data files by fetching the missing 2 stats.

```ts
// scripts/patch-base-stats.ts
#!/usr/bin/env tsx
/**
 * Patch all pokemon.json files to add sp_attack and sp_defense.
 * Reads existing files, fetches missing stats from PokeAPI, writes back.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const DELAY_MS = 60;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`Failed after 3 attempts: ${url}`);
}

async function patchGeneration(genDir: string): Promise<void> {
  const filePath = join(PROJECT_ROOT, 'data', genDir, 'pokemon.json');
  let raw: string;
  try { raw = readFileSync(filePath, 'utf-8'); } catch { return; }
  const data = JSON.parse(raw);
  const pokemon = data.pokemon || data;
  let patched = 0;

  for (const [id, poke] of Object.entries<any>(pokemon)) {
    if (poke.base_stats?.sp_attack !== undefined) continue;
    try {
      const apiData = await fetchJSON(`${POKEAPI_BASE}/pokemon/${poke.id || id}`);
      const statMap: Record<string, number> = {};
      for (const s of apiData.stats) statMap[s.stat.name] = s.base_stat;
      poke.base_stats.sp_attack = statMap['special-attack'] || 0;
      poke.base_stats.sp_defense = statMap['special-defense'] || 0;
      patched++;
      if (patched % 10 === 0) console.log(`  ${genDir}: patched ${patched} pokemon...`);
      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  Failed to patch ${id} in ${genDir}:`, err);
    }
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ ${genDir}: ${patched} pokemon patched`);
}

async function main() {
  const gens = ['gen1', 'gen2', 'gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'gen8', 'gen9'];
  for (const gen of gens) {
    await patchGeneration(gen);
  }
  // Also patch data/pokemon.json if it exists (legacy gen4)
  const legacyPath = join(PROJECT_ROOT, 'data', 'pokemon.json');
  try {
    const raw = readFileSync(legacyPath, 'utf-8');
    const data = JSON.parse(raw);
    const pokemon = data.pokemon || data;
    let patched = 0;
    for (const [id, poke] of Object.entries<any>(pokemon)) {
      if (poke.base_stats?.sp_attack !== undefined) continue;
      const apiData = await fetchJSON(`${POKEAPI_BASE}/pokemon/${poke.id || id}`);
      const statMap: Record<string, number> = {};
      for (const s of apiData.stats) statMap[s.stat.name] = s.base_stat;
      poke.base_stats.sp_attack = statMap['special-attack'] || 0;
      poke.base_stats.sp_defense = statMap['special-defense'] || 0;
      patched++;
      await sleep(DELAY_MS);
    }
    writeFileSync(legacyPath, JSON.stringify(data, null, 2) + '\n');
    console.log(`✓ legacy pokemon.json: ${patched} pokemon patched`);
  } catch {}
  console.log('Done!');
}

main().catch(console.error);
```

- [ ] **Step 2: Run patch script**

Run: `cd /home/minsiwon00/claude-battle && npx tsx scripts/patch-base-stats.ts`
Expected: All gens patched with sp_attack/sp_defense. Takes ~10 min due to API rate limits.

- [ ] **Step 3: Verify patched data**

Spot-check a few entries:
```bash
node -e "const d=require('./data/gen1/pokemon.json'); const p=d.pokemon['25']; console.log('Pikachu:', p.base_stats)"
```
Expected: `{ hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 }`

- [ ] **Step 4: Update crawl-pokeapi.ts for future runs**

```ts
// scripts/crawl-pokeapi.ts:281-286 — add 2 lines to base_stats
const base_stats = {
  hp: statMap['hp'] || 0,
  attack: statMap['attack'] || 0,
  defense: statMap['defense'] || 0,
  speed: statMap['speed'] || 0,
  sp_attack: statMap['special-attack'] || 0,
  sp_defense: statMap['special-defense'] || 0,
};
```

Apply the same pattern to `scripts/generate-gen1.ts` and all other `generate-gen*.ts` files wherever `base_stats` is constructed.

- [ ] **Step 5: Commit**

```bash
git add scripts/patch-base-stats.ts scripts/crawl-pokeapi.ts scripts/generate-gen*.ts data/
git commit -m "feat: add sp_attack/sp_defense to all pokemon base stats"
```

---

### Task 3: Move Data Generation

**Files:**
- Create: `scripts/generate-moves.ts`
- Create: `data/moves.json`
- Create: `data/pokemon-moves.json`

- [ ] **Step 1: Create move generation script**

```ts
// scripts/generate-moves.ts
#!/usr/bin/env tsx
/**
 * Generate move data and per-pokemon move pools from PokeAPI.
 * For each pokemon: select 4-6 best moves (STAB priority, type coverage, power balance).
 * Output: data/moves.json (move definitions), data/pokemon-moves.json (per-pokemon pools).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const DELAY_MS = 60;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`Failed: ${url}`);
}

interface RawMove {
  id: number;
  name: string;
  nameKo: string;
  nameEn: string;
  type: string;
  category: 'physical' | 'special' | 'status';
  power: number | null;
  accuracy: number | null;
  pp: number;
}

const moveCache = new Map<number, RawMove>();

async function fetchMove(moveId: number): Promise<RawMove | null> {
  if (moveCache.has(moveId)) return moveCache.get(moveId)!;
  try {
    const data = await fetchJSON(`${POKEAPI_BASE}/move/${moveId}`);
    const nameKo = data.names?.find((n: any) => n.language.name === 'ko')?.name || data.name;
    const nameEn = data.names?.find((n: any) => n.language.name === 'en')?.name || data.name;
    const move: RawMove = {
      id: data.id,
      name: data.name,
      nameKo,
      nameEn,
      type: data.type.name,
      category: data.damage_class.name,
      power: data.power,
      accuracy: data.accuracy,
      pp: data.pp,
    };
    moveCache.set(moveId, move);
    return move;
  } catch {
    return null;
  }
}

/**
 * Select 4-6 best moves for a pokemon from its level-up learnset.
 * Priority: STAB moves first, then type coverage, then highest power.
 * Only physical/special moves (no status in v1).
 */
function curateMoves(
  allMoves: Array<{ move: RawMove; learnLevel: number }>,
  pokemonTypes: string[],
): Array<{ moveId: number; learnLevel: number }> {
  // Filter: only damaging moves with power > 0
  const damaging = allMoves.filter(m =>
    m.move.category !== 'status' && m.move.power != null && m.move.power > 0
  );

  if (damaging.length === 0) return [];

  // Separate STAB and non-STAB
  const stab = damaging.filter(m => pokemonTypes.includes(m.move.type));
  const nonStab = damaging.filter(m => !pokemonTypes.includes(m.move.type));

  // Pick top 2-3 STAB moves (by power, prefer variety in learn levels)
  const sortByPower = (a: typeof damaging[0], b: typeof damaging[0]) =>
    (b.move.power || 0) - (a.move.power || 0);
  stab.sort(sortByPower);
  nonStab.sort(sortByPower);

  const selected: Array<{ moveId: number; learnLevel: number }> = [];
  const usedTypes = new Set<string>();

  // Pick up to 3 STAB moves
  for (const m of stab) {
    if (selected.length >= 3) break;
    selected.push({ moveId: m.move.id, learnLevel: m.learnLevel });
    usedTypes.add(m.move.type);
  }

  // Pick up to 3 coverage moves (different types preferred)
  for (const m of nonStab) {
    if (selected.length >= 6) break;
    if (selected.length >= 4 && usedTypes.has(m.move.type)) continue;
    selected.push({ moveId: m.move.id, learnLevel: m.learnLevel });
    usedTypes.add(m.move.type);
  }

  // Ensure at least 4 moves if possible
  if (selected.length < 4) {
    for (const m of [...stab, ...nonStab]) {
      if (selected.length >= 4) break;
      if (selected.some(s => s.moveId === m.move.id)) continue;
      selected.push({ moveId: m.move.id, learnLevel: m.learnLevel });
    }
  }

  // Sort by learn level
  selected.sort((a, b) => a.learnLevel - b.learnLevel);
  return selected;
}

async function main() {
  const allMoves: Record<string, RawMove> = {};
  const pokemonMoves: Record<string, { pool: Array<{ moveId: number; learnLevel: number }> }> = {};

  // Load all pokemon across generations
  const gens = ['gen1', 'gen2', 'gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'gen8', 'gen9'];
  const allPokemonIds = new Set<number>();

  for (const gen of gens) {
    try {
      const data = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', gen, 'pokemon.json'), 'utf-8'));
      const pokemon = data.pokemon || data;
      for (const [, poke] of Object.entries<any>(pokemon)) {
        allPokemonIds.add(poke.id);
      }
    } catch {}
  }

  console.log(`Processing ${allPokemonIds.size} pokemon...`);
  let processed = 0;

  for (const pokemonId of [...allPokemonIds].sort((a, b) => a - b)) {
    try {
      const pokemonData = await fetchJSON(`${POKEAPI_BASE}/pokemon/${pokemonId}`);
      const types = pokemonData.types.map((t: any) => t.type.name);

      // Get level-up moves
      const levelUpMoves: Array<{ move: RawMove; learnLevel: number }> = [];
      for (const moveEntry of pokemonData.moves) {
        const levelDetail = moveEntry.version_group_details.find(
          (d: any) => d.move_learn_method.name === 'level-up'
        );
        if (!levelDetail) continue;
        const learnLevel = levelDetail.level_learned_at || 1;

        const moveId = parseInt(moveEntry.move.url.split('/').filter(Boolean).pop()!);
        const move = await fetchMove(moveId);
        if (!move) continue;
        await sleep(DELAY_MS / 2);

        levelUpMoves.push({ move, learnLevel });
      }

      const curated = curateMoves(levelUpMoves, types);
      if (curated.length > 0) {
        pokemonMoves[String(pokemonId)] = { pool: curated };
        // Add all referenced moves to the moves dict
        for (const c of curated) {
          const m = moveCache.get(c.moveId);
          if (m) allMoves[String(m.id)] = m;
        }
      }

      processed++;
      if (processed % 25 === 0) console.log(`  ${processed}/${allPokemonIds.size} processed`);
      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  Failed pokemon ${pokemonId}:`, err);
    }
  }

  // Write output
  writeFileSync(
    join(PROJECT_ROOT, 'data', 'moves.json'),
    JSON.stringify(allMoves, null, 2) + '\n'
  );
  writeFileSync(
    join(PROJECT_ROOT, 'data', 'pokemon-moves.json'),
    JSON.stringify(pokemonMoves, null, 2) + '\n'
  );

  console.log(`✓ ${Object.keys(allMoves).length} moves, ${Object.keys(pokemonMoves).length} pokemon move pools`);
}

main().catch(console.error);
```

- [ ] **Step 2: Run generation script**

Run: `cd /home/minsiwon00/claude-battle && npx tsx scripts/generate-moves.ts`
Expected: Creates `data/moves.json` and `data/pokemon-moves.json`. Takes 15-30 min due to API rate limits.

- [ ] **Step 3: Verify output**

```bash
node -e "const m=require('./data/moves.json'); console.log('Total moves:', Object.keys(m).length)"
node -e "const p=require('./data/pokemon-moves.json'); console.log('Pokemon with moves:', Object.keys(p).length); console.log('Pikachu pool:', JSON.stringify(p['25']))"
```
Expected: 200+ moves, 900+ pokemon with move pools, Pikachu has 4-6 electric/normal moves.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-moves.ts data/moves.json data/pokemon-moves.json
git commit -m "feat: generate move data from PokeAPI (4-6 curated per pokemon)"
```

---

### Task 4: Move Loading Module

**Files:**
- Create: `src/core/moves.ts`
- Test: `test/moves.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/moves.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getMoveData, getPokemonMovePool, assignDefaultMoves } from '../src/core/moves.js';

describe('moves', () => {
  it('getMoveData returns move by ID', () => {
    const move = getMoveData(33); // tackle
    assert.ok(move, 'tackle should exist');
    assert.equal(move.type, 'normal');
    assert.ok(move.power > 0);
  });

  it('getPokemonMovePool returns pool for pokemon', () => {
    const pool = getPokemonMovePool(25); // pikachu
    assert.ok(pool.length >= 4, 'pikachu should have 4+ moves');
    assert.ok(pool.length <= 6, 'pikachu should have 6 or fewer moves');
  });

  it('assignDefaultMoves picks moves for level', () => {
    const moves = assignDefaultMoves(25, 15); // pikachu at level 15
    assert.ok(moves.length >= 1);
    assert.ok(moves.length <= 4);
    // All moves should be learnable at or below level 15
    const pool = getPokemonMovePool(25);
    for (const moveId of moves) {
      const entry = pool.find(p => p.moveId === moveId);
      assert.ok(entry, `move ${moveId} should be in pikachu's pool`);
      assert.ok(entry.learnLevel <= 15, `move ${moveId} learn level should be <= 15`);
    }
  });

  it('assignDefaultMoves returns max 4 moves', () => {
    const moves = assignDefaultMoves(25, 100); // high level
    assert.ok(moves.length <= 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/moves.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement moves.ts**

```ts
// src/core/moves.ts
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MoveData, PokemonMovePool } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let movesDB: Record<string, MoveData> | null = null;
let pokemonMovesDB: Record<string, PokemonMovePool> | null = null;

function loadMovesDB(): Record<string, MoveData> {
  if (movesDB) return movesDB;
  const dataPath = join(__dirname, '..', '..', 'data', 'moves.json');
  movesDB = JSON.parse(readFileSync(dataPath, 'utf-8'));
  return movesDB!;
}

function loadPokemonMovesDB(): Record<string, PokemonMovePool> {
  if (pokemonMovesDB) return pokemonMovesDB;
  const dataPath = join(__dirname, '..', '..', 'data', 'pokemon-moves.json');
  pokemonMovesDB = JSON.parse(readFileSync(dataPath, 'utf-8'));
  return pokemonMovesDB!;
}

/** Get move data by ID. Returns undefined if not found. */
export function getMoveData(moveId: number): MoveData | undefined {
  const db = loadMovesDB();
  return db[String(moveId)];
}

/** Get move pool for a pokemon by pokedex ID. */
export function getPokemonMovePool(pokemonId: number): Array<{ moveId: number; learnLevel: number }> {
  const db = loadPokemonMovesDB();
  return db[String(pokemonId)]?.pool ?? [];
}

/**
 * Assign default moves for a pokemon at a given level.
 * Picks up to 4 moves that the pokemon can learn at or below the given level.
 * Prefers higher-power moves when more than 4 are available.
 */
export function assignDefaultMoves(pokemonId: number, level: number): number[] {
  const pool = getPokemonMovePool(pokemonId);
  const eligible = pool.filter(m => m.learnLevel <= level);

  if (eligible.length <= 4) return eligible.map(m => m.moveId);

  // Pick the 4 with highest power
  const movesDB = loadMovesDB();
  const sorted = [...eligible].sort((a, b) => {
    const pa = movesDB[String(a.moveId)]?.power ?? 0;
    const pb = movesDB[String(b.moveId)]?.power ?? 0;
    return pb - pa;
  });

  return sorted.slice(0, 4).map(m => m.moveId);
}

/** Clear caches (for testing). */
export function _resetMovesCache(): void {
  movesDB = null;
  pokemonMovesDB = null;
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/moves.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/moves.ts test/moves.test.ts
git commit -m "feat: move data loading and default assignment"
```

---

### Task 5: Turn-Based Battle Engine

**Files:**
- Create: `src/core/turn-battle.ts`
- Test: `test/turn-battle.test.ts`

- [ ] **Step 1: Write failing tests for stat calculation**

```ts
// test/turn-battle.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateHp, calculateStat, calculateDamage, createBattlePokemon, resolveTurn } from '../src/core/turn-battle.js';

describe('stat calculation', () => {
  it('calculateHp at level 50', () => {
    const hp = calculateHp(45, 50); // Pikachu base HP
    // Formula: floor((2 * 45 * 50) / 100) + 50 + 10 = 45 + 60 = 105
    assert.equal(hp, 105);
  });

  it('calculateStat at level 50', () => {
    const atk = calculateStat(55, 50); // Pikachu base attack
    // Formula: floor((2 * 55 * 50) / 100) + 5 = 55 + 5 = 60
    assert.equal(atk, 60);
  });
});

describe('damage calculation', () => {
  it('STAB bonus is 1.5x', () => {
    // Electric move on electric pokemon should do more than normal move
    const attacker = createBattlePokemon(
      { id: 25, types: ['electric'], level: 50, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
      [{ id: 85, name: 'thunderbolt', nameKo: '10만볼트', nameEn: 'Thunderbolt', type: 'electric', category: 'special', power: 90, accuracy: 100, pp: 15 }],
    );
    const defender = createBattlePokemon(
      { id: 1, types: ['grass', 'poison'], level: 50, baseStats: { hp: 45, attack: 49, defense: 49, speed: 45, sp_attack: 65, sp_defense: 65 } },
      [],
    );
    // Run multiple times to account for random factor
    const damages: number[] = [];
    for (let i = 0; i < 100; i++) {
      damages.push(calculateDamage(attacker, defender, attacker.moves[0]));
    }
    const avg = damages.reduce((a, b) => a + b) / damages.length;
    assert.ok(avg > 0, 'damage should be positive');
  });

  it('type effectiveness 2x', () => {
    // Water vs Fire should be super effective
    const waterMove = { id: 55, name: 'water-gun', nameKo: '물대포', nameEn: 'Water Gun', type: 'water', category: 'special', power: 40, accuracy: 100, pp: 25 };
    const attacker = createBattlePokemon(
      { id: 7, types: ['water'], level: 30, baseStats: { hp: 44, attack: 48, defense: 65, speed: 43, sp_attack: 50, sp_defense: 64 } },
      [waterMove],
    );
    const defender = createBattlePokemon(
      { id: 4, types: ['fire'], level: 30, baseStats: { hp: 39, attack: 52, defense: 43, speed: 65, sp_attack: 60, sp_defense: 50 } },
      [],
    );
    const damages: number[] = [];
    for (let i = 0; i < 50; i++) {
      damages.push(calculateDamage(attacker, defender, attacker.moves[0]));
    }
    // Super effective should result in meaningful damage
    assert.ok(damages.every(d => d > 0));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/turn-battle.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement core calculations**

```ts
// src/core/turn-battle.ts
import { getTypeEffectiveness } from './type-chart.js';
import type { MoveData, BattlePokemon, BattleMove, BattleState, BattleTeam, TurnAction, TurnResult } from './types.js';

/** Simplified mainline HP formula (no IVs/EVs). */
export function calculateHp(baseHp: number, level: number): number {
  return Math.floor((2 * baseHp * level) / 100) + level + 10;
}

/** Simplified mainline stat formula (no IVs/EVs). */
export function calculateStat(baseStat: number, level: number): number {
  return Math.floor((2 * baseStat * level) / 100) + 5;
}

interface CreatePokemonInput {
  id: number;
  types: string[];
  level: number;
  baseStats: { hp: number; attack: number; defense: number; speed: number; sp_attack?: number; sp_defense?: number };
  displayName?: string;
}

/** Create a BattlePokemon from base data and moves. */
export function createBattlePokemon(input: CreatePokemonInput, moves: MoveData[]): BattlePokemon {
  const maxHp = calculateHp(input.baseStats.hp, input.level);
  return {
    id: input.id,
    name: String(input.id),
    displayName: input.displayName ?? String(input.id),
    types: input.types,
    level: input.level,
    maxHp,
    currentHp: maxHp,
    attack: calculateStat(input.baseStats.attack, input.level),
    defense: calculateStat(input.baseStats.defense, input.level),
    spAttack: calculateStat(input.baseStats.sp_attack ?? input.baseStats.attack, input.level),
    spDefense: calculateStat(input.baseStats.sp_defense ?? input.baseStats.defense, input.level),
    speed: calculateStat(input.baseStats.speed, input.level),
    moves: moves.map(m => ({ data: m, currentPp: m.pp })),
    fainted: false,
  };
}

/** Calculate damage for a single move hit. */
export function calculateDamage(attacker: BattlePokemon, defender: BattlePokemon, move: BattleMove): number {
  const power = move.data.power;
  if (!power || power <= 0) return 0;

  const atk = move.data.category === 'physical' ? attacker.attack : attacker.spAttack;
  const def = move.data.category === 'physical' ? defender.defense : defender.spDefense;

  // Mainline damage formula
  const base = Math.floor(((2 * attacker.level / 5 + 2) * power * atk / def) / 50 + 2);

  // STAB
  const stab = attacker.types.includes(move.data.type) ? 1.5 : 1.0;

  // Type effectiveness (multiply across all defender types)
  let typeEff = 1.0;
  for (const defType of defender.types) {
    typeEff *= getTypeEffectiveness(move.data.type, defType);
  }

  // Random factor 0.85 - 1.0
  const random = 0.85 + Math.random() * 0.15;

  return Math.max(1, Math.floor(base * stab * typeEff * random));
}

/** Get type effectiveness message. */
export function getEffectivenessMessage(moveType: string, defenderTypes: string[]): string | null {
  let eff = 1.0;
  for (const t of defenderTypes) {
    eff *= getTypeEffectiveness(moveType, t);
  }
  if (eff === 0) return 'effect_immune';
  if (eff >= 2) return 'effect_super';
  if (eff > 0 && eff < 1) return 'effect_not_very';
  return null;
}

/** Check accuracy and determine if move hits. */
export function checkAccuracy(move: BattleMove): boolean {
  if (move.data.accuracy === null || move.data.accuracy === 0) return true; // moves like Swift
  return Math.random() * 100 < move.data.accuracy;
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/turn-battle.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for turn resolution**

```ts
// test/turn-battle.test.ts — append
import { createBattleState, getActivePokemon, executeAction } from '../src/core/turn-battle.js';

describe('turn resolution', () => {
  function makeTestState(): BattleState {
    const playerMon = createBattlePokemon(
      { id: 25, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
      [{ id: 85, name: 'thunderbolt', nameKo: '10만볼트', nameEn: 'Thunderbolt', type: 'electric', category: 'special', power: 90, accuracy: 100, pp: 15 }],
    );
    const opponentMon = createBattlePokemon(
      { id: 7, types: ['water'], level: 30, baseStats: { hp: 44, attack: 48, defense: 65, speed: 43, sp_attack: 50, sp_defense: 64 } },
      [{ id: 55, name: 'water-gun', nameKo: '물대포', nameEn: 'Water Gun', type: 'water', category: 'special', power: 40, accuracy: 100, pp: 25 }],
    );
    return createBattleState([playerMon], [opponentMon]);
  }

  it('faster pokemon attacks first', () => {
    const state = makeTestState();
    // Pikachu (speed 90) vs Squirtle (speed 43) — Pikachu should go first
    const result = resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    // First message should be about Pikachu's attack
    assert.ok(result.messages.length > 0);
  });

  it('switch has priority over move', () => {
    const playerMon1 = createBattlePokemon(
      { id: 25, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
      [{ id: 85, name: 'thunderbolt', nameKo: '10만볼트', nameEn: 'Thunderbolt', type: 'electric', category: 'special', power: 90, accuracy: 100, pp: 15 }],
    );
    const playerMon2 = createBattlePokemon(
      { id: 6, types: ['fire', 'flying'], level: 30, baseStats: { hp: 78, attack: 84, defense: 78, speed: 100, sp_attack: 109, sp_defense: 85 } },
      [{ id: 53, name: 'flamethrower', nameKo: '화염방사', nameEn: 'Flamethrower', type: 'fire', category: 'special', power: 90, accuracy: 100, pp: 15 }],
    );
    const opponentMon = createBattlePokemon(
      { id: 7, types: ['water'], level: 30, baseStats: { hp: 44, attack: 48, defense: 65, speed: 43, sp_attack: 50, sp_defense: 64 } },
      [{ id: 55, name: 'water-gun', nameKo: '물대포', nameEn: 'Water Gun', type: 'water', category: 'special', power: 40, accuracy: 100, pp: 25 }],
    );
    const state = createBattleState([playerMon1, playerMon2], [opponentMon]);
    const result = resolveTurn(state, { type: 'switch', pokemonIndex: 1 }, { type: 'move', moveIndex: 0 });
    // After resolution, player's active should be index 1
    assert.equal(state.player.activeIndex, 1);
  });

  it('fainted pokemon triggers phase change', () => {
    const state = makeTestState();
    // Set opponent HP very low
    state.opponent.pokemon[0].currentHp = 1;
    const result = resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.ok(state.opponent.pokemon[0].fainted);
  });

  it('surrender ends battle', () => {
    const state = makeTestState();
    const result = resolveTurn(state, { type: 'surrender' }, { type: 'move', moveIndex: 0 });
    assert.equal(state.phase, 'battle_end');
    assert.equal(state.winner, 'opponent');
  });
});
```

- [ ] **Step 6: Implement turn resolution**

```ts
// src/core/turn-battle.ts — append

/** Create initial battle state from two teams. */
export function createBattleState(playerTeam: BattlePokemon[], opponentTeam: BattlePokemon[]): BattleState {
  return {
    player: { pokemon: playerTeam, activeIndex: 0 },
    opponent: { pokemon: opponentTeam, activeIndex: 0 },
    turn: 0,
    log: [],
    phase: 'select_action',
    winner: null,
  };
}

/** Get the active (non-fainted) pokemon for a team. */
export function getActivePokemon(team: BattleTeam): BattlePokemon {
  return team.pokemon[team.activeIndex];
}

/** Check if a team has any non-fainted pokemon. */
export function hasAlivePokemon(team: BattleTeam): boolean {
  return team.pokemon.some(p => !p.fainted);
}

/** Execute a single move action. Returns messages. */
function executeMoveAction(attacker: BattlePokemon, defender: BattlePokemon, moveIndex: number): string[] {
  const messages: string[] = [];
  const move = attacker.moves[moveIndex];
  if (!move || move.currentPp <= 0) {
    messages.push(`${attacker.displayName}은(는) 발버둥쳤다!`);
    // Struggle: 1/4 max HP recoil, 50 power typeless
    const damage = Math.max(1, Math.floor(defender.maxHp / 8));
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    attacker.currentHp = Math.max(0, attacker.currentHp - Math.floor(attacker.maxHp / 4));
    return messages;
  }

  move.currentPp--;
  messages.push(`${attacker.displayName}의 ${move.data.nameKo}!`);

  if (!checkAccuracy(move)) {
    messages.push('공격이 빗나갔다!');
    return messages;
  }

  const damage = calculateDamage(attacker, defender, move);
  defender.currentHp = Math.max(0, defender.currentHp - damage);

  const effMsg = getEffectivenessMessage(move.data.type, defender.types);
  if (effMsg === 'effect_super') messages.push('효과가 굉장했다!');
  else if (effMsg === 'effect_not_very') messages.push('효과가 별로인 듯하다...');
  else if (effMsg === 'effect_immune') messages.push('효과가 없는 듯하다...');

  if (defender.currentHp <= 0) {
    defender.fainted = true;
    defender.currentHp = 0;
    messages.push(`${defender.displayName}은(는) 쓰러졌다!`);
  }

  return messages;
}

/** Resolve a full turn with both sides' actions. Mutates state. */
export function resolveTurn(
  state: BattleState,
  playerAction: TurnAction,
  opponentAction: TurnAction,
): TurnResult {
  const messages: string[] = [];
  state.turn++;

  // Handle surrender
  if (playerAction.type === 'surrender') {
    state.phase = 'battle_end';
    state.winner = 'opponent';
    messages.push('항복했다...');
    return { messages, playerFainted: false, opponentFainted: false };
  }

  // Determine action order
  interface ResolvedAction {
    side: 'player' | 'opponent';
    action: TurnAction;
  }

  const actions: ResolvedAction[] = [];
  const playerPoke = getActivePokemon(state.player);
  const opponentPoke = getActivePokemon(state.opponent);

  // Priority: switch > move. Within same priority, speed determines order.
  const playerPriority = playerAction.type === 'switch' ? 1 : 0;
  const opponentPriority = opponentAction.type === 'switch' ? 1 : 0;

  if (playerPriority > opponentPriority) {
    actions.push({ side: 'player', action: playerAction }, { side: 'opponent', action: opponentAction });
  } else if (opponentPriority > playerPriority) {
    actions.push({ side: 'opponent', action: opponentAction }, { side: 'player', action: playerAction });
  } else {
    // Same priority — speed decides (random tiebreak)
    if (playerPoke.speed > opponentPoke.speed || (playerPoke.speed === opponentPoke.speed && Math.random() < 0.5)) {
      actions.push({ side: 'player', action: playerAction }, { side: 'opponent', action: opponentAction });
    } else {
      actions.push({ side: 'opponent', action: opponentAction }, { side: 'player', action: playerAction });
    }
  }

  let playerFainted = false;
  let opponentFainted = false;

  // Execute actions in order
  for (const { side, action } of actions) {
    const attackerTeam = side === 'player' ? state.player : state.opponent;
    const defenderTeam = side === 'player' ? state.opponent : state.player;
    const attacker = getActivePokemon(attackerTeam);
    const defender = getActivePokemon(defenderTeam);

    // Skip if attacker already fainted this turn
    if (attacker.fainted) continue;

    if (action.type === 'switch') {
      const newIndex = action.pokemonIndex;
      const switchedTo = attackerTeam.pokemon[newIndex];
      messages.push(`${attacker.displayName}에서 ${switchedTo.displayName}(으)로 교체!`);
      attackerTeam.activeIndex = newIndex;
    } else if (action.type === 'move') {
      const turnMessages = executeMoveAction(attacker, defender, action.moveIndex);
      messages.push(...turnMessages);

      if (defender.fainted) {
        if (side === 'player') opponentFainted = true;
        else playerFainted = true;
      }
      // Check if attacker fainted from recoil (struggle)
      if (attacker.fainted) {
        if (side === 'player') playerFainted = true;
        else opponentFainted = true;
      }
    }
  }

  // Check win/loss conditions
  if (opponentFainted && !hasAlivePokemon(state.opponent)) {
    state.phase = 'battle_end';
    state.winner = 'player';
  } else if (playerFainted && !hasAlivePokemon(state.player)) {
    state.phase = 'battle_end';
    state.winner = 'opponent';
  } else if (opponentFainted) {
    // Opponent needs to switch — handled by AI externally
    state.phase = 'select_action';
  } else if (playerFainted) {
    state.phase = 'fainted_switch';
  } else {
    state.phase = 'select_action';
  }

  state.log.push(...messages);
  return { messages, playerFainted, opponentFainted };
}
```

- [ ] **Step 7: Run tests**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/turn-battle.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/turn-battle.ts test/turn-battle.test.ts
git commit -m "feat: turn-based battle engine with damage calc and turn resolution"
```

---

### Task 6: Gym AI

**Files:**
- Create: `src/core/gym-ai.ts`
- Test: `test/gym-ai.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/gym-ai.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { selectAiMove } from '../src/core/gym-ai.js';
import { createBattlePokemon } from '../src/core/turn-battle.js';
import type { BattlePokemon, MoveData } from '../src/core/types.js';

describe('gym AI', () => {
  const thunderbolt: MoveData = { id: 85, name: 'thunderbolt', nameKo: '10만볼트', nameEn: 'Thunderbolt', type: 'electric', category: 'special', power: 90, accuracy: 100, pp: 15 };
  const tackle: MoveData = { id: 33, name: 'tackle', nameKo: '몸통박치기', nameEn: 'Tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35 };
  const waterGun: MoveData = { id: 55, name: 'water-gun', nameKo: '물대포', nameEn: 'Water Gun', type: 'water', category: 'special', power: 40, accuracy: 100, pp: 25 };

  it('prefers super-effective moves', () => {
    const ai = createBattlePokemon(
      { id: 25, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
      [thunderbolt, tackle],
    );
    const target = createBattlePokemon(
      { id: 7, types: ['water'], level: 30, baseStats: { hp: 44, attack: 48, defense: 65, speed: 43, sp_attack: 50, sp_defense: 64 } },
      [],
    );
    // Over many runs, thunderbolt (super effective vs water) should be picked most often
    let tbCount = 0;
    for (let i = 0; i < 100; i++) {
      const idx = selectAiMove(ai, target);
      if (idx === 0) tbCount++;
    }
    assert.ok(tbCount > 60, `thunderbolt should be picked >60% of the time, got ${tbCount}%`);
  });

  it('skips moves with 0 PP', () => {
    const ai = createBattlePokemon(
      { id: 25, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
      [thunderbolt, tackle],
    );
    ai.moves[0].currentPp = 0; // thunderbolt out of PP
    const idx = selectAiMove(ai, ai);
    assert.equal(idx, 1); // should pick tackle
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/gym-ai.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement gym AI**

```ts
// src/core/gym-ai.ts
import { getTypeEffectiveness } from './type-chart.js';
import type { BattlePokemon, TurnAction } from './types.js';

/**
 * Select the best move for the AI.
 * Strategy: prioritize super-effective moves, with small randomness.
 * Returns move index.
 */
export function selectAiMove(attacker: BattlePokemon, defender: BattlePokemon): number {
  const usableMoves = attacker.moves
    .map((m, i) => ({ move: m, index: i }))
    .filter(m => m.move.currentPp > 0);

  if (usableMoves.length === 0) return 0; // will trigger struggle

  // Score each move
  const scored = usableMoves.map(({ move, index }) => {
    let typeEff = 1.0;
    for (const defType of defender.types) {
      typeEff *= getTypeEffectiveness(move.data.type, defType);
    }
    const stab = attacker.types.includes(move.data.type) ? 1.5 : 1.0;
    const power = move.data.power || 0;
    const score = power * stab * typeEff;
    return { index, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // 80% chance to pick the best move, 20% random
  if (Math.random() < 0.8 || scored.length === 1) {
    return scored[0].index;
  }
  return scored[Math.floor(Math.random() * scored.length)].index;
}

/** Select AI action for a turn. Currently always attacks (no switching in v1). */
export function selectAiAction(attacker: BattlePokemon, defender: BattlePokemon): TurnAction {
  return { type: 'move', moveIndex: selectAiMove(attacker, defender) };
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/gym-ai.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/gym-ai.ts test/gym-ai.test.ts
git commit -m "feat: gym leader AI with super-effective move prioritization"
```

---

### Task 7: Gym Data & Badge System

**Files:**
- Create: `data/gyms/gen1.json`
- Create: `src/core/gym.ts`
- Test: `test/gym.test.ts`

- [ ] **Step 1: Create Kanto gym data**

```json
// data/gyms/gen1.json
{
  "gyms": [
    {
      "id": 1, "leader": "Brock", "leaderKo": "웅",
      "type": "rock", "badge": "boulder", "badgeKo": "회색배지",
      "region": "gen1",
      "team": [
        { "species": 74, "level": 12, "moves": [88, 33, 106, 397] },
        { "species": 95, "level": 14, "moves": [88, 20, 106, 157] },
        { "species": 111, "level": 12, "moves": [30, 33, 31, 23] }
      ]
    },
    {
      "id": 2, "leader": "Misty", "leaderKo": "이슬",
      "type": "water", "badge": "cascade", "badgeKo": "블루배지",
      "region": "gen1",
      "team": [
        { "species": 120, "level": 18, "moves": [55, 33, 106, 229] },
        { "species": 121, "level": 21, "moves": [55, 94, 106, 229] },
        { "species": 54, "level": 18, "moves": [55, 10, 93, 50] }
      ]
    },
    {
      "id": 3, "leader": "Lt. Surge", "leaderKo": "마티스",
      "type": "electric", "badge": "thunder", "badgeKo": "오렌지배지",
      "region": "gen1",
      "team": [
        { "species": 100, "level": 21, "moves": [84, 33, 103, 49] },
        { "species": 25, "level": 18, "moves": [84, 98, 86, 45] },
        { "species": 26, "level": 24, "moves": [85, 98, 86, 9] }
      ]
    },
    {
      "id": 4, "leader": "Erika", "leaderKo": "민화",
      "type": "grass", "badge": "rainbow", "badgeKo": "무지개배지",
      "region": "gen1",
      "team": [
        { "species": 71, "level": 29, "moves": [75, 51, 77, 79] },
        { "species": 114, "level": 24, "moves": [22, 79, 72, 77] },
        { "species": 45, "level": 29, "moves": [76, 77, 79, 51] }
      ]
    },
    {
      "id": 5, "leader": "Koga", "leaderKo": "독수",
      "type": "poison", "badge": "soul", "badgeKo": "핑크배지",
      "region": "gen1",
      "team": [
        { "species": 109, "level": 37, "moves": [124, 108, 120, 33] },
        { "species": 89, "level": 39, "moves": [124, 188, 34, 107] },
        { "species": 110, "level": 43, "moves": [124, 108, 120, 153] }
      ]
    },
    {
      "id": 6, "leader": "Sabrina", "leaderKo": "초련",
      "type": "psychic", "badge": "marsh", "badgeKo": "골드배지",
      "region": "gen1",
      "team": [
        { "species": 64, "level": 38, "moves": [94, 60, 105, 115] },
        { "species": 122, "level": 37, "moves": [94, 60, 113, 115] },
        { "species": 65, "level": 43, "moves": [94, 60, 105, 115] }
      ]
    },
    {
      "id": 7, "leader": "Blaine", "leaderKo": "강연",
      "type": "fire", "badge": "volcano", "badgeKo": "진홍배지",
      "region": "gen1",
      "team": [
        { "species": 58, "level": 42, "moves": [53, 44, 36, 46] },
        { "species": 77, "level": 40, "moves": [53, 23, 36, 33] },
        { "species": 59, "level": 47, "moves": [53, 44, 36, 46] }
      ]
    },
    {
      "id": 8, "leader": "Giovanni", "leaderKo": "비주기",
      "type": "ground", "badge": "earth", "badgeKo": "초록배지",
      "region": "gen1",
      "team": [
        { "species": 111, "level": 45, "moves": [89, 31, 32, 224] },
        { "species": 51, "level": 42, "moves": [89, 91, 163, 50] },
        { "species": 112, "level": 50, "moves": [89, 31, 32, 224] }
      ]
    }
  ]
}
```

Note: Move IDs reference PokeAPI move IDs. The implementer should verify these match moves in `data/moves.json` and adjust if needed (adding missing moves to the moves data).

- [ ] **Step 2: Write failing tests**

```ts
// test/gym.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { loadGymData, getNextGym, awardGymVictory } from '../src/core/gym.js';
import { makeState } from './helpers.js';

describe('gym system', () => {
  it('loadGymData returns gym list for gen1', () => {
    const gyms = loadGymData('gen1');
    assert.equal(gyms.length, 8);
    assert.equal(gyms[0].leader, 'Brock');
    assert.equal(gyms[0].type, 'rock');
  });

  it('getNextGym returns first gym without badges', () => {
    const state = makeState({ gym_badges: [] });
    const next = getNextGym('gen1', state);
    assert.ok(next);
    assert.equal(next.id, 1);
  });

  it('getNextGym returns second gym with first badge', () => {
    const state = makeState({ gym_badges: ['boulder'] });
    const next = getNextGym('gen1', state);
    assert.ok(next);
    assert.equal(next.id, 2);
  });

  it('getNextGym returns null when all cleared', () => {
    const allBadges = ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'];
    const state = makeState({ gym_badges: allBadges });
    const next = getNextGym('gen1', state);
    assert.equal(next, null);
  });

  it('awardGymVictory adds badge and XP', () => {
    const state = makeState({
      gym_badges: [],
      pokemon: { '25': { id: 25, xp: 100, level: 15, friendship: 0, ev: 0 } },
    });
    const gym = loadGymData('gen1')[0]; // Brock, highest level = 14
    const result = awardGymVictory(state, gym, ['25']);
    assert.ok(state.gym_badges!.includes('boulder'));
    assert.equal(result.xpAwarded, 14 * 50); // highest level × 50
  });

  it('re-challenge gives 50% XP, no duplicate badge', () => {
    const state = makeState({
      gym_badges: ['boulder'],
      pokemon: { '25': { id: 25, xp: 100, level: 15, friendship: 0, ev: 0 } },
    });
    const gym = loadGymData('gen1')[0];
    const result = awardGymVictory(state, gym, ['25']);
    assert.equal(result.xpAwarded, Math.floor(14 * 50 * 0.5));
    // Badge count should not increase
    assert.equal(state.gym_badges!.filter(b => b === 'boulder').length, 1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/gym.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement gym.ts**

```ts
// src/core/gym.ts
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { GymData, State } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const gymCache = new Map<string, GymData[]>();

/** Load gym data for a generation. */
export function loadGymData(generation: string): GymData[] {
  if (gymCache.has(generation)) return gymCache.get(generation)!;
  const filePath = join(__dirname, '..', '..', 'data', 'gyms', `${generation}.json`);
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  gymCache.set(generation, data.gyms);
  return data.gyms;
}

/** Get the next uncleared gym. Returns null if all cleared. */
export function getNextGym(generation: string, state: State): GymData | null {
  const gyms = loadGymData(generation);
  const badges = state.gym_badges ?? [];
  for (const gym of gyms) {
    if (!badges.includes(gym.badge)) return gym;
  }
  return null;
}

/** Get a specific gym by ID. */
export function getGymById(generation: string, gymId: number): GymData | undefined {
  return loadGymData(generation).find(g => g.id === gymId);
}

interface GymVictoryResult {
  xpAwarded: number;
  badgeEarned: boolean;
  badge: string;
}

/** Award victory rewards. Mutates state. */
export function awardGymVictory(
  state: State,
  gym: GymData,
  participatingPokemon: string[],
): GymVictoryResult {
  if (!state.gym_badges) state.gym_badges = [];
  const alreadyHasBadge = state.gym_badges.includes(gym.badge);

  // XP = highest level pokemon on gym leader's team × 50
  const highestLevel = Math.max(...gym.team.map(p => p.level));
  const baseXp = highestLevel * 50;
  const xpAwarded = alreadyHasBadge ? Math.floor(baseXp * 0.5) : baseXp;

  // Award XP to all participating pokemon
  for (const name of participatingPokemon) {
    if (state.pokemon[name]) {
      state.pokemon[name].xp += xpAwarded;
    }
  }

  // Award badge (no duplicates)
  let badgeEarned = false;
  if (!alreadyHasBadge) {
    state.gym_badges.push(gym.badge);
    badgeEarned = true;
  }

  return { xpAwarded, badgeEarned, badge: gym.badge };
}

/** Clear cache (for testing). */
export function _resetGymCache(): void {
  gymCache.clear();
}
```

- [ ] **Step 5: Run tests**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/gym.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add data/gyms/gen1.json src/core/gym.ts test/gym.test.ts
git commit -m "feat: gym data loading, badge system, and victory rewards"
```

---

### Task 8: TUI Renderer

**Files:**
- Create: `src/battle-tui/ansi.ts`
- Create: `src/battle-tui/renderer.ts`

- [ ] **Step 1: Create ANSI utility module**

```ts
// src/battle-tui/ansi.ts
export const ESC = '\x1b';
export const RESET = `${ESC}[0m`;
export const BOLD = `${ESC}[1m`;
export const DIM = `${ESC}[2m`;

export const CLEAR_SCREEN = `${ESC}[2J`;
export const CURSOR_HOME = `${ESC}[H`;
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;

export function moveTo(row: number, col: number): string {
  return `${ESC}[${row};${col}H`;
}

export function fg256(code: number): string {
  return `${ESC}[38;5;${code}m`;
}

export function bg256(code: number): string {
  return `${ESC}[48;5;${code}m`;
}

export function fgRgb(r: number, g: number, b: number): string {
  return `${ESC}[38;2;${r};${g};${b}m`;
}

const TYPE_COLORS: Record<string, number> = {
  normal: 252, fire: 202, water: 33, electric: 226, grass: 34,
  ice: 51, fighting: 124, poison: 129, ground: 172, flying: 117,
  psychic: 198, bug: 106, rock: 137, ghost: 96, dragon: 57,
  dark: 240, steel: 248, fairy: 213,
};

export function typeColor(type: string): number {
  return TYPE_COLORS[type] ?? 252;
}

/** Render an HP bar with color gradient. */
export function renderHpBar(current: number, max: number, width: number = 20): string {
  const ratio = Math.max(0, current / max);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  // Color: green > 50%, yellow > 20%, red <= 20%
  let color: number;
  if (ratio > 0.5) color = 34;      // green
  else if (ratio > 0.2) color = 226; // yellow
  else color = 196;                   // red

  return `${fg256(color)}${'█'.repeat(filled)}${fg256(240)}${'░'.repeat(empty)}${RESET}`;
}

/** Draw a horizontal line. */
export function hLine(width: number, char: string = '─'): string {
  return char.repeat(width);
}

/** Center text within a given width. */
export function center(text: string, width: number): string {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, Math.floor((width - stripped.length) / 2));
  return ' '.repeat(pad) + text;
}
```

- [ ] **Step 2: Create battle screen renderer**

```ts
// src/battle-tui/renderer.ts
import { RESET, BOLD, DIM, CLEAR_SCREEN, CURSOR_HOME, HIDE_CURSOR, moveTo, fg256, renderHpBar, hLine, center, typeColor } from './ansi.js';
import type { BattleState, BattlePokemon, BattleMove, GymData } from '../core/types.js';
import { getActivePokemon } from '../core/turn-battle.js';

const WIDTH = 50;

function pokemonLine(poke: BattlePokemon, align: 'left' | 'right'): string {
  const name = `${poke.displayName} Lv.${poke.level}`;
  const hp = renderHpBar(poke.currentHp, poke.maxHp, 16);
  const hpText = `${DIM}${poke.currentHp}/${poke.maxHp}${RESET}`;
  if (align === 'left') {
    return `  ${name}  ${hp} ${hpText}`;
  }
  return `          ${name}  ${hp} ${hpText}`;
}

function moveOption(move: BattleMove, index: number): string {
  const color = fg256(typeColor(move.data.type));
  const pp = move.currentPp > 0 ? `${DIM}${move.currentPp}/${move.data.pp}${RESET}` : `${fg256(196)}0/${move.data.pp}${RESET}`;
  return `${color}${index + 1}.${move.data.nameKo}${RESET} ${pp}`;
}

export function renderBattleScreen(state: BattleState, gym: GymData | null, recentMessages: string[]): string {
  const lines: string[] = [];
  const playerPoke = getActivePokemon(state.player);
  const opponentPoke = getActivePokemon(state.opponent);

  // Header
  const headerLine = '═'.repeat(WIDTH);
  lines.push(headerLine);
  if (gym) {
    lines.push(center(`${BOLD}${gym.leaderKo}의 체육관 — ${fg256(typeColor(gym.type))}${gym.type}${RESET}${BOLD} 타입 전문${RESET}`, WIDTH));
  } else {
    lines.push(center(`${BOLD}배틀${RESET}`, WIDTH));
  }
  lines.push(headerLine);
  lines.push('');

  // Opponent pokemon (top-left)
  lines.push(pokemonLine(opponentPoke, 'left'));
  lines.push('');

  // Player pokemon (bottom-right, indented)
  lines.push(pokemonLine(playerPoke, 'right'));
  lines.push('');

  // Battle log (last 2 messages)
  lines.push(hLine(WIDTH, '─'));
  const msgs = recentMessages.slice(-2);
  for (const msg of msgs) {
    lines.push(`  ${msg}`);
  }
  if (msgs.length < 2) lines.push('');
  lines.push(hLine(WIDTH, '─'));

  // Move menu
  if (state.phase === 'select_action') {
    const m = playerPoke.moves;
    const row1 = `  ${m[0] ? moveOption(m[0], 0) : ''}     ${m[1] ? moveOption(m[1], 1) : ''}`;
    const row2 = `  ${m[2] ? moveOption(m[2], 2) : ''}     ${m[3] ? moveOption(m[3], 3) : ''}`;
    lines.push(row1);
    lines.push(row2);
    lines.push(`          ${DIM}5.교체    6.항복${RESET}`);
  } else if (state.phase === 'fainted_switch') {
    lines.push(`  ${BOLD}교체할 포켓몬을 선택하세요:${RESET}`);
    state.player.pokemon.forEach((p, i) => {
      if (!p.fainted) {
        lines.push(`  ${i + 1}. ${p.displayName} Lv.${p.level} HP:${p.currentHp}/${p.maxHp}`);
      }
    });
  }

  lines.push('═'.repeat(WIDTH));

  return CLEAR_SCREEN + CURSOR_HOME + HIDE_CURSOR + lines.join('\n');
}

export function renderSurrenderConfirm(): string {
  return `\n  ${BOLD}정말 항복하시겠습니까?${RESET}\n  1. 예    2. 아니오\n`;
}

export function renderBattleEnd(state: BattleState, gym: GymData | null): string {
  const lines: string[] = [];
  if (state.winner === 'player') {
    lines.push('');
    if (gym) {
      lines.push(`  ${BOLD}${gym.leaderKo}에게 승리했다!${RESET}`);
      lines.push(`  ${fg256(226)}${gym.badgeKo}${RESET}을(를) 획득했다!`);
    } else {
      lines.push(`  ${BOLD}승리!${RESET}`);
    }
  } else {
    lines.push('');
    lines.push(`  ${DIM}패배했다...${RESET}`);
  }
  lines.push('');
  lines.push(`  ${DIM}아무 키나 눌러서 나가기${RESET}`);
  return lines.join('\n');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/battle-tui/ansi.ts src/battle-tui/renderer.ts
git commit -m "feat: TUI battle screen renderer with ANSI art"
```

---

### Task 9: TUI Input & Game Loop

**Files:**
- Create: `src/battle-tui/input.ts`
- Create: `src/battle-tui/game-loop.ts`
- Create: `src/battle-tui/index.ts`

- [ ] **Step 1: Create input handler**

```ts
// src/battle-tui/input.ts
import { SHOW_CURSOR } from './ansi.js';

export type KeyHandler = (key: string) => void;

let handler: KeyHandler | null = null;

export function startInput(onKey: KeyHandler): void {
  handler = onKey;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data: string) => {
    // Ctrl+C to force quit
    if (data === '\x03') {
      process.stdout.write(SHOW_CURSOR);
      process.exit(0);
    }
    handler?.(data);
  });
}

export function stopInput(): void {
  handler = null;
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write(SHOW_CURSOR);
}
```

- [ ] **Step 2: Create game loop**

```ts
// src/battle-tui/game-loop.ts
import { renderBattleScreen, renderSurrenderConfirm, renderBattleEnd } from './renderer.js';
import { createBattlePokemon, createBattleState, resolveTurn, getActivePokemon, hasAlivePokemon } from '../core/turn-battle.js';
import { selectAiAction } from '../core/gym-ai.js';
import { getMoveData } from '../core/moves.js';
import { startInput, stopInput } from './input.js';
import type { BattleState, BattlePokemon, TurnAction, GymData, MoveData } from '../core/types.js';

type GamePhase = 'action_select' | 'surrender_confirm' | 'switch_select' | 'animating' | 'battle_over';

interface GameLoop {
  battleState: BattleState;
  gym: GymData | null;
  phase: GamePhase;
  recentMessages: string[];
  onComplete: (result: { winner: 'player' | 'opponent'; turnsPlayed: number }) => void;
}

function render(game: GameLoop): void {
  let screen = renderBattleScreen(game.battleState, game.gym, game.recentMessages);
  if (game.phase === 'surrender_confirm') {
    screen += renderSurrenderConfirm();
  } else if (game.phase === 'battle_over') {
    screen += renderBattleEnd(game.battleState, game.gym);
  }
  process.stdout.write(screen);
}

function handleActionKey(game: GameLoop, key: string): void {
  const player = getActivePokemon(game.battleState.player);
  const num = parseInt(key);
  if (isNaN(num) || num < 1 || num > 6) return;

  let playerAction: TurnAction;

  if (num >= 1 && num <= 4) {
    const move = player.moves[num - 1];
    if (!move || move.currentPp <= 0) return; // ignore invalid/empty moves
    playerAction = { type: 'move', moveIndex: num - 1 };
  } else if (num === 5) {
    // Switch — show switch menu
    const alive = game.battleState.player.pokemon.filter((p, i) => !p.fainted && i !== game.battleState.player.activeIndex);
    if (alive.length === 0) return;
    game.phase = 'switch_select';
    render(game);
    return;
  } else if (num === 6) {
    game.phase = 'surrender_confirm';
    render(game);
    return;
  } else {
    return;
  }

  // AI selects action
  const opponent = getActivePokemon(game.battleState.opponent);
  const aiAction = selectAiAction(opponent, player);

  // Resolve turn
  const result = resolveTurn(game.battleState, playerAction, aiAction);
  game.recentMessages = result.messages;

  // Handle fainted opponent — AI auto-switches
  if (result.opponentFainted && hasAlivePokemon(game.battleState.opponent)) {
    const nextIdx = game.battleState.opponent.pokemon.findIndex(p => !p.fainted);
    if (nextIdx >= 0) game.battleState.opponent.activeIndex = nextIdx;
    game.battleState.phase = 'select_action';
  }

  // Check battle end
  if (game.battleState.phase === 'battle_end') {
    game.phase = 'battle_over';
  } else if (game.battleState.phase === 'fainted_switch') {
    game.phase = 'switch_select';
  } else {
    game.phase = 'action_select';
  }

  render(game);
}

function handleSurrenderKey(game: GameLoop, key: string): void {
  if (key === '1') {
    resolveTurn(game.battleState, { type: 'surrender' }, { type: 'move', moveIndex: 0 });
    game.recentMessages = ['항복했다...'];
    game.phase = 'battle_over';
  } else if (key === '2') {
    game.phase = 'action_select';
  }
  render(game);
}

function handleSwitchKey(game: GameLoop, key: string): void {
  const num = parseInt(key);
  if (isNaN(num) || num < 1 || num > game.battleState.player.pokemon.length) return;
  const idx = num - 1;
  const target = game.battleState.player.pokemon[idx];
  if (target.fainted || idx === game.battleState.player.activeIndex) return;

  if (game.battleState.phase === 'fainted_switch') {
    // Forced switch — no AI turn
    game.battleState.player.activeIndex = idx;
    game.battleState.phase = 'select_action';
    game.recentMessages = [`${target.displayName}(으)로 교체!`];
    game.phase = 'action_select';
  } else {
    // Voluntary switch — AI gets a turn
    const playerAction: TurnAction = { type: 'switch', pokemonIndex: idx };
    const opponent = getActivePokemon(game.battleState.opponent);
    const player = getActivePokemon(game.battleState.player);
    const aiAction = selectAiAction(opponent, player);
    const result = resolveTurn(game.battleState, playerAction, aiAction);
    game.recentMessages = result.messages;
    game.phase = game.battleState.phase === 'battle_end' ? 'battle_over' : 'action_select';
  }

  render(game);
}

export function startGameLoop(
  playerTeam: BattlePokemon[],
  opponentTeam: BattlePokemon[],
  gym: GymData | null,
  onComplete: (result: { winner: 'player' | 'opponent'; turnsPlayed: number }) => void,
): void {
  const battleState = createBattleState(playerTeam, opponentTeam);
  const game: GameLoop = {
    battleState,
    gym,
    phase: 'action_select',
    recentMessages: gym
      ? [`${gym.leaderKo}이(가) 승부를 걸어왔다!`]
      : ['배틀 시작!'],
    onComplete,
  };

  render(game);

  startInput((key: string) => {
    if (game.phase === 'battle_over') {
      stopInput();
      onComplete({ winner: battleState.winner!, turnsPlayed: battleState.turn });
      return;
    }

    switch (game.phase) {
      case 'action_select': handleActionKey(game, key); break;
      case 'surrender_confirm': handleSurrenderKey(game, key); break;
      case 'switch_select': handleSwitchKey(game, key); break;
    }
  });
}
```

- [ ] **Step 3: Create TUI entry point**

```ts
// src/battle-tui/index.ts
#!/usr/bin/env node
/**
 * Tokenmon Battle TUI — standalone process.
 * Spawned by Claude Code /gym skill. Reads state, runs battle, writes results.
 * Usage: node battle-tui/index.js --gym <id> --gen <generation>
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SHOW_CURSOR } from './ansi.js';
import { startGameLoop } from './game-loop.js';
import { createBattlePokemon } from '../core/turn-battle.js';
import { getGymById } from '../core/gym.js';
import { getMoveData, assignDefaultMoves } from '../core/moves.js';
import { awardGymVictory } from '../core/gym.js';
import { getPokemonName } from '../core/pokemon-data.js';
import type { State, Config, PokemonData, MoveData } from '../core/types.js';

// Parse args
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const gymId = parseInt(getArg('gym') || '1');
const generation = getArg('gen') || 'gen1';
const stateDir = getArg('state-dir') || join(process.env.HOME || '~', '.claude', 'tokenmon');

// Load state and config
const genDir = join(stateDir, 'gen', generation);
const state: State = JSON.parse(readFileSync(join(genDir, 'state.json'), 'utf-8'));
const config: Config = JSON.parse(readFileSync(join(genDir, 'config.json'), 'utf-8'));

// Load pokemon DB
import { loadPokemonDB } from '../core/pokemon-data.js';
const db = loadPokemonDB(generation);

// Get gym data
const gym = getGymById(generation, gymId);
if (!gym) {
  console.error(`Gym ${gymId} not found for ${generation}`);
  process.exit(1);
}

// Build player team from party
function buildPlayerTeam() {
  return config.party
    .map(name => {
      const pokeState = state.pokemon[name];
      if (!pokeState) return null;
      const pokeData = db.pokemon[name];
      if (!pokeData) return null;

      // Ensure pokemon has moves
      const moveIds = pokeState.moves ?? assignDefaultMoves(pokeData.id, pokeState.level);
      const moves: MoveData[] = moveIds.map(id => getMoveData(id)).filter(Boolean) as MoveData[];

      return createBattlePokemon({
        id: pokeData.id,
        types: pokeData.types,
        level: pokeState.level,
        baseStats: pokeData.base_stats,
        displayName: getPokemonName(name),
      }, moves);
    })
    .filter(Boolean) as ReturnType<typeof createBattlePokemon>[];
}

// Build opponent team from gym data
function buildGymTeam() {
  return gym!.team.map(gp => {
    const pokeData = db.pokemon[String(gp.species)];
    if (!pokeData) return null;
    const moves: MoveData[] = gp.moves.map(id => getMoveData(id)).filter(Boolean) as MoveData[];

    return createBattlePokemon({
      id: gp.species,
      types: pokeData.types,
      level: gp.level,
      baseStats: pokeData.base_stats,
      displayName: getPokemonName(String(gp.species)),
    }, moves);
  }).filter(Boolean) as ReturnType<typeof createBattlePokemon>[];
}

const playerTeam = buildPlayerTeam();
const gymTeam = buildGymTeam();

if (playerTeam.length === 0) {
  console.error('No valid pokemon in party');
  process.exit(1);
}

if (gymTeam.length === 0) {
  console.error('Failed to build gym team');
  process.exit(1);
}

// Start battle
startGameLoop(playerTeam, gymTeam, gym, (result) => {
  process.stdout.write(SHOW_CURSOR);

  // Apply results to state
  if (result.winner === 'player') {
    const victoryResult = awardGymVictory(state, gym!, config.party);
    console.log(`\nXP +${victoryResult.xpAwarded}`);
    if (victoryResult.badgeEarned) {
      console.log(`배지 획득: ${gym!.badgeKo}`);
    }
  }

  // Save state
  writeFileSync(join(genDir, 'state.json'), JSON.stringify(state, null, 2));

  // Output result as JSON for the hook to parse
  const output = {
    winner: result.winner,
    turnsPlayed: result.turnsPlayed,
    gymId: gym!.id,
    badgeEarned: result.winner === 'player',
  };
  console.log(`\n__BATTLE_RESULT__${JSON.stringify(output)}`);

  process.exit(0);
});
```

- [ ] **Step 4: Test TUI manually**

Run: `cd /home/minsiwon00/claude-battle && npx tsx src/battle-tui/index.ts --gym 1 --gen gen1`
Expected: Battle TUI renders, responds to key presses 1-6.

- [ ] **Step 5: Commit**

```bash
git add src/battle-tui/
git commit -m "feat: battle TUI with input handling, game loop, and state integration"
```

---

### Task 10: Move Learning System

**Files:**
- Create: `src/core/move-learning.ts`
- Modify: `src/hooks/stop.ts`
- Test: `test/move-learning.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/move-learning.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { checkMoveLearn, initializeMoves } from '../src/core/move-learning.js';

describe('move learning', () => {
  it('learns new move on level up', () => {
    // Assuming pikachu (25) has a move at level 10
    const result = checkMoveLearn(25, 9, 10, [33]); // had tackle, leveled from 9 to 10
    // Should either learn a new move or not, depending on data
    assert.ok(Array.isArray(result.moves));
    assert.ok(result.moves.length >= 1);
    assert.ok(result.moves.length <= 4);
  });

  it('replaces weakest move when at 4 moves', () => {
    const result = checkMoveLearn(25, 1, 50, [33, 10, 98, 84]); // 4 moves, high level
    assert.ok(result.moves.length <= 4);
  });

  it('initializeMoves assigns defaults for pokemon without moves', () => {
    const moves = initializeMoves(25, 15); // pikachu at level 15
    assert.ok(moves.length >= 1);
    assert.ok(moves.length <= 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/move-learning.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement move-learning.ts**

```ts
// src/core/move-learning.ts
import { getPokemonMovePool, getMoveData, assignDefaultMoves } from './moves.js';

interface MoveLearnResult {
  moves: number[];
  learned: number | null;  // newly learned move ID, or null
  replaced: number | null; // replaced move ID, or null
}

/**
 * Check if a pokemon should learn a new move after leveling up.
 * Returns updated move list and what changed.
 */
export function checkMoveLearn(
  pokemonId: number,
  oldLevel: number,
  newLevel: number,
  currentMoves: number[],
): MoveLearnResult {
  const pool = getPokemonMovePool(pokemonId);
  const moves = [...currentMoves];
  let learned: number | null = null;
  let replaced: number | null = null;

  // Find moves learned between oldLevel+1 and newLevel
  const newMoves = pool.filter(m => m.learnLevel > oldLevel && m.learnLevel <= newLevel);

  for (const entry of newMoves) {
    if (moves.includes(entry.moveId)) continue; // already known

    if (moves.length < 4) {
      moves.push(entry.moveId);
      learned = entry.moveId;
    } else {
      // Replace the weakest move
      const movesDB = moves.map(id => ({ id, power: getMoveData(id)?.power ?? 0 }));
      const newPower = getMoveData(entry.moveId)?.power ?? 0;
      const weakest = movesDB.reduce((min, m) => m.power < min.power ? m : min);

      if (newPower > weakest.power) {
        const idx = moves.indexOf(weakest.id);
        replaced = weakest.id;
        moves[idx] = entry.moveId;
        learned = entry.moveId;
      }
    }
  }

  return { moves, learned, replaced };
}

/**
 * Initialize moves for a pokemon that doesn't have any.
 * Uses assignDefaultMoves from the moves module.
 */
export function initializeMoves(pokemonId: number, level: number): number[] {
  return assignDefaultMoves(pokemonId, level);
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/move-learning.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate with stop.ts hook**

In `src/hooks/stop.ts`, after level-up processing, add move learning check:

```ts
// In the level-up section of stop.ts, after XP is awarded and level is recalculated:
import { checkMoveLearn, initializeMoves } from '../core/move-learning.js';

// After level-up detection for each pokemon:
// if (newLevel > oldLevel) {
//   ... existing evolution check ...
//   
//   // Move learning
//   const currentMoves = pokeState.moves ?? initializeMoves(pokeData.id, oldLevel);
//   const learnResult = checkMoveLearn(pokeData.id, oldLevel, newLevel, currentMoves);
//   pokeState.moves = learnResult.moves;
//   if (learnResult.learned) {
//     const moveName = getMoveData(learnResult.learned)?.nameKo ?? '???';
//     // Add to status line message
//   }
// }
```

The exact integration point depends on the structure of stop.ts. The implementer should read stop.ts, find the level-up section, and add the move learning call after level recalculation.

- [ ] **Step 6: Commit**

```bash
git add src/core/move-learning.ts test/move-learning.test.ts src/hooks/stop.ts
git commit -m "feat: move learning on level-up with auto-replace"
```

---

### Task 11: Skills (/gym and /moves)

**Files:**
- Create: `skills/gym/SKILL.md`
- Create: `skills/moves/SKILL.md`

- [ ] **Step 1: Create /gym skill**

```markdown
<!-- skills/gym/SKILL.md -->
---
description: "Tokenmon gym battle. Challenge gym leaders with your party. Korean: 체육관, 배틀, 도전, gym"
---

Challenge a Tokenmon gym leader in turn-based battle.

## Execute

Determine the generation and gym ID, then launch the battle TUI:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"

# Get active generation
GEN=$(node -e "try{const g=JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(),'.claude/tokenmon/global-config.json'),'utf-8'));console.log(g.active_generation||'gen1')}catch{console.log('gen1')}")

# Default gym ID is next uncleared gym; override with $ARGUMENTS
GYM_ID="${ARGUMENTS:-}"

"$P/bin/tsx-resolve.sh" "$P/src/battle-tui/index.ts" --gym "${GYM_ID:-1}" --gen "$GEN"
```

## Usage

| Command | Description |
|---------|-------------|
| `/gym` | Challenge next uncleared gym |
| `/gym 3` | Challenge gym #3 |
| `/gym list` | Show all gyms and badge status |

If `$ARGUMENTS` is `list`, show gym status instead of launching battle:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/gym-list.ts"
```
```

- [ ] **Step 2: Create /moves skill**

```markdown
<!-- skills/moves/SKILL.md -->
---
description: "Tokenmon move management. View and swap pokemon moves. Korean: 기술, 무브, 스킬, moves"
---

View and manage Tokénmon moves.

## Execute

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/moves.ts" $ARGUMENTS
```

## Usage

| Command | Description |
|---------|-------------|
| `/moves` | Show moves for all party pokemon |
| `/moves <name>` | Show moves for specific pokemon |
| `/moves <name> swap <slot> <moveId>` | Swap a move slot |
| `/moves <name> list` | Show all learnable moves for pokemon |
```

- [ ] **Step 3: Create gym-list CLI**

```ts
// src/cli/gym-list.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadGymData } from '../core/gym.js';
import { readState } from '../core/state.js';

const globalConfig = JSON.parse(readFileSync(
  join(process.env.HOME || '~', '.claude', 'tokenmon', 'global-config.json'), 'utf-8'
).catch(() => '{"active_generation":"gen1"}'));
const gen = globalConfig.active_generation || 'gen1';

const gyms = loadGymData(gen);
const state = readState();
const badges = state.gym_badges ?? [];

console.log(`\n  🏟️  ${gen.toUpperCase()} 체육관\n`);
for (const gym of gyms) {
  const cleared = badges.includes(gym.badge);
  const icon = cleared ? '✅' : '⬜';
  console.log(`  ${icon} ${gym.id}. ${gym.leaderKo} (${gym.type}) — ${gym.badgeKo}`);
}
console.log('');
```

- [ ] **Step 4: Create moves CLI**

```ts
// src/cli/moves.ts
import { readState, readConfig } from '../core/state.js';
import { getMoveData, getPokemonMovePool, assignDefaultMoves } from '../core/moves.js';
import { getPokemonName } from '../core/pokemon-data.js';
import { toBaseId } from '../core/shiny-utils.js';

const state = readState();
const config = readConfig();
const args = process.argv.slice(2);

function showPokemonMoves(name: string) {
  const pokeState = state.pokemon[name];
  if (!pokeState) { console.log(`  ${name} not found`); return; }

  const moveIds = pokeState.moves ?? assignDefaultMoves(pokeState.id, pokeState.level);
  const displayName = getPokemonName(name);

  console.log(`\n  ${displayName} Lv.${pokeState.level}`);
  moveIds.forEach((id, i) => {
    const move = getMoveData(id);
    if (move) {
      console.log(`    ${i + 1}. ${move.nameKo} (${move.type}/${move.category}) 위력:${move.power} PP:${move.pp}`);
    }
  });
}

if (args.length === 0) {
  // Show all party pokemon moves
  for (const name of config.party) {
    showPokemonMoves(name);
  }
} else if (args[0] === 'list' || args[1] === 'list') {
  // Show learnable moves for pokemon
  const name = args[0] === 'list' ? config.party[0] : args[0];
  const pokeState = state.pokemon[name];
  if (pokeState) {
    const pool = getPokemonMovePool(pokeState.id);
    console.log(`\n  ${getPokemonName(name)} learnable moves:`);
    for (const entry of pool) {
      const move = getMoveData(entry.moveId);
      if (move) {
        const known = (pokeState.moves ?? []).includes(entry.moveId) ? ' ✓' : '';
        console.log(`    Lv.${entry.learnLevel}: ${move.nameKo} (${move.type}) 위력:${move.power}${known}`);
      }
    }
  }
} else {
  showPokemonMoves(args[0]);
}
console.log('');
```

- [ ] **Step 5: Commit**

```bash
git add skills/gym/ skills/moves/ src/cli/gym-list.ts src/cli/moves.ts
git commit -m "feat: /gym and /moves skill commands"
```

---

### Task 12: Integration & Verification

**Files:**
- Modify: `hooks/hooks.json` (if needed for /gym process detection)

- [ ] **Step 1: Run full test suite**

Run: `cd /home/minsiwon00/claude-battle && node --import tsx --test test/*.test.ts`
Expected: ALL tests pass, including existing tests (no regressions).

- [ ] **Step 2: Manual integration test**

1. Verify `/moves` shows party pokemon moves
2. Verify `/gym list` shows gym status
3. Verify `/gym 1` launches TUI and battle works end-to-end
4. Verify battle results are saved to state after victory/defeat

- [ ] **Step 3: Verify data integrity**

```bash
# Check moves data exists and is valid
node -e "const m=require('./data/moves.json'); console.log('Moves:', Object.keys(m).length)"
node -e "const p=require('./data/pokemon-moves.json'); console.log('Pokemon with moves:', Object.keys(p).length)"
node -e "const g=require('./data/gyms/gen1.json'); console.log('Gyms:', g.gyms.length)"
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete battle system Phase 1 (moves, engine, TUI, gyms)"
```
