import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readState, writeState, pruneSessionTokens } from '../core/state.js';
import { readConfig, writeConfig } from '../core/config.js';
import { getPokemonDB } from '../core/pokemon-data.js';
import { levelToXp, xpToLevel } from '../core/xp.js';
import { checkEvolution, applyEvolution } from '../core/evolution.js';
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import type { HookInput, HookOutput, ExpGroup } from '../core/types.js';
import { playCry } from '../audio/play-cry.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function parseJsonl(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  let total = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const msg = obj.message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, unknown> | undefined;
      if (usage) {
        total += (usage.input_tokens as number) || 0;
        total += (usage.output_tokens as number) || 0;
        // Explicitly NOT counting cache_creation_input_tokens or cache_read_input_tokens
      }
    } catch {
      // Skip malformed lines
    }
  }
  return total;
}

function findJsonlFile(sessionId: string): string | null {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const projectsDir = join(claudeDir, 'projects');
  if (!existsSync(projectsDir)) return null;

  // Search project subdirs for session JSONL
  try {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const subDir = join(projectsDir, entry.name);
      const candidate = join(subDir, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function main(): Promise<void> {
  const input = JSON.parse(readStdin()) as HookInput;
  const sessionId = input.session_id ?? '';

  const output: HookOutput = { continue: true };

  const state = readState();
  const config = readConfig();

  if (config.party.length === 0 || !sessionId) {
    playCry();
    console.log(JSON.stringify(output));
    return;
  }

  // Find and parse JSONL
  const jsonlFile = findJsonlFile(sessionId);
  let totalTokens = 0;
  if (jsonlFile) {
    totalTokens = parseJsonl(jsonlFile);
  }

  // Delta tracking
  const prevSessionTokens = state.last_session_tokens[sessionId] ?? 0;
  const deltaTokens = totalTokens - prevSessionTokens;

  if (deltaTokens <= 0) {
    playCry();
    console.log(JSON.stringify(output));
    return;
  }

  // Calculate XP
  const tokensPerXp = Math.max(1, config.tokens_per_xp);
  const xpBonus = Math.max(config.xp_bonus_multiplier, state.xp_bonus_multiplier);
  const xpTotal = Math.max(0, Math.floor((deltaTokens / tokensPerXp) * xpBonus));
  const partySize = config.party.length;
  const xpPerPokemon = Math.max(1, Math.floor(xpTotal / Math.max(1, partySize)));

  const pokemonDB = getPokemonDB();
  const messages: string[] = [];

  for (const pokemonName of config.party) {
    if (!pokemonName) continue;

    // Ensure pokemon entry exists
    const pData = pokemonDB.pokemon[pokemonName];
    if (!state.pokemon[pokemonName]) {
      state.pokemon[pokemonName] = {
        id: pData?.id ?? 0,
        xp: 0,
        level: 1,
      };
    }

    const expGroup: ExpGroup = pData?.exp_group ?? 'medium_fast';
    const currentXp = state.pokemon[pokemonName].xp;
    const currentLevel = state.pokemon[pokemonName].level;
    const newXp = currentXp + xpPerPokemon;
    const newLevel = xpToLevel(newXp, expGroup);

    // Update state
    state.pokemon[pokemonName].xp = newXp;
    state.pokemon[pokemonName].level = newLevel;

    // Level-up notification
    if (newLevel > currentLevel) {
      messages.push(`⬆️ ${pokemonName} Lv.${currentLevel} → Lv.${newLevel}! (XP: +${xpPerPokemon})`);
    }

    // Check evolution
    const evolution = checkEvolution(pokemonName, currentLevel, newLevel);
    if (evolution) {
      applyEvolution(state, config, evolution, newXp);
      messages.push(`✨ ${pokemonName}이(가) ${evolution.newPokemon}(으)로 진화했습니다!`);

      // Check first_evolution achievement immediately
      const achEvents = checkAchievements(state, config);
      for (const achEvent of achEvents) {
        messages.push(formatAchievementMessage(achEvent));
      }
    }
  }

  // Update session tokens tracking & total
  state.last_session_tokens[sessionId] = totalTokens;
  state.last_session_tokens = pruneSessionTokens(state.last_session_tokens);
  state.total_tokens_consumed += deltaTokens;

  // Check token-based achievements
  const achEvents = checkAchievements(state, config);
  for (const achEvent of achEvents) {
    messages.push(formatAchievementMessage(achEvent));
  }

  writeState(state);
  writeConfig(config);

  if (messages.length > 0) {
    output.system_message = messages.join('\n');
  }

  playCry();
  console.log(JSON.stringify(output));
}

main().catch((err) => {
  process.stderr.write(`tokenmon stop: ${err}\n`);
  console.log('{"continue": true}');
});
