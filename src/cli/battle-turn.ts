#!/usr/bin/env -S npx tsx
/**
 * Battle Turn CLI — conversation-based gym battle via temp state file.
 *
 * Usage:
 *   npx tsx src/cli/battle-turn.ts --init --gym 1 --gen gen4
 *   npx tsx src/cli/battle-turn.ts --action 1        # use move 1
 *   npx tsx src/cli/battle-turn.ts --action 5        # switch menu
 *   npx tsx src/cli/battle-turn.ts --action switch:2 # switch to index 2
 *   npx tsx src/cli/battle-turn.ts --action 6        # surrender
 *   npx tsx src/cli/battle-turn.ts --end             # clean up
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { createBattlePokemon, createBattleState, resolveTurn, getActivePokemon, hasAlivePokemon } from '../core/turn-battle.js';
import { selectAiAction } from '../core/gym-ai.js';
import { getGymById, awardGymVictory } from '../core/gym.js';
import { getPokemonDB, getPokemonName, speciesIdToGeneration } from '../core/pokemon-data.js';
import { getActiveGeneration } from '../core/paths.js';
import { initLocale } from '../i18n/index.js';
import { readGlobalConfig } from '../core/config.js';
import { withLockRetry } from '../core/lock.js';
import { readState, writeState } from '../core/state.js';
import type { State, Config, MoveData, GymData, BattleState, BattlePokemon, TurnAction } from '../core/types.js';

// ── Constants ──

const STATE_DIR = join(process.env.HOME || '', '.claude', 'tokenmon');
const BATTLE_STATE_PATH = join(STATE_DIR, 'battle-state.json');

// ── CLI Arg Parsing ──

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const flag = `--${name}`;
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

// ── Pokemon Name Resolution (cross-gen) ──

function getDisplayName(speciesId: number, currentGen: string): string {
  let name = getPokemonName(speciesId, currentGen);
  if (name === String(speciesId)) {
    name = getPokemonName(speciesId, speciesIdToGeneration(speciesId));
  }
  return name;
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

  // Minimum 2 moves guarantee — pull from full pool if needed
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

// ── Battle State File ──

interface LastHit {
  target: 'player' | 'opponent';
  damage: number;
  effectiveness: 'super' | 'normal' | 'not_very' | 'immune';
}

interface BattleStateFile {
  battleState: BattleState;
  gym: GymData;
  generation: string;
  stateDir: string;
  playerPartyNames: string[];
  lastHit?: LastHit | null;
  sessionId?: string;
}

function readBattleState(): BattleStateFile | null {
  if (!existsSync(BATTLE_STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BATTLE_STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeBattleState(bsf: BattleStateFile): void {
  const dir = dirname(BATTLE_STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = BATTLE_STATE_PATH + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(bsf, null, 2), 'utf-8');
  renameSync(tmpPath, BATTLE_STATE_PATH);
}

function deleteBattleState(): void {
  if (existsSync(BATTLE_STATE_PATH)) {
    try { unlinkSync(BATTLE_STATE_PATH); } catch { /* ignore */ }
  }
}

// ── Output Helpers ──

interface PokemonInfo {
  name: string;
  species: number;
  level: number;
  hp: number;
  maxHp: number;
}

function pokemonInfo(p: BattlePokemon): PokemonInfo {
  return {
    name: p.displayName,
    species: p.id,
    level: p.level,
    hp: p.currentHp,
    maxHp: p.maxHp,
  };
}

function buildMenu(player: BattlePokemon): string {
  const moveNames = player.moves
    .map((m, i) => `${i + 1}.${m.data.nameKo}`)
    .join(' ');
  return `${moveNames}\n5.교체 6.항복`;
}

function output(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data));
}

function buildQuestionContext(player: BattlePokemon, opponent: BattlePokemon): string {
  return `⚔️ vs ${opponent.displayName} Lv.${opponent.level} HP:${opponent.currentHp}/${opponent.maxHp} | ${player.displayName} Lv.${player.level} HP:${player.currentHp}/${player.maxHp}`;
}

function detectLastHit(
  messages: string[],
  playerHpBefore: number,
  opponentHpBefore: number,
  playerHpAfter: number,
  opponentHpAfter: number,
): LastHit | null {
  // Determine effectiveness from messages
  let effectiveness: LastHit['effectiveness'] = 'normal';
  for (const msg of messages) {
    if (msg.includes('효과가 굉장했다')) { effectiveness = 'super'; break; }
    if (msg.includes('효과가 별로인')) { effectiveness = 'not_very'; break; }
    if (msg.includes('효과가 없는')) { effectiveness = 'immune'; break; }
  }

  const opponentDamage = opponentHpBefore - opponentHpAfter;
  const playerDamage = playerHpBefore - playerHpAfter;

  // Return the most recent significant hit (prefer opponent taking damage = player attacked)
  if (opponentDamage > 0) {
    return { target: 'opponent', damage: opponentDamage, effectiveness };
  }
  if (playerDamage > 0) {
    return { target: 'player', damage: playerDamage, effectiveness };
  }
  return null;
}

