---
description: "Tokenmon data reset. Clear all Pokémon, achievements, items and start fresh. Korean: reset, 초기화, 리셋, 처음부터"
---

# Tokenmon Reset

Reset all tokenmon data. Cheat log is preserved.

## Steps

### Step 1: Confirm

Use AskUserQuestion to confirm with the user:

> **Warning**: All tokenmon data will be reset.
> - Pokémon, levels, XP
> - Achievements, Pokédex
> - Items, battle records
> - Party settings, region
>
> Only the cheat log is preserved. Continue?

Options: [Reset everything] [Reset config only (keep Pokémon data)] [Cancel]

### Step 2a: Full Reset

If the user chose "Reset everything":

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/tokenmon.ts" reset --confirm
```

### Step 2b: Config-only Reset

If the user chose "Reset config only" — resets config but keeps Pokémon state:

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
"$P/bin/tsx-resolve.sh" "$P/src/cli/tokenmon.ts" config set starter_chosen false
"$P/bin/tsx-resolve.sh" "$P/src/cli/tokenmon.ts" config set current_region 1
```

### Step 3: Starter Re-selection Prompt

After reset, inform the user:

> Reset complete! Run `/tkm:setup` to choose your starter again.
