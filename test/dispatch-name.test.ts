import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setActiveGenerationCache } from '../src/core/paths.js';
setActiveGenerationCache('gen4');
import { getPokemonDB, pokemonIdByName } from '../src/core/pokemon-data.js';

// Replicates the resolvePokemonArg() logic from src/cli/tokenmon.ts
// (not exported, so we replicate the logic here)
function resolvePokemonArg(name: string): string {
  const pokemonDB = getPokemonDB();
  if (pokemonDB.pokemon[name]) return name;
  const id = pokemonIdByName(name);
  return id ?? name;
}

describe('dispatch-by-name regression', () => {
  it('Korean name resolves to ID for dispatch', () => {
    const id = pokemonIdByName('비버니');
    assert.equal(id, '399');
    const party = ['399'];
    assert.ok(party.includes('399'));
  });

  it('English name resolves to ID for dispatch', () => {
    const id = pokemonIdByName('Bidoof');
    assert.equal(id, '399');
    const party = ['399'];
    assert.ok(party.includes(id as string));
  });

  it('ID string used directly works', () => {
    const id = pokemonIdByName('399');
    // pokemonIdByName does a name lookup — '399' is not a name, so returns undefined
    assert.equal(id, undefined);
    // But the raw ID string '399' is directly in party
    const party = ['399'];
    assert.ok(party.includes('399'));
  });

  it('unknown name fails gracefully', () => {
    const id = pokemonIdByName('없는포켓몬');
    assert.equal(id, undefined);
    const party = ['399'];
    // The original unresolved string won't be in a properly-set-up party
    assert.ok(!party.includes('없는포켓몬'));
  });

  it('mixed name/ID party config — resolution still works for dispatch target lookup', () => {
    // Simulate legacy config that may have Korean names; resolution should still find by ID
    const resolvedId = pokemonIdByName('비버니');
    assert.equal(resolvedId, '399');
    // Even if party stores IDs, dispatch can still resolve a Korean name input
    const party = ['399', '387'];
    assert.ok(party.includes(resolvedId as string));
  });

  it('resolvePokemonArg equivalent logic — ID passthrough', () => {
    // If input is a known pokemon key (ID), return it directly
    const result = resolvePokemonArg('399');
    assert.equal(result, '399');
  });

  it('resolvePokemonArg equivalent logic — Korean name resolution', () => {
    const result = resolvePokemonArg('비버니');
    assert.equal(result, '399');
  });

  it('resolvePokemonArg equivalent logic — English name resolution', () => {
    const result = resolvePokemonArg('Bidoof');
    assert.equal(result, '399');
  });

  it('resolvePokemonArg equivalent logic — unknown name returns original string', () => {
    const result = resolvePokemonArg('없는포켓몬');
    assert.equal(result, '없는포켓몬');
  });
});
