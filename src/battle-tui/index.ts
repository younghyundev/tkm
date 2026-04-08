#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SHOW_CURSOR } from './ansi.js';
import { startGameLoop } from './game-loop.js';
import { createBattlePokemon } from '../core/turn-battle.js';
import { getGymById, awardGymVictory } from '../core/gym.js';
import { getPokemonName, getPokemonDB } from '../core/pokemon-data.js';
import { initLocale } from '../i18n/index.js';
import { readGlobalConfig } from '../core/config.js';
import type { State, Config, MoveData, GymData } from '../core/types.js';

// ── CLI Arg Parsing ──

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const flag = `--${name}`;
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

// ── Fallback Moves ──

function fallbackMoves(types: string[], level: number): MoveData[] {
  return types.map((t, i) => ({
    id: 9000 + i,
    name: `${t}-attack`,
    nameKo: `${t} 공격`,
    nameEn: `${t} Attack`,
    type: t,
    category: 'physical' as const,
    power: Math.min(40 + level, 100),
    accuracy: 100,
    pp: 20,
  }));
}

// ── Move Loading ──

interface MovesDB {
  [id: string]: MoveData;
}

interface PokemonMovesDB {
  [speciesId: string]: { pool: Array<{ moveId: number; learnLevel: number }> };
}

let movesDB: MovesDB | null = null;
let pokemonMovesDB: PokemonMovesDB | null = null;

