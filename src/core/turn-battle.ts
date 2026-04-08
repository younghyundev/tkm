import { getTypeEffectiveness } from './type-chart.js';
import type {
  BaseStats,
  MoveData,
  BattleMove,
  BattlePokemon,
  BattleTeam,
  BattleState,
  TurnAction,
  TurnResult,
} from './types.js';

// ── Stat Calculation ──

/** Simplified mainline HP formula (no IVs/EVs). */
export function calculateHp(baseHp: number, level: number): number {
  return Math.floor((2 * baseHp * level) / 100) + level + 10;
}

/** Simplified mainline stat formula (no IVs/EVs). */
export function calculateStat(baseStat: number, level: number): number {
  return Math.floor((2 * baseStat * level) / 100) + 5;
}

// ── BattlePokemon Factory ──

export interface CreateBattlePokemonInput {
  id: number;
  types: string[];
  level: number;
  baseStats: BaseStats;
  displayName?: string;
}

export function createBattlePokemon(
  input: CreateBattlePokemonInput,
  moves: MoveData[],
): BattlePokemon {
  const { id, types, level, baseStats } = input;
  const maxHp = calculateHp(baseStats.hp, level);

  const spAttackBase = baseStats.sp_attack ?? baseStats.attack;
  const spDefenseBase = baseStats.sp_defense ?? baseStats.defense;

  return {
    id,
    name: String(id),
    displayName: input.displayName ?? String(id),
    types,
    level,
    maxHp,
    currentHp: maxHp,
    attack: calculateStat(baseStats.attack, level),
    defense: calculateStat(baseStats.defense, level),
    spAttack: calculateStat(spAttackBase, level),
    spDefense: calculateStat(spDefenseBase, level),
    speed: calculateStat(baseStats.speed, level),
    moves: moves.map((m) => ({ data: m, currentPp: m.pp })),
    fainted: false,
  };
}

// ── Damage Calculation ──

export function calculateDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
): number {
  const power = move.data.power;
  if (!power || power <= 0) return 0;

  const atk = move.data.category === 'physical' ? attacker.attack : attacker.spAttack;
  const def = move.data.category === 'physical' ? defender.defense : defender.spDefense;

  const base = Math.floor(
    ((2 * attacker.level / 5 + 2) * power * atk) / def / 50 + 2,
  );
  const stab = attacker.types.includes(move.data.type) ? 1.5 : 1.0;

  let typeEff = 1.0;
  for (const defType of defender.types) {
    typeEff *= getTypeEffectiveness(move.data.type, defType);
  }

  const random = 0.85 + Math.random() * 0.15;
  return Math.max(1, Math.floor(base * stab * typeEff * random));
}

// ── Effectiveness Message ──

export function getEffectivenessMessage(
  moveType: string,
  defenderTypes: string[],
): string | null {
  let eff = 1.0;
  for (const defType of defenderTypes) {
    eff *= getTypeEffectiveness(moveType, defType);
  }
  if (eff === 0) return 'effect_immune';
  if (eff >= 2.0) return 'effect_super';
  if (eff > 0 && eff <= 0.5) return 'effect_not_very';
  return null;
}

// ── Accuracy Check ──

export function checkAccuracy(move: BattleMove): boolean {
  if (move.data.accuracy <= 0) return true; // always-hit moves
  return Math.random() * 100 < move.data.accuracy;
}

// ── Battle State Factory ──

export function createBattleState(
  playerTeam: BattlePokemon[],
  opponentTeam: BattlePokemon[],
): BattleState {
  return {
    player: { pokemon: playerTeam, activeIndex: 0 },
    opponent: { pokemon: opponentTeam, activeIndex: 0 },
    turn: 0,
    log: [],
    phase: 'select_action',
    winner: null,
  };
}

// ── Helpers ──

export function getActivePokemon(team: BattleTeam): BattlePokemon {
  return team.pokemon[team.activeIndex];
}

export function hasAlivePokemon(team: BattleTeam): boolean {
  return team.pokemon.some((p) => !p.fainted);
}

// ── Turn Resolution ──

interface ActionEntry {
  side: 'player' | 'opponent';
  action: TurnAction;
  pokemon: BattlePokemon;
}

function executeSwitch(
  team: BattleTeam,
  targetIndex: number,
  messages: string[],
): void {
  const old = getActivePokemon(team);
  team.activeIndex = targetIndex;
  const next = getActivePokemon(team);
  messages.push(`${old.displayName}에서 ${next.displayName}(으)로 교체!`);
}

const STRUGGLE_MOVE: BattleMove = {
  data: {
    id: 0,
    name: 'struggle',
    nameKo: '발버둥',
    nameEn: 'Struggle',
    type: 'typeless',
    category: 'physical',
    power: 50,
    accuracy: 100,
    pp: 1,
  },
  currentPp: 1,
};

