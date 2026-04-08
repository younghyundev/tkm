/**
 * Battle State File I/O — read/write/delete the persistent battle state JSON.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import type { BattleState, GymData } from './types.js';

// ── Constants ──

export const STATE_DIR = join(process.env.HOME || '', '.claude', 'tokenmon');
// Battle state is stored at a fixed location (not per-gen) because
// only one battle can be active at a time across all generations.
export const BATTLE_STATE_PATH = join(STATE_DIR, 'battle-state.json');

// ── Types ──

export interface LastHit {
  target: 'player' | 'opponent';
  damage: number;
  effectiveness: 'super' | 'normal' | 'not_very' | 'immune';
}

export interface BattleStateFile {
  battleState: BattleState;
  gym: GymData;
  generation: string;
  stateDir: string;
  playerPartyNames: string[];
  lastHit?: LastHit | null;
  sessionId?: string;
}

// ── File Operations ──

export function readBattleState(): BattleStateFile | null {
  if (!existsSync(BATTLE_STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BATTLE_STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeBattleState(bsf: BattleStateFile): void {
  const dir = dirname(BATTLE_STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = BATTLE_STATE_PATH + '.tmp';
  try {
    writeFileSync(tmpPath, JSON.stringify(bsf, null, 2), 'utf-8');
    renameSync(tmpPath, BATTLE_STATE_PATH);
  } catch (err) {
    // Clean up temp file on failure
    try { unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

export function deleteBattleState(): void {
  if (existsSync(BATTLE_STATE_PATH)) {
    try { unlinkSync(BATTLE_STATE_PATH); } catch { /* ignore */ }
  }
}