function loadMovesData(pluginRoot: string): void {
  const movesPath = join(pluginRoot, 'data', 'moves.json');
  const pokemonMovesPath = join(pluginRoot, 'data', 'pokemon-moves.json');

  if (existsSync(movesPath)) {
    try {
      movesDB = JSON.parse(readFileSync(movesPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  if (existsSync(pokemonMovesPath)) {
    try {
      pokemonMovesDB = JSON.parse(readFileSync(pokemonMovesPath, 'utf-8'));
    } catch { /* ignore */ }
  }
}

function getMovesForPokemon(speciesId: number, level: number, types: string[]): MoveData[] {
  if (!movesDB || !pokemonMovesDB) {
    return fallbackMoves(types, level);
  }

  const pool = pokemonMovesDB[String(speciesId)];
  if (!pool || !pool.pool || pool.pool.length === 0) {
    return fallbackMoves(types, level);
  }

  // Get moves learnable at or below current level, sorted by learn level desc
  const learnable = pool.pool
    .filter((entry) => entry.learnLevel <= level)
    .sort((a, b) => b.learnLevel - a.learnLevel);

  const moves: MoveData[] = [];
  const seen = new Set<number>();

  for (const entry of learnable) {
    if (seen.has(entry.moveId)) continue;
    const moveData = movesDB[String(entry.moveId)];
    if (!moveData) continue;
    seen.add(entry.moveId);
    moves.push(moveData);
    if (moves.length >= 4) break;
  }

  // If not enough moves at current level, include from full pool (ignore level req)
  if (moves.length < 2) {
    const allByLevel = [...pool.pool].sort((a, b) => a.learnLevel - b.learnLevel);
    for (const entry of allByLevel) {
      if (seen.has(entry.moveId)) continue;
      const moveData = movesDB[String(entry.moveId)];
      if (!moveData) continue;
      seen.add(entry.moveId);
      moves.push(moveData);
      if (moves.length >= 4) break;
    }
  }

  return moves.length > 0 ? moves : fallbackMoves(types, level);
}

// ── Pokemon Name Resolution (cross-gen) ──

function speciesIdToGen(id: number): string {
  if (id <= 151) return 'gen1';
  if (id <= 251) return 'gen2';
  if (id <= 386) return 'gen3';
  if (id <= 493) return 'gen4';
  if (id <= 649) return 'gen5';
  if (id <= 721) return 'gen6';
  if (id <= 809) return 'gen7';
  if (id <= 905) return 'gen8';
  return 'gen9';
}

function getDisplayName(speciesId: number, currentGen: string): string {
  // Try current gen first, then the species' native gen
  let name = getPokemonName(speciesId, currentGen);
  if (name === String(speciesId)) {
    name = getPokemonName(speciesId, speciesIdToGen(speciesId));
  }
  return name;
}

// ── Main ──

function main(): void {
  // Initialize locale so getPokemonName returns Korean names when language is 'ko'
  const globalConfig = readGlobalConfig();
  initLocale(globalConfig.language);

  const gymIdStr = getArg('gym');
  const generation = getArg('gen') || 'gen4';
  const stateDir = getArg('state-dir') || join(process.env.HOME || '', '.claude', 'tokenmon');
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, '..', '..');

  if (!gymIdStr) {
    console.error('Usage: battle-tui --gym <id> [--gen <generation>] [--state-dir <path>]');
    process.exit(1);
  }

  const gymId = parseInt(gymIdStr, 10);

  // Load state & config
  const genDir = join(stateDir, generation);
  const statePath = join(genDir, 'state.json');
  const configPath = join(genDir, 'config.json');

  if (!existsSync(statePath) || !existsSync(configPath)) {
    console.error(`State or config not found in ${genDir}`);
    process.exit(1);
  }

  const state: State = JSON.parse(readFileSync(statePath, 'utf-8'));
  const config: Config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Load pokemon DB
  let db: ReturnType<typeof getPokemonDB>;
  try {
    db = getPokemonDB(generation);
  } catch {
    console.error(`Failed to load pokemon DB for ${generation}`);
    process.exit(1);
  }

  // Get gym data
  const gym = getGymById(generation, gymId);
  if (!gym) {
    console.error(`Gym ${gymId} not found for ${generation}`);
    process.exit(1);
  }

  // Load move data (best effort)
  loadMovesData(pluginRoot);

  // Build player team from config.party + state.pokemon
  const playerTeam = config.party
    .filter((name) => state.pokemon[name])
    .map((name) => {
      const pState = state.pokemon[name];
      const pData = db.pokemon[String(pState.id)];
      if (!pData) {
        // Fallback for missing pokemon data
        const moves = fallbackMoves(['normal'], pState.level);
        return createBattlePokemon(
          { id: pState.id, types: ['normal'], level: pState.level, baseStats: { hp: 50, attack: 50, defense: 50, speed: 50 } },
          moves,
        );
      }
      const displayName = pState.nickname || getPokemonName(pState.id, generation);
      const moves = getMovesForPokemon(pState.id, pState.level, pData.types);
      return createBattlePokemon(
        { id: pState.id, types: pData.types, level: pState.level, baseStats: pData.base_stats, displayName },
        moves,
      );
    });

  if (playerTeam.length === 0) {
    console.error('No valid pokemon in party');
    process.exit(1);
  }

  // Build gym team
  const gymTeam = gym.team.map((gp) => {
    const pData = db.pokemon[String(gp.species)];
    const types = pData?.types ?? ['normal'];
    const baseStats = pData?.base_stats ?? { hp: 50, attack: 50, defense: 50, speed: 50 };
    const displayName = getDisplayName(gp.species, generation);

    // Try to load specific gym moves first, then fall back
    let moves: MoveData[];
    if (gp.moves && gp.moves.length > 0 && movesDB) {
      moves = gp.moves
        .map((mId) => movesDB![String(mId)])
        .filter((m): m is MoveData => !!m);
      if (moves.length === 0) {
        moves = getMovesForPokemon(gp.species, gp.level, types);
      }
    } else {
      moves = getMovesForPokemon(gp.species, gp.level, types);
    }

    return createBattlePokemon(
      { id: gp.species, types, level: gp.level, baseStats, displayName },
      moves,
    );
  });

  if (gymTeam.length === 0) {
    console.error('Gym has no pokemon');
    process.exit(1);
  }

  // Graceful exit handler
  process.on('exit', () => {
    process.stdout.write(SHOW_CURSOR);
  });

  // Start the game loop
  startGameLoop(playerTeam, gymTeam, gym, (result) => {
    // Award victory if player won
    if (result.winner === 'player') {
      const participatingPokemon = config.party.filter((name) => state.pokemon[name]);
      const victoryResult = awardGymVictory(state, gym, participatingPokemon);

      // Save updated state
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

      const output = {
        winner: result.winner,
        turnsPlayed: result.turnsPlayed,
        gym: gym.id,
        badge: gym.badge,
        badgeKo: gym.badgeKo,
        badgeEarned: victoryResult.badgeEarned,
        xpAwarded: victoryResult.xpAwarded,
      };

      console.log(`\n__BATTLE_RESULT__${JSON.stringify(output)}`);
    } else {
      // Defeat — save state (battle count etc. may matter)
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

      const output = {
        winner: result.winner,
        turnsPlayed: result.turnsPlayed,
        gym: gym.id,
        badge: gym.badge,
        badgeKo: gym.badgeKo,
        badgeEarned: false,
        xpAwarded: 0,
      };

      console.log(`\n__BATTLE_RESULT__${JSON.stringify(output)}`);
    }

    process.exit(0);
  });
}

main();
