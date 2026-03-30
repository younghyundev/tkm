// Shared types for tokenmon

export type ExpGroup = 'medium_fast' | 'medium_slow' | 'slow' | 'fast' | 'erratic' | 'fluctuating';

export interface PokemonData {
  id: number;
  name: string;
  types: string[];
  stage: number;
  line: string[];
  evolves_at: number | null;
  evolves_condition?: string;
  unlock: string;
  exp_group: ExpGroup;
}

export interface PokemonDB {
  pokemon: Record<string, PokemonData>;
  starters: string[];
  type_colors: Record<string, string>;
}

export interface PokemonState {
  id: number;
  xp: number;
  level: number;
}

export interface State {
  pokemon: Record<string, PokemonState>;
  unlocked: string[];
  achievements: Record<string, boolean>;
  total_tokens_consumed: number;
  session_count: number;
  error_count: number;
  permission_count: number;
  evolution_count: number;
  last_session_id: string | null;
  xp_bonus_multiplier: number;
  last_session_tokens: Record<string, number>;
}

export interface Config {
  tokens_per_xp: number;
  party: string[];
  starter_chosen: boolean;
  volume: number;
  sprite_enabled: boolean;
  cry_enabled: boolean;
  xp_formula: string;
  xp_bonus_multiplier: number;
  max_party_size: number;
  peon_ping_integration: boolean;
  peon_ping_port: number;
}

export interface Session {
  session_id: string | null;
  agent_assignments: AgentAssignment[];
  evolution_events: string[];
  achievement_events: string[];
}

export interface AgentAssignment {
  agent_id: string;
  pokemon: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_value: number;
  reward_pokemon: string | null;
  reward_message?: string;
  rarity: number;
  rarity_label: string;
}

export interface AchievementsDB {
  achievements: Achievement[];
}

export interface EvolutionResult {
  oldPokemon: string;
  newPokemon: string;
  newId: number;
  level: number;
}

export interface AchievementEvent {
  id: string;
  name: string;
  rewardPokemon?: string;
  rewardMessage?: string;
}

export interface HookInput {
  session_id?: string;
  agent_id?: string;
  [key: string]: unknown;
}

export interface HookOutput {
  continue: boolean;
  system_message?: string;
}
