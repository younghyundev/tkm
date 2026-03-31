import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { STATE_PATH, SESSION_PATH } from './paths.js';
import type { State, Session } from './types.js';

const DEFAULT_STATE: State = {
  pokemon: {},
  unlocked: [],
  achievements: {},
  total_tokens_consumed: 0,
  session_count: 0,
  error_count: 0,
  permission_count: 0,
  evolution_count: 0,
  last_session_id: null,
  xp_bonus_multiplier: 1.0,
  last_session_tokens: {},
  pokedex: {},
  encounter_count: 0,
  catch_count: 0,
  battle_count: 0,
  battle_wins: 0,
  battle_losses: 0,
  items: {},
  cheat_log: [],
};

const DEFAULT_SESSION: Session = {
  session_id: null,
  agent_assignments: [],
  evolution_events: [],
  achievement_events: [],
};

export function readState(): State {
  if (!existsSync(STATE_PATH)) {
    return { ...DEFAULT_STATE, pokemon: {}, unlocked: [], achievements: {}, last_session_tokens: {} };
  }
  const raw = readFileSync(STATE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<State>;
  // Merge with defaults to fill missing fields
  const result: State = {
    ...DEFAULT_STATE,
    ...parsed,
    pokemon: parsed.pokemon ?? {},
    unlocked: parsed.unlocked ?? [],
    achievements: parsed.achievements ?? {},
    last_session_tokens: parsed.last_session_tokens ?? {},
    pokedex: parsed.pokedex ?? {},
    items: parsed.items ?? {},
  };

  // Migrate per-pokemon fields (friendship)
  for (const entry of Object.values(result.pokemon)) {
    if (entry.friendship === undefined) (entry as any).friendship = 0;
  }

  return result;
}

export function writeState(state: State): void {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = STATE_PATH + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmpPath, STATE_PATH);
}

/**
 * Prune last_session_tokens to top 10 by value (descending).
 */
export function pruneSessionTokens(tokens: Record<string, number>): Record<string, number> {
  const entries = Object.entries(tokens);
  if (entries.length <= 10) return tokens;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, 10));
}

export function readSession(): Session {
  if (!existsSync(SESSION_PATH)) {
    return { ...DEFAULT_SESSION, agent_assignments: [], evolution_events: [], achievement_events: [] };
  }
  const raw = readFileSync(SESSION_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<Session>;
  return {
    ...DEFAULT_SESSION,
    ...parsed,
    agent_assignments: parsed.agent_assignments ?? [],
    evolution_events: parsed.evolution_events ?? [],
    achievement_events: parsed.achievement_events ?? [],
  };
}

export function writeSession(session: Session): void {
  const dir = dirname(SESSION_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = SESSION_PATH + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(session, null, 2), 'utf-8');
  renameSync(tmpPath, SESSION_PATH);
}