function executeMove(
  attackerSide: 'player' | 'opponent',
  state: BattleState,
  moveIndex: number,
  messages: string[],
): { defenderFainted: boolean } {
  const attackerTeam = state[attackerSide];
  const defenderSide = attackerSide === 'player' ? 'opponent' : 'player';
  const defenderTeam = state[defenderSide];

  const attacker = getActivePokemon(attackerTeam);
  const defender = getActivePokemon(defenderTeam);

  // Skip if attacker already fainted
  if (attacker.fainted) return { defenderFainted: false };

  // Determine move (struggle if no PP)
  let move: BattleMove;
  let isStruggle = false;

  const hasUsableMoves = attacker.moves.some((m) => m.currentPp > 0);
  if (!hasUsableMoves) {
    move = STRUGGLE_MOVE;
    isStruggle = true;
    messages.push(`${attacker.displayName}은(는) 발버둥쳤다!`);
  } else {
    move = attacker.moves[moveIndex];
    if (move.currentPp <= 0) {
      // Requested move has 0 PP → struggle
      move = STRUGGLE_MOVE;
      isStruggle = true;
      messages.push(`${attacker.displayName}은(는) 발버둥쳤다!`);
    } else {
      move.currentPp--;
      messages.push(`${attacker.displayName}의 ${move.data.nameKo}!`);
    }
  }

  // Accuracy check
  if (!checkAccuracy(move)) {
    messages.push('공격이 빗나갔다!');
    return { defenderFainted: false };
  }

  // Damage calculation
  const damage = calculateDamage(attacker, defender, move);
  defender.currentHp = Math.max(0, defender.currentHp - damage);

  // Struggle recoil: 1/4 max HP
  if (isStruggle) {
    const recoil = Math.max(1, Math.floor(attacker.maxHp / 4));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
    if (attacker.currentHp <= 0) {
      attacker.fainted = true;
    }
  }

  // Effectiveness messages
  const effMsg = getEffectivenessMessage(move.data.type, defender.types);
  if (effMsg === 'effect_super') messages.push('효과가 굉장했다!');
  else if (effMsg === 'effect_not_very') messages.push('효과가 별로인 듯하다...');
  else if (effMsg === 'effect_immune') messages.push('효과가 없는 듯하다...');

  // Faint check
  if (defender.currentHp <= 0) {
    defender.fainted = true;
    messages.push(`${defender.displayName}은(는) 쓰러졌다!`);
    return { defenderFainted: true };
  }

  return { defenderFainted: false };
}

export function resolveTurn(
  state: BattleState,
  playerAction: TurnAction,
  opponentAction: TurnAction,
): TurnResult {
  const messages: string[] = [];
  let playerFainted = false;
  let opponentFainted = false;

  state.turn++;

  // Handle surrender
  if (playerAction.type === 'surrender') {
    messages.push('항복했다...');
    state.phase = 'battle_end';
    state.winner = 'opponent';
    return { messages, playerFainted: false, opponentFainted: false };
  }
  if (opponentAction.type === 'surrender') {
    messages.push('항복했다...');
    state.phase = 'battle_end';
    state.winner = 'player';
    return { messages, playerFainted: false, opponentFainted: false };
  }

  // Build action entries
  const entries: ActionEntry[] = [
    { side: 'player', action: playerAction, pokemon: getActivePokemon(state.player) },
    { side: 'opponent', action: opponentAction, pokemon: getActivePokemon(state.opponent) },
  ];

  // Determine order: switches before moves, then speed, then random tiebreak
  entries.sort((a, b) => {
    const aPriority = a.action.type === 'switch' ? 0 : 1;
    const bPriority = b.action.type === 'switch' ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    // Same priority → speed
    if (a.pokemon.speed !== b.pokemon.speed) return b.pokemon.speed - a.pokemon.speed;
    // Random tiebreak
    return Math.random() < 0.5 ? -1 : 1;
  });

  // Execute actions in order
  for (const entry of entries) {
    if (entry.action.type === 'switch') {
      executeSwitch(state[entry.side], entry.action.pokemonIndex, messages);
    } else if (entry.action.type === 'move') {
      const result = executeMove(entry.side, state, entry.action.moveIndex, messages);
      if (entry.side === 'player' && result.defenderFainted) {
        opponentFainted = true;
      } else if (entry.side === 'opponent' && result.defenderFainted) {
        playerFainted = true;
      }
    }
  }

  // Check attacker faint from struggle recoil
  const playerActive = getActivePokemon(state.player);
  const opponentActive = getActivePokemon(state.opponent);
  if (playerActive.fainted) playerFainted = true;
  if (opponentActive.fainted) opponentFainted = true;

  // Win/loss conditions
  const playerAlive = hasAlivePokemon(state.player);
  const opponentAlive = hasAlivePokemon(state.opponent);

  if (!opponentAlive) {
    state.phase = 'battle_end';
    state.winner = 'player';
  } else if (!playerAlive) {
    state.phase = 'battle_end';
    state.winner = 'opponent';
  } else if (playerFainted) {
    // Player's active fainted but has more → fainted_switch
    state.phase = 'fainted_switch';
  } else if (opponentFainted) {
    // Opponent fainted but has more → stay select_action (AI switches externally)
    state.phase = 'select_action';
  } else {
    state.phase = 'select_action';
  }

  return { messages, playerFainted, opponentFainted };
}
