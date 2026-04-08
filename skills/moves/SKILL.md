---
description: "Tokenmon move management. View and swap pokemon moves. Korean: 기술, 무브, 스킬, moves"
---

View and manage Tokenmon moves.

## Execute

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/moves.ts" $ARGUMENTS
```

## Usage

| Command | Description |
|---------|-------------|
| `/moves` | Show moves for all party pokemon |
| `/moves <name>` | Show moves for specific pokemon |
| `/moves <name> swap <slot> <moveId>` | Swap a move slot |
| `/moves <name> list` | Show all learnable moves |
