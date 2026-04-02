# Adding a New Generation

This guide explains how to add a new Pokémon generation to Tokénmon.

## Architecture

The system is **fully data-driven**. Adding a generation requires **zero code changes** — only data files and assets.

```
data/
  generations.json          ← Register the new generation here
  shared.json               ← Type chart, colors, rarity weights (shared)
  gen1/                     ← Gen 1 data (example)
    pokemon.json
    regions.json
    achievements.json
    pokedex-rewards.json
    i18n/en.json
    i18n/ko.json
  gen4/                     ← Gen 4 data (example)
    ...

sprites/raw/{id}.png        ← Shared by ID (no collisions across gens)
sprites/braille/{id}.txt    ← Shared by ID
cries/{id}.ogg              ← Shared by ID

~/.claude/tokenmon/
  global-config.json         ← active_generation
  gen1/state.json            ← Per-gen user data
  gen4/state.json
```

## Step-by-step

### 1. Register in `data/generations.json`

```json
{
  "generations": {
    "gen2": {
      "id": "gen2",
      "name": "Generation II",
      "region_name": "Johto",
      "pokemon_range": [152, 251],
      "starters": ["152", "155", "158"],
      "order": 2
    }
  }
}
```

- `pokemon_range`: National Pokédex ID range (inclusive)
- `starters`: 3 starter Pokémon IDs
- `order`: Display order in `gen list`

### 2. Create data directory

```
data/gen2/
  pokemon.json
  regions.json
  achievements.json
  pokedex-rewards.json
  i18n/
    en.json
    ko.json
```

### 3. `pokemon.json`

Schema per entry (same as Gen 1/4):

```json
{
  "pokemon": {
    "152": {
      "id": 152,
      "name": "152",
      "types": ["grass"],
      "stage": 0,
      "line": ["152", "153", "154"],
      "evolves_at": 16,
      "evolves_to": "153",
      "unlock": "starter",
      "exp_group": "medium_slow",
      "rarity": "common",
      "region": "1",
      "base_stats": { "hp": 45, "attack": 49, "defense": 65, "speed": 45 },
      "catch_rate": 45
    }
  },
  "starters": ["152", "155", "158"]
}
```

Key fields:
- `name`: Use the national dex ID as string (i18n handles display names)
- `types`: English type names (lowercase)
- `unlock`: `"starter"` | `"encounter"` | `"evolution"`
- `catch_rate`: From PokeAPI. Determines Poké Ball cost: `ceil(e^(4.5 × (1 - catch_rate/255)))`
- `evolves_to`: string (single) or `[{name, condition}]` (branching)
- `evolves_condition`: Only for non-level evolution (`"friendship"`, `"item:fire-stone"`, `"trade"`, etc.)

### 4. `regions.json`

9 regions recommended (matches Gen 1/4 structure):

```json
{
  "regions": {
    "1": {
      "id": 1,
      "level_range": [1, 15],
      "pokemon_pool": ["152", "155", "158", "161", "163"],
      "unlock_condition": null
    },
    "2": {
      "id": 2,
      "level_range": [8, 22],
      "pokemon_pool": ["165", "167", "170"],
      "unlock_condition": { "type": "seen", "value": 5 }
    }
  },
  "default_region": "1"
}
```

- Region 1 should have `unlock_condition: null` (always available)
- `pokemon_pool`: IDs of Pokémon that appear in this region (exclude starters)
- Progressive unlock: `seen` or `caught` thresholds

### 5. `achievements.json`

```json
{
  "achievements": [
    {
      "id": "catch_10",
      "trigger_type": "catch_count",
      "trigger_value": 10,
      "reward_pokemon": null,
      "rarity": 1,
      "reward_effects": [{ "type": "party_slot", "count": 1 }]
    }
  ]
}
```

Trigger types: `catch_count`, `battle_wins`, `evolution_count`, `session_count`, `streak_days`, `max_level`, `permission_count`, `total_tokens`, `specific_pokemon`, `unique_types`

Reward effects: `party_slot`, `add_item`, `xp_bonus`, `unlock_legendary`

**Important**: Include 3 `party_slot` rewards totaling +3 (base is 3, cap is 6).

### 6. `pokedex-rewards.json`

```json
{
  "milestones": [
    {
      "id": "catch_50_reward",
      "threshold": 50,
      "reward_type": "legendary_unlock",
      "reward_value": "legendary_group_name",
      "label": { "en": "...", "ko": "..." }
    }
  ],
  "legendary_groups": { ... },
  "type_master": { ... },
  "chain_completion_reward": { "pokeball_count": 1 }
}
```

Reward types: `pokeball`, `xp_multiplier`, `legendary_unlock`, `party_slot`, `title`

### 7. `i18n/en.json` and `i18n/ko.json`

```json
{
  "pokemon": {
    "152": "Chikorita",
    "153": "Bayleef"
  },
  "types": {
    "grass": "Grass",
    "fire": "Fire"
  },
  "regions": {
    "1": { "name": "New Bark Town", "description": "Where winds of new beginnings blow" }
  },
  "achievements": {
    "catch_10": { "name": "...", "description": "...", "rarity_label": "..." }
  }
}
```

**Use official names only.** Fetch from PokeAPI (`pokemon-species/{id}` → `names` array).

### 8. Assets

Sprites and cries go in shared directories (IDs don't collide across generations):

```bash
# Download sprites
for id in $(seq 152 251); do
  curl -o sprites/raw/$id.png "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/$id.png"
done

# Generate braille sprites
npx tsx scripts/generate-braille-sprites.ts

# Download cries (from PokeAPI)
# Use scripts/generate-gen1.ts as reference for the download logic
```

### 9. Automated generation (recommended)

Use `scripts/generate-gen1.ts` as a template. Copy it, change the ID range and region assignments:

```bash
cp scripts/generate-gen1.ts scripts/generate-gen2.ts
# Edit GEN1_START/END → 152/251
# Edit region assignments for Johto
# Edit achievement/reward definitions
npx tsx scripts/generate-gen2.ts
```

The script handles: PokeAPI fetch, evolution chains, i18n names, sprites, cries, region assignment.

## Verification checklist

After adding a generation:

- [ ] `data/generations.json` has the new entry
- [ ] `data/genN/pokemon.json` has correct species count
- [ ] `data/genN/regions.json` has 9 regions with progressive unlock
- [ ] `data/genN/achievements.json` has ~20 achievements with 3× party_slot
- [ ] `data/genN/pokedex-rewards.json` has legendary milestones
- [ ] `data/genN/i18n/{en,ko}.json` have all names
- [ ] `sprites/raw/{range}.png` exist
- [ ] `sprites/braille/{range}.txt` exist
- [ ] `cries/{range}.ogg` exist
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes
- [ ] `tokenmon gen list` shows the new generation
- [ ] `tokenmon gen switch genN` works
- [ ] Starter selection works for new gen

## ID ranges by generation

| Gen | Range | Count | Region |
|-----|-------|-------|--------|
| 1 | 1-151 | 151 | Kanto |
| 2 | 152-251 | 100 | Johto |
| 3 | 252-386 | 135 | Hoenn |
| 4 | 280-493 | 214* | Sinnoh |
| 5 | 494-649 | 156 | Unova |
| 6 | 650-721 | 72 | Kalos |
| 7 | 722-809 | 88 | Alola |
| 8 | 810-905 | 96 | Galar |

*Gen 4 includes pre-evolutions from earlier gens (280-386 range overlap).
