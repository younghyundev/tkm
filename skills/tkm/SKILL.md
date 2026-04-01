---
description: "Tokenmon CLI. status, party, pokedex, region, items, achievements. Korean: 상태 확인, 파티, 도감, 지역, 아이템, 업적, 포켓몬, tokenmon"
---

Run a Tokenmon CLI command for the user.

## Execute

Run with the Bash tool and show the result:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" $ARGUMENTS
```

If `$ARGUMENTS` is empty, default to `status`.
If `$ARGUMENTS` is `--help` or `-h`, run `help`.

## Available Commands

| Command | Description |
|---------|-------------|
| `status` | Show party and stats |
| `starter` | Choose starter Pokémon |
| `party` | View current party |
| `party add <name>` | Add Pokémon to party |
| `party remove <name>` | Remove Pokémon from party |
| `party dispatch <name>` | Set subagent dispatch Pokémon (1.5x XP) |
| `unlock list` | List unlocked Pokémon |
| `pokedex` | Browse Pokédex (--type/--region/--rarity filters) |
| `pokedex <name>` | Show Pokémon details |
| `region` | Show current region |
| `region list` | List all regions |
| `region move <region>` | Move to a region |
| `items` | Show items |
| `achievements` | Show achievements |
| `config set <key> <value>` | Change config (e.g. `config set language en`) |
| `config set language en` | Switch to English mode |
| `config set language ko` | Switch to Korean mode (한국어 모드) |
| `help` | Show full help |
