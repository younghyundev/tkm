import { readFileSync } from 'fs';
import { readState, writeState, readSession, writeSession } from '../core/state.js';
import { readConfig } from '../core/config.js';
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import { playCry } from '../audio/play-cry.js';
import type { HookInput, HookOutput } from '../core/types.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function main(): void {
  const input = JSON.parse(readStdin()) as HookInput;
  const sessionId = input.session_id ?? '';

  const state = readState();
  const config = readConfig();

  // Reset session.json for new session
  writeSession({
    session_id: sessionId,
    agent_assignments: [],
    evolution_events: [],
    achievement_events: [],
  });

  // Increment session_count
  state.session_count += 1;
  state.last_session_id = sessionId;

  // Check achievements (first_session, ten_sessions)
  const messages: string[] = [];
  const achEvents = checkAchievements(state, config);
  for (const achEvent of achEvents) {
    messages.push(formatAchievementMessage(achEvent));
  }

  writeState(state);

  // Play cry async (fire and forget)
  try {
    playCry();
  } catch {
    // Ignore audio errors
  }

  const output: HookOutput = { continue: true };
  if (messages.length > 0) {
    output.system_message = messages.join('\n');
  }
  console.log(JSON.stringify(output));
}

main();
