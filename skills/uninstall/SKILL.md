---
description: "Tokenmon pre-uninstall cleanup. Clean statusLine and data files before /plugin uninstall. Korean: uninstall, 제거, 삭제, 지우기"
---

# Tokenmon Uninstall

Clean up tokenmon before removing the plugin. Always run this **before** `/plugin uninstall`.

## Steps

### Step 1: Cleanup

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.ts"
```

### Step 2: Inform User

> tokenmon data has been cleaned up.
>
> To fully remove the plugin, run:
> ```
> /plugin uninstall tkm@tkm
> ```
>
> Then run `/reload-plugins` to apply.

## Option: Keep Pokémon Data

To preserve Pokémon state (state.json) for a future reinstall:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.ts" --keep-state
```

> state.json preserved. Reinstalling later will restore your existing Pokémon.
