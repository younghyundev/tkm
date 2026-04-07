---
description: "Tokenmon initial setup. Install dependencies, StatusLine integration, starter Pokémon selection. Korean: 초기 설정, 설치, 시작, tokenmon"
---

Run Tokenmon plugin initial setup in order.

## Step 0: Resolve Plugin Root

```bash
export CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
echo "CLAUDE_PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT}" && test -n "${CLAUDE_PLUGIN_ROOT}" && test -f "${CLAUDE_PLUGIN_ROOT}/package.json" && echo "OK" || echo "FAIL"
```

- `OK` → proceed to Step 0.5.
- `FAIL` → inform the user:
  > `CLAUDE_PLUGIN_ROOT` could not be resolved. Install tokenmon first via `/plugin install tkm@tkm`.

## Step 0.5: Install Dependencies

```bash
cd "${CLAUDE_PLUGIN_ROOT}" && npm install --omit=dev 2>/dev/null
```

This must run before any CLI calls — the CLI binary requires installed dependencies.

## Step 1: Generation Selection

Run this command to list all available generations:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" gen list
```

Show the full `gen list` output to the user first. Then use AskUserQuestion:
- Question: "어떤 세대로 플레이하시겠습니까? Gen 1 (관동) ~ Gen 9 (팔데아) 중 선택할 수 있습니다."
- Options (3 popular + 1 manual entry):
  1. Gen 4 — 신오 (Sinnoh) — or the currently active gen if different
  2. Gen 1 — 관동 (Kanto)
  3. Gen 9 — 팔데아 (Paldea)
  4. "다른 세대 선택 (Gen 2~8)" with description "gen2, gen3, gen5, gen6, gen7, gen8 중 입력"
- If the user picks option 4, use their typed gen ID (e.g., `gen5`). The built-in "Other" option also remains available.

## Step 2: Language Selection

Use AskUserQuestion:
- English (default)
- 한국어 (Korean)

## Step 3: Starter Pokémon Selection

Run this command to get the localized starter list:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" starter
```

Use AskUserQuestion with the output verbatim — do NOT use your own knowledge of Pokémon names. Use the Pokémon **ID number** from the output.

## Step 4: Run Setup

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" setup --gen <chosen_gen> --lang <chosen_lang> --starter <chosen_id>
```

This single command handles: migration check, statusline, renderer auto-detection, starter initialization, and default configuration.

## Step 5: Verify

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

Show the output to the user. If a Pokémon appears, setup is complete.

Note: The user must restart Claude Code to see the statusline.

## Uninstall Notice

Always inform the user after setup:

> **Note**: Before removing tokenmon later, run this first:
> ```
> /tkm:uninstall
> ```
> This cleans up statusLine config and data files.
> Skipping this step may leave errors in the status bar.
