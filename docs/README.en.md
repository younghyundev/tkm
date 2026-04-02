# Tokémon — Detailed Guide (English)

> tokenmon — Train Gen 4 Pokémon while you code in Claude Code.

[← Back to main README](../README.md)

---

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Commands](#commands)
- [Configuration](#configuration)
- [Pokémon & Regions](#pokémon--regions)
- [Battle System](#battle-system)
- [Event System](#event-system)
- [Pokédex Rewards](#pokédex-rewards)
- [Achievement System](#achievement-system)
- [Renderer Options](#renderer-options)
- [Status Bar](#status-bar)
- [Architecture](#architecture)

## How It Works

tokenmon hooks into 6 Claude Code lifecycle events:

| Event | What Happens |
|-------|-------------|
| **SessionStart** | Initialize session, display party in status bar |
| **Stop** | Parse token usage, award XP, check evolution triggers |
| **PermissionRequest** | Track permission grants (used by achievements) |
| **PostToolUseFailure** | Track errors (used by achievements) |
| **SubagentStart** | Assign Pokémon to subagent for dispatch XP bonus |
| **SubagentStop** | Collect subagent token data |

Token usage (input + output, excluding cache) is converted to XP at a configurable rate (default: 100 tokens = 1 XP). Each Pokémon species follows its authentic experience group formula from the original games.

## Installation

### Marketplace (recommended)

```bash
/plugin marketplace add ThunderConch/tkm
/plugin install tkm@tkm
/reload-plugins
/tkm:setup
```

### Standalone

```bash
git clone https://github.com/ThunderConch/tkm.git
cd tkm
npm install
npx tsx install-standalone.ts
```

### Requirements

- Claude Code v2.1+
- Node.js ≥ 22.0.0

## Commands

| Command | Description |
|---------|-------------|
| `/tkm:tkm status` | Show party and stats |
| `/tkm:tkm starter` | Choose starter Pokémon |
| `/tkm:tkm party` | View current party |
| `/tkm:tkm party add <name>` | Add Pokémon to party |
| `/tkm:tkm party remove <name>` | Remove from party |
| `/tkm:tkm party dispatch <name>` | Set dispatch Pokémon (1.5x XP in subagents) |
| `/tkm:tkm unlock list` | List unlocked Pokémon |
| `/tkm:tkm pokedex` | Browse Pokédex (supports `--type`, `--region`, `--rarity` filters) |
| `/tkm:tkm pokedex <name>` | Pokémon detail view |
| `/tkm:tkm region` | Show current region |
| `/tkm:tkm region list` | List all regions |
| `/tkm:tkm region move <name>` | Move to another region |
| `/tkm:tkm items` | View items |
| `/tkm:tkm evolve` | List evolution-ready Pokémon |
| `/tkm:tkm evolve <name>` | Evolve with branch selection |
| `/tkm:tkm dashboard` | Full summary dashboard |
| `/tkm:tkm stats` | Weekly + all-time stats |
| `/tkm:tkm legendary` | View/select legendary Pokémon |
| `/tkm:tkm box` | View stored (non-party) Pokémon |
| `/tkm:tkm party swap <slot> <name>` | Swap party slot with box Pokémon |
| `/tkm:tkm party reorder <from> <to>` | Reorder party slots |
| `/tkm:tkm party suggest` | Suggest party for current region |
| `/tkm:tkm notifications` | View notifications |
| `/tkm:tkm achievements` | Achievement progress |
| `/tkm:tkm config set <key> <value>` | Change a setting |
| `/tkm:tkm help` | Full help text |

## Configuration

Settings are stored in `~/.claude/tokenmon/config.json`:

| Option | Default | Description |
|--------|---------|-------------|
| `tokens_per_xp` | 100 | Tokens required per 1 XP |
| `volume` | 0.5 | Cry playback volume (0–1) |
| `sprite_enabled` | true | Show terminal sprites |
| `cry_enabled` | true | Play Pokémon cries |
| `max_party_size` | 6 | Maximum party members |
| `language` | en | Display language (`en` or `ko`) |
| `renderer` | braille | Sprite renderer (`braille`, `kitty`, `sixel`, `iterm2`) |
| `sprite_mode` | all | Status bar sprite mode (`all`, `ace_only`, `emoji_all`, `emoji_ace`) |
| `info_mode` | ace_full | Status bar info mode (`ace_full`, `name_level`, `all_full`, `ace_level`) |

## Pokémon & Regions

**112 Pokémon** across the full Sinnoh Pokédex (#280–#493), spanning 18 types and 6 experience groups. Includes 8 legendary Pokémon unlockable through Pokédex milestones.

### Starters

| Pokémon | Type | Evolution |
|---------|------|-----------|
| Turtwig | Grass | → Grotle (Lv.18) → Torterra (Lv.32) |
| Chimchar | Fire | → Monferno (Lv.14) → Infernape (Lv.36) |
| Piplup | Water | → Prinplup (Lv.16) → Empoleon (Lv.36) |

### Regions

9 explorable regions, each with a level range and a unique Pokémon pool. New regions unlock as your Pokédex grows. Encounter rates vary by rarity: common, uncommon, rare, and legendary.

## Battle System

Wild encounters happen during coding sessions. Battles are type-advantage based with stats (HP, Attack, Defense, Speed) derived from the original games. Win to gain bonus XP; throw a Poké Ball to attempt a catch. Catch rate uses the authentic Gen 4 formula.

## Event System

Dynamic events modify encounter rates based on time, day, and player activity:

| Event Type | Effect |
|------------|--------|
| **Night Shift** (21:00–04:00) | Ghost/Dark type boost |
| **Dawn Patrol** (05:00–07:00) | Flying/Grass type boost |
| **High Noon** (11:00–13:00) | Fire/Ground type boost |
| **Lucky Friday** | Rare encounter 2x multiplier |
| **7-Day Streak** | Guaranteed rare/legendary encounters |
| **Million Tokens** | One-time special encounter (Cresselia) |

## Pokédex Rewards

Catching Pokémon unlocks milestone rewards:

| Caught | Reward |
|--------|--------|
| 10 | Poké Ball x5 |
| 30 | +5% XP multiplier (permanent) |
| 50 | Lake Trio legendary group unlock |
| 80 | Cover Legends legendary group unlock |
| 90 | +1 party slot |
| 98 (all) | Pokédex Master title + Giratina |

**Type Masters**: Catch all Pokémon of a type → 1.2x battle XP for that type. Master 3 types to unlock Special Legends.

**Chain Completion**: Catch all members of an evolution line → Poké Ball x2 per chain.

## Achievement System

21 achievements that track milestones like total XP, catches, evolutions, and special conditions. Completing achievements can unlock rare Pokémon, Poké Balls, XP bonuses, and new party slots.

## Renderer Options

| Renderer | Quality | Compatibility | Status |
|----------|---------|---------------|--------|
| **Braille** | ⬛⬛⬜⬜⬜ | All terminals | Recommended |
| **Kitty** | ⬛⬛⬛⬛⬛ | Kitty terminal | Experimental |
| **Sixel** | ⬛⬛⬛⬛⬜ | Sixel-capable terminals | Experimental |
| **iTerm2** | ⬛⬛⬛⬛⬜ | iTerm2 / compatible | Experimental |

Set during `/tkm:setup` or change anytime: `/tkm:tkm config set renderer kitty`

## Status Bar

Tokenmon integrates with Claude Code's status line, showing your party Pokémon with sprites, names, levels, and XP bars. Display modes are configurable via `sprite_mode` and `info_mode` settings.

Coexists with other plugins' status lines via an auto-generated wrapper script.

## Architecture

```
hooks/          → Claude Code lifecycle event handlers
src/core/       → Game logic (XP, battle, evolution, encounter, achievements)
src/cli/        → CLI commands (tokenmon.ts)
src/status-line → Status bar renderer
src/i18n/       → Internationalization (ko, en)
src/audio/      → Cry and SFX playback
data/           → Pokémon DB, regions, achievements, i18n data
sprites/        → Terminal art (braille) + PNG sprites (kitty/sixel/iterm2)
cries/          → Pokémon cry audio files (.ogg)
sfx/            → Sound effects (.wav)
skills/         → Claude Code plugin skills
```
