---
description: "Tokenmon CLI. status, party, pokedex, region, items, achievements, nickname, call. Korean: 상태 확인, 파티, 도감, 지역, 아이템, 업적, 닉네임, 부르기, 포켓몬, tokenmon"
---

Run a Tokenmon CLI command for the user.

## Execute

Run with the Bash tool and show the result:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/tokenmon.ts" $ARGUMENTS
```

If `$ARGUMENTS` is empty, default to `status`.
If `$ARGUMENTS` is `--help` or `-h`, run `help`.

## Available Commands

| Command | Description |
|---------|-------------|
| `status` | Show party and stats |
| `starter` | List starter options (only before choosing) |
| `starter <id>` | Choose starter by number or pokemon ID |
| `party` | View current party |
| `party add <name>` | Add Pokémon to party |
| `party remove <name>` | Remove Pokémon from party |
| `party dispatch <name>` | Set subagent dispatch Pokémon (1.5x XP) |
| `nickname <name> <nick>` | Set a nickname for a Pokémon |
| `call <name>` | Call a Pokémon (EV bond system) |
| `unlock list` | List unlocked Pokémon |
| `pokedex` | Browse Pokédex (--type/--region/--rarity filters) |
| `pokedex <name>` | Show Pokémon details |
| `region` | Show current region (within active generation) |
| `region list` | List all regions in the active generation |
| `region move <id>` | Move to a region by ID (e.g. `region move 3`) |
| `gen` | Show active generation |
| `gen list` | List available generations |
| `gen switch <id>` | Switch generation (e.g. `gen switch gen1`) |
| `items` | Show items |
| `achievements` | Show achievements |
| `config set <key> <value>` | Change config (e.g. `config set language en`) |
| `config set language en` | Switch to English mode |
| `config set language ko` | Switch to Korean mode (한국어 모드) |
| `help` | Show full help |

## Starter Selection Flow

When `starter` is called without an argument, it lists options and exits.
Use AskUserQuestion to let the user pick, then run `starter <id>`.

1. Run `starter` → shows numbered list of starters
2. AskUserQuestion: "Which starter would you like?"
3. Run `starter <number>` with the user's choice

**Important**: `starter` only works before a starter is chosen. If already chosen, it shows a warning.

## Notes

- **Regions are per-generation.** Each generation has its own set of numbered regions (1-9). Do NOT suggest cross-generation region names (e.g. "region move kanto").
- **To switch generations**, use `gen switch <id>` (e.g. `gen switch gen1`), not region commands.
