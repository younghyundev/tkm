---
description: "Tokenmon initial setup. Install dependencies, StatusLine integration, starter Pokémon selection. Korean: 초기 설정, 설치, 시작, tokenmon"
---

Run Tokenmon plugin initial setup in order.

## Step 0: Verify Environment

```
echo "CLAUDE_PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT}" && test -n "${CLAUDE_PLUGIN_ROOT}" && test -f "${CLAUDE_PLUGIN_ROOT}/package.json" && echo "OK" || echo "FAIL"
```

- `OK` → proceed to Step 1.
- `FAIL` → inform the user:
  > `CLAUDE_PLUGIN_ROOT` is not set or package.json not found. This skill can only run in a Claude Code plugin environment.

## Step 1: Install Dependencies

```
cd "${CLAUDE_PLUGIN_ROOT}" && npm install
```

On success proceed to Step 2. On failure show the error.

## Step 2: StatusLine Integration

Handles coexistence with other plugins that may already use StatusLine.

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/setup/setup-statusline.ts"
```

- No existing statusLine: registers tokenmon directly.
- Existing statusLine found: creates a wrapper at `~/.claude/tokenmon/status-wrapper.mjs` and updates settings.json.
- Already configured: skips.

Show any errors to the user.

## Step 3: Check for Starter Pokémon

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

If the party already has a Pokémon, skip to Step 4.

Otherwise use AskUserQuestion to let the user choose one of 3 starters:

1. Turtwig (Grass) — 모부기
2. Chimchar (Fire) — 불꽃숭이
3. Piplup (Water) — 팽도리

## Step 4: Initialize Starter

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" starter <pokemon_name>
```

Pass the Pokémon name in the user's chosen language (e.g. `Turtwig` or `모부기`).

## Step 4.5: Renderer Selection

Detect available renderers:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/setup/detect-and-list-renderers.ts"
```

Example output:
```
1. [Recommended] Kitty Graphics Protocol (best quality, native PNG) (kitty)
2. Braille (classic, compatible with all terminals) (braille)
```

Use AskUserQuestion:

> How would you like to render Pokémon sprites?

Then run:
```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set renderer <kitty|sixel|iterm2|braille>
```

If the selected renderer is not `braille`, pre-generate sprites:
```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/generate-png-sprites.ts" --renderer <selected>
```

Skip generation if sprites already exist or `braille` was selected.

## Step 5: Status Bar Display Settings

Use AskUserQuestion for sprite mode:

> How would you like to display Pokémon in the Status Bar?

Options:
1. All sprites (default) — Braille sprite for every party member
2. Ace only sprite — sprite for ace only, others omitted
3. All emoji — compact type emoji (1 line)
4. Ace emoji only — emoji for ace only

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set sprite_mode <all|ace_only|emoji_all|emoji_ace>
```

Then use AskUserQuestion for info mode:

> How would you like to display Pokémon info?

Options:
1. Ace full info (default) — ace: name/level/XP bar, others: name/level
2. All name/level only — compact, no XP bar
3. All full info — XP bar for every Pokémon
4. Ace level, others name only — most compact

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set info_mode <ace_full|name_level|all_full|ace_level>
```

## Step 6: Confirm Setup

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

Show the result to the user. If a Pokémon appears in the party, setup is complete.
Restart Claude Code to see tokenmon in the status bar.

## Uninstall Notice

Always inform the user after setup:

> **Note**: Before removing tokenmon later, run this first:
> ```
> /tkm:uninstall
> ```
> This cleans up statusLine config and data files.
> Skipping this step may leave errors in the status bar.
