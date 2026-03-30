import { getPokemonDB } from './pokemon-data.js';
import type { State, Config, EvolutionResult } from './types.js';

/**
 * Check if a pokemon should evolve at the given new level.
 * Only triggers when crossing the evolves_at threshold (old < threshold <= new).
 */
export function checkEvolution(
  pokemonName: string,
  oldLevel: number,
  newLevel: number,
): EvolutionResult | null {
  const db = getPokemonDB();
  const data = db.pokemon[pokemonName];
  if (!data || data.evolves_at == null) return null;

  if (newLevel >= data.evolves_at && oldLevel < data.evolves_at) {
    const nextStage = data.stage + 1;
    if (nextStage < data.line.length) {
      const nextPokemon = data.line[nextStage];
      const nextData = db.pokemon[nextPokemon];
      return {
        oldPokemon: pokemonName,
        newPokemon: nextPokemon,
        newId: nextData?.id ?? 0,
        level: newLevel,
      };
    }
  }

  return null;
}

/**
 * Apply evolution result to state and config.
 */
export function applyEvolution(
  state: State,
  config: Config,
  evolution: EvolutionResult,
  currentXp: number,
): void {
  // Add evolved pokemon to state
  state.pokemon[evolution.newPokemon] = {
    id: evolution.newId,
    xp: currentXp,
    level: evolution.level,
  };

  // Add to unlocked if not already there
  if (!state.unlocked.includes(evolution.newPokemon)) {
    state.unlocked.push(evolution.newPokemon);
  }

  // Increment evolution count
  state.evolution_count += 1;

  // Replace in party config
  config.party = config.party.map(p => p === evolution.oldPokemon ? evolution.newPokemon : p);
}
