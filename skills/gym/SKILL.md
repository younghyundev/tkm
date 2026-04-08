---
description: "Tokenmon gym battle. Challenge gym leaders with your party. Korean: 체육관, 배틀, 도전, gym"
---

Challenge a Tokenmon gym leader in turn-based battle.

## Execute

Determine the generation and gym ID, then launch the battle TUI:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"

# Get active generation
GEN=$(node -e "try{const g=JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(),'.claude/tokenmon/global-config.json'),'utf-8'));console.log(g.active_generation||'gen1')}catch{console.log('gen1')}")

# Default gym ID from args
GYM_ID="${ARGUMENTS:-}"

"$P/bin/tsx-resolve.sh" "$P/src/battle-tui/index.ts" --gym "${GYM_ID:-1}" --gen "$GEN"
```

## Usage

| Command | Description |
|---------|-------------|
| `/gym` | Challenge next uncleared gym |
| `/gym 3` | Challenge gym #3 |
| `/gym list` | Show all gyms and badge status |

If `$ARGUMENTS` is `list`, show gym status instead:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/gym-list.ts"
```
