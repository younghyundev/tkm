---
description: "Tokenmon gym battle. Challenge gym leaders with your party in turn-based combat. Korean: 체육관, 배틀, 도전, gym, 관장"
---

Challenge a Tokenmon gym leader in turn-based battle. The battle runs inside Claude Code — status bar shows sprites and HP, conversation handles turns.

## Execute

### If `$ARGUMENTS` is `list`: show gym status

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/gym-list.ts"
```

Show the output to the user and stop.

### Otherwise: start a gym battle

**Step 1 — Initialize the battle:**

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
GEN=$(node -e "try{const g=JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(),'.claude/tokenmon/global-config.json'),'utf-8'));console.log(g.active_generation||'gen1')}catch{console.log('gen1')}")
GYM_ID="${ARGUMENTS:-}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --init --gym "${GYM_ID:-1}" --gen "$GEN"
```

Parse the JSON output. Show the battle messages to the user and the move menu.

**Step 2 — Battle loop:**

After showing the battle screen, ask the user which action to take (1-4 for moves, 5 for switch, 6 for surrender).

When the user responds with a number, execute:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --action $USER_ACTION
```

Parse the JSON output. The `status` field tells you what to do:

- `"ongoing"` — Show messages and menu, ask user for next action. Continue loop.
- `"victory"` — Show victory messages and badge info. Battle is over.
- `"defeat"` — Show defeat message. Battle is over.
- `"switch_menu"` — Show the switch options. Ask user which pokemon (by index). Then run `--action switch:N`.
- `"fainted_switch"` — Player's pokemon fainted. Show switch options. Run `--action switch:N`.

**Step 3 — After battle ends:**

The battle-turn.ts script automatically cleans up. Show the final result to the user. The status bar will return to normal party view on next refresh.

## JSON Output Format

```json
{
  "status": "ongoing",
  "messages": ["디아루가의 용의파동!", "효과가 굉장했다!"],
  "menu": "1.용의파동 2.파워젬 3.대지의힘 4.시간의포효\n5.교체 6.항복",
  "opponent": { "name": "꼬마돌", "species": 74, "level": 12, "hp": 20, "maxHp": 40 },
  "player": { "name": "디아루가", "species": 483, "level": 53, "hp": 169, "maxHp": 169 }
}
```

## Display Guidelines

- Show messages naturally in conversation, one per line
- Show the move menu clearly so the user knows their options
- Keep responses SHORT — just the battle info and a prompt for the next action
- Do NOT add commentary or strategy advice unless asked
- The status bar automatically shows sprites and HP bars during battle

## Usage

| Command | Description |
|---------|-------------|
| `/tkm:gym` | Challenge next uncleared gym |
| `/tkm:gym 3` | Challenge gym #3 |
| `/tkm:gym list` | Show all gyms and badge status |
