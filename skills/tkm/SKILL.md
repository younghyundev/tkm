---
description: "Tokenmon CLI. status, party, pokedex, region, items, achievements, dashboard, stats, notifications. Korean: 상태 확인, 파티, 도감, 지역, 아이템, 업적, 대시보드, 통계, 알림, 포켓몬, tokenmon"
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
| `party suggest` | Suggest best party for current region |
| `party swap <slot> <name>` | Swap party slot with a box Pokémon |
| `party reorder <from> <to>` | Reorder party positions |
| `box` | View stored Pokémon in box |
| `unlock list` | List unlocked Pokémon |
| `evolve` | List Pokémon ready to evolve |
| `evolve <name>` | Evolve a Pokémon (choose branch if applicable) |
| `legendary` | View / select legendary Pokémon |
| `dashboard` | Full dashboard (region, party, weekly activity, events) |
| `stats` | Weekly + all-time stats |
| `notifications` | View pending notifications |
| `notifications clear` | Clear all notifications |
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