// ── Init Flow ──

function handleInit(): void {
  const gymIdStr = getArg('gym');
  const generation = getArg('gen') || getActiveGeneration();
  const stateDir = getArg('state-dir') || STATE_DIR;
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, '..', '..');

  if (!gymIdStr) {
    output({ status: 'error', messages: ['--gym <id> is required'] });
    process.exit(1);
  }

  const gymId = parseInt(gymIdStr, 10);

  // Load state & config
  const genDir = join(stateDir, generation);
  const statePath = join(genDir, 'state.json');
  const configPath = join(genDir, 'config.json');

  if (!existsSync(statePath) || !existsSync(configPath)) {
    output({ status: 'error', messages: [`State or config not found in ${genDir}`] });
    process.exit(1);
  }

  let state: State;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch (err) {
    output({ status: 'error', messages: [`Failed to parse state: ${statePath}`] });
    process.exit(1);
  }

  let config: Config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    output({ status: 'error', messages: [`Failed to parse config: ${configPath}`] });
    process.exit(1);
  }

  // Load pokemon DB
  let db: ReturnType<typeof getPokemonDB>;
  try {
    db = getPokemonDB(generation);
  } catch {
    output({ status: 'error', messages: [`Failed to load pokemon DB for ${generation}`] });
    process.exit(1);
  }

  // Get gym data
  const gym = getGymById(generation, gymId);
  if (!gym) {
    output({ status: 'error', messages: [`Gym ${gymId} not found for ${generation}`] });
    process.exit(1);
  }

  // Load move data
  loadMovesData(pluginRoot);

  // Build player team from config.party + state.pokemon
  const playerPartyNames: string[] = [];
  const playerTeam = config.party
    .filter((name) => state.pokemon[name])
    .map((name) => {
      playerPartyNames.push(name);
      const pState = state.pokemon[name];
      const pData = db.pokemon[String(pState.id)];
      if (!pData) {
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
    output({ status: 'error', messages: ['No valid pokemon in party'] });
    process.exit(1);
  }

  // Build gym team
  const gymTeam = gym.team.map((gp) => {
    const pData = db.pokemon[String(gp.species)];
    const types = pData?.types ?? ['normal'];
    const baseStats = pData?.base_stats ?? { hp: 50, attack: 50, defense: 50, speed: 50 };
    const displayName = getDisplayName(gp.species, generation);

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
    output({ status: 'error', messages: ['Gym has no pokemon'] });
    process.exit(1);
  }

  // Create battle state
  const battleState = createBattleState(playerTeam, gymTeam);

  // Save
  const bsf: BattleStateFile = {
    battleState,
    gym,
    generation,
    stateDir,
    playerPartyNames,
    sessionId: process.env.CLAUDE_SESSION_ID || process.pid.toString(),
  };
  writeBattleState(bsf);

  // Output initial state
  const playerActive = getActivePokemon(battleState.player);
  const opponentActive = getActivePokemon(battleState.opponent);

  output({
    status: 'ongoing',
    messages: [
      `${gym.leaderKo}이(가) 승부를 걸어왔다!`,
      `${gym.leaderKo}은(는) ${opponentActive.displayName}을(를) 내보냈다!`,
      `가라, ${playerActive.displayName}!`,
    ],
    menu: buildMenu(playerActive),
    opponent: pokemonInfo(opponentActive),
    player: pokemonInfo(playerActive),
    badge: null,
    questionContext: buildQuestionContext(playerActive, opponentActive),
  });
}

// ── Action Flow ──

function handleAction(): void {
  const actionStr = getArg('action');
  if (!actionStr) {
    output({ status: 'error', messages: ['--action <N|switch:N> is required'] });
    process.exit(1);
  }

  const bsf = readBattleState();
  if (!bsf) {
    output({ status: 'error', messages: ['No active battle. Use --init to start one.'] });
    process.exit(1);
  }

  if (bsf.sessionId && bsf.sessionId !== (process.env.CLAUDE_SESSION_ID || process.pid.toString())) {
    output({ status: 'error', messages: ['다른 세션의 배틀이 진행 중입니다.'] });
    process.exit(1);
  }

  const { battleState, gym, generation, stateDir, playerPartyNames } = bsf;

  // Parse action
  let playerAction: TurnAction;

  if (actionStr.startsWith('switch:')) {
    // switch:N — switch to pokemon index N
    const targetIndex = parseInt(actionStr.split(':')[1], 10);
    const targetPokemon = battleState.player.pokemon[targetIndex];
    if (!targetPokemon || targetPokemon.fainted || targetIndex === battleState.player.activeIndex) {
      output({
        status: 'error',
        messages: ['Invalid switch target.'],
      });
      process.exit(1);
    }
    playerAction = { type: 'switch', pokemonIndex: targetIndex };
  } else {
    const actionNum = parseInt(actionStr, 10);

    if (actionNum >= 1 && actionNum <= 4) {
      // Move 1-4
      const moveIndex = actionNum - 1;
      const playerActive = getActivePokemon(battleState.player);
      if (moveIndex >= playerActive.moves.length) {
        output({ status: 'error', messages: [`Move ${actionNum} does not exist.`] });
        process.exit(1);
      }
      playerAction = { type: 'move', moveIndex };
    } else if (actionNum === 5) {
      // Switch menu
      return handleSwitchMenu(battleState);
    } else if (actionNum === 6) {
      // Surrender
      playerAction = { type: 'surrender' };
    } else {
      output({ status: 'error', messages: [`Invalid action: ${actionStr}`] });
      process.exit(1);
    }
  }

  // Get AI action
  const playerActive = getActivePokemon(battleState.player);
  const opponentActive = getActivePokemon(battleState.opponent);

  // Record HP before turn for lastHit detection
  const playerHpBefore = playerActive.currentHp;
  const opponentHpBefore = opponentActive.currentHp;

  let aiAction: TurnAction;
  if (playerAction.type === 'surrender') {
    aiAction = { type: 'move', moveIndex: 0 };
  } else {
    aiAction = selectAiAction(opponentActive, playerActive);
  }

  // Resolve turn
  const turnResult = resolveTurn(battleState, playerAction, aiAction);
  const messages = [...turnResult.messages];

  // Detect lastHit from HP changes
  const lastHit = detectLastHit(
    messages,
    playerHpBefore,
    opponentHpBefore,
    playerActive.currentHp,
    opponentActive.currentHp,
  );
  bsf.lastHit = lastHit;

  // Post-turn handling
  if (battleState.phase === 'battle_end') {
    if (battleState.winner === 'player') {
      return handleVictory(bsf, messages);
    } else {
      return handleDefeat(bsf, messages);
    }
  }

  // Opponent fainted but has more — auto-switch AI
  if (turnResult.opponentFainted && hasAlivePokemon(battleState.opponent)) {
    const nextIdx = battleState.opponent.pokemon.findIndex(
      (p, i) => i !== battleState.opponent.activeIndex && !p.fainted,
    );
    if (nextIdx !== -1) {
      const oldName = getActivePokemon(battleState.opponent).displayName;
      battleState.opponent.activeIndex = nextIdx;
      const newActive = getActivePokemon(battleState.opponent);
      messages.push(`${gym.leaderKo}은(는) ${newActive.displayName}을(를) 내보냈다!`);
    }
  }

  // Player fainted + has more → fainted_switch
  if (battleState.phase === 'fainted_switch') {
    writeBattleState(bsf);
    return handleFaintedSwitch(battleState, messages);
  }

  // Normal continuation
  writeBattleState(bsf);

  const currentPlayer = getActivePokemon(battleState.player);
  const currentOpponent = getActivePokemon(battleState.opponent);

  output({
    status: 'ongoing',
    messages,
    menu: buildMenu(currentPlayer),
    opponent: pokemonInfo(currentOpponent),
    player: pokemonInfo(currentPlayer),
    badge: null,
    lastHit: lastHit ?? undefined,
    questionContext: buildQuestionContext(currentPlayer, currentOpponent),
  });
}

// ── Switch Menu ──

function handleSwitchMenu(battleState: BattleState): void {
  const switchOptions = battleState.player.pokemon
    .map((p, i) => ({ index: i, name: p.displayName, level: p.level, hp: p.currentHp, maxHp: p.maxHp, fainted: p.fainted }))
    .filter((opt) => opt.index !== battleState.player.activeIndex && !opt.fainted);

  if (switchOptions.length === 0) {
    const p = getActivePokemon(battleState.player);
    const o = getActivePokemon(battleState.opponent);
    output({
      status: 'ongoing',
      messages: ['교체할 수 있는 포켓몬이 없다!'],
      menu: buildMenu(p),
      opponent: pokemonInfo(o),
      player: pokemonInfo(p),
      badge: null,
      questionContext: buildQuestionContext(p, o),
    });
    return;
  }

  output({
    status: 'switch_menu',
    messages: ['교체할 포켓몬을 선택하세요:'],
    switchOptions: switchOptions.map(({ index, name, level, hp, maxHp }) => ({
      index, name, level, hp, maxHp,
    })),
    questionContext: buildQuestionContext(getActivePokemon(battleState.player), getActivePokemon(battleState.opponent)),
  });
}

// ── Fainted Switch ──

function handleFaintedSwitch(battleState: BattleState, messages: string[]): void {
  const switchOptions = battleState.player.pokemon
    .map((p, i) => ({ index: i, name: p.displayName, level: p.level, hp: p.currentHp, maxHp: p.maxHp, fainted: p.fainted }))
    .filter((opt) => !opt.fainted);

  if (switchOptions.length === 0) {
    // Should not happen (battle_end would have triggered), but handle gracefully
    output({
      status: 'defeat',
      messages: [...messages, '모든 포켓몬이 쓰러졌다...'],
      badge: null,
      opponent: pokemonInfo(getActivePokemon(battleState.opponent)),
      player: pokemonInfo(getActivePokemon(battleState.player)),
    });
    return;
  }

  // Auto-switch if only 1 option
  if (switchOptions.length === 1) {
    battleState.player.activeIndex = switchOptions[0].index;
    battleState.phase = 'select_action';
    const newActive = getActivePokemon(battleState.player);
    messages.push(`가라, ${newActive.displayName}!`);

    // Re-save after auto-switch
    const bsf = readBattleState()!;
    bsf.battleState = battleState;
    writeBattleState(bsf);

    const opp = getActivePokemon(battleState.opponent);
    output({
      status: 'ongoing',
      messages,
      menu: buildMenu(newActive),
      opponent: pokemonInfo(opp),
      player: pokemonInfo(newActive),
      badge: null,
      questionContext: buildQuestionContext(newActive, opp),
    });
    return;
  }

  output({
    status: 'fainted_switch',
    messages: [...messages, '다음 포켓몬을 선택하세요:'],
    switchOptions: switchOptions.map(({ index, name, level, hp, maxHp }) => ({
      index, name, level, hp, maxHp,
    })),
    questionContext: `⚔️ vs ${getActivePokemon(battleState.opponent).displayName} — 다음 포켓몬을 선택하세요`,
  });
}

// ── Victory ──

function handleVictory(bsf: BattleStateFile, messages: string[]): void {
  const { battleState, gym, generation, playerPartyNames } = bsf;

  messages.push(`${gym.leaderKo}에게 승리했다!`);

  // Re-read state inside lock to avoid overwriting hook changes
  const lockResult = withLockRetry(() => {
    const freshState = readState(generation);
    const result = awardGymVictory(freshState, gym, playerPartyNames);
    writeState(freshState, generation);
    return result;
  });

  if (!lockResult.acquired) {
    output({ status: 'error', messages: ['Failed to acquire state lock for victory update.'] });
    process.exit(1);
  }

  const victoryResult = lockResult.value;

  // Clean up battle state
  deleteBattleState();

  output({
    status: 'victory',
    messages,
    badge: {
      name: gym.badgeKo,
      earned: victoryResult.badgeEarned,
      xp: victoryResult.xpAwarded,
    },
    opponent: pokemonInfo(getActivePokemon(battleState.opponent)),
    player: pokemonInfo(getActivePokemon(battleState.player)),
  });
}

// ── Defeat ──

function handleDefeat(bsf: BattleStateFile, messages: string[]): void {
  const { battleState, gym, generation, stateDir } = bsf;

  // Load & save state (battle stats)
  const genDir = join(stateDir, generation);
  const statePath = join(genDir, 'state.json');
  if (existsSync(statePath)) {
    const state: State = JSON.parse(readFileSync(statePath, 'utf-8'));
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  messages.push(`${gym.leaderKo}에게 패배했다...`);

  // Clean up battle state
  deleteBattleState();

  output({
    status: 'defeat',
    messages,
    badge: null,
    opponent: pokemonInfo(getActivePokemon(battleState.opponent)),
    player: pokemonInfo(getActivePokemon(battleState.player)),
  });
}

// ── End Flow ──

function handleEnd(): void {
  deleteBattleState();
  output({ status: 'ended', messages: ['Battle state cleared.'] });
}

// ── Signal Handlers ──

function setupSignalHandlers(): void {
  const cleanup = () => {
    deleteBattleState();
    process.exit(1);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// ── Main ──

function main(): void {
  // Initialize locale so getPokemonName returns Korean names when language is 'ko'
  const globalConfig = readGlobalConfig();
  initLocale(globalConfig.language);

  setupSignalHandlers();

  try {
    if (hasFlag('init')) {
      handleInit();
    } else if (hasFlag('end')) {
      handleEnd();
    } else if (getArg('action') !== undefined) {
      handleAction();
    } else {
      output({
        status: 'error',
        messages: [
          'Usage:',
          '  --init --gym <id> --gen <gen>   Start battle',
          '  --action <1-4|5|6|switch:N>     Take action',
          '  --end                            Clean up',
        ],
      });
      process.exit(1);
    }
  } catch (err: any) {
    output({
      status: 'error',
      messages: [err.message || 'Unknown error'],
    });
    process.exit(1);
  }
}

main();
