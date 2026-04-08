# Setup Overhaul: Hybrid CLI + SKILL.md

**Date:** 2026-04-07 (revised)
**Type:** Brownfield refactor
**Spec:** `.omc/specs/deep-interview-setup-overhaul.md`
**Ambiguity:** 17.3% (PASSED)
**Revision:** R2 — Critic feedback applied (2 major, 1 minor)

---

## RALPLAN-DR

### Principles

1. **User time is sacred** — Minimize interactive prompts to only genuine preference decisions (gen/lang/starter). Everything auto-detectable must be auto-detected.
2. **CLI as orchestrator** — A single CLI command should handle all automated steps with progress output, replacing Claude's multi-tool-call overhead.
3. **Backward compatibility** — Existing user data, config, and statusline setups must survive a re-run of setup.
4. **Fail-forward defaults** — Smart defaults (braille, sprite_mode=all, info_mode=ace_full, sound auto-config) let users start fast and customize later via `tokenmon config set`.

### Decision Drivers

1. **Setup speed** — Current 60-100s must drop to <30s (excluding user decision time).
2. **Question count** — 6-7 prompts down to 3 (generation, language, starter).
3. **Generation bug** — All available generations must appear in selection, not hardcoded 2.

### Viable Options

#### Option A: Hybrid CLI + SKILL.md (Recommended)

SKILL.md asks 3 questions via AskUserQuestion, then delegates to `tokenmon setup --gen X --lang Y --starter Z` which handles all automation.

| Pros | Cons |
|------|------|
| Fastest path — single CLI call for all automation | Requires new `setup` subcommand in tokenmon.ts |
| SKILL.md becomes ~60 lines (from 289) | Two places to maintain setup logic (SKILL.md + CLI) |
| Progress output (`[1/N]...`) gives transparency | CLI must handle idempotency for re-runs |
| Testable — CLI setup steps can have unit tests | |

#### Option B: Pure SKILL.md optimization

Keep all logic in SKILL.md but reduce questions to 3 and hardcode smart defaults for the rest.

| Pros | Cons |
|------|------|
| No new CLI code needed | Still ~5 tool calls = ~20-30s overhead from Claude |
| Single source of truth | Cannot print step progress natively |
| | Cannot be tested with `npm test` |
| | Does not fix the fundamental speed issue |

**Invalidation rationale for Option B:** The core speed problem is Claude's tool-call overhead per step (~5-8s each). Even with fewer questions, 5+ Bash tool calls remain for npm install, statusline, renderer, sprites, config. Option B cannot meet the <30s target.

### Recommended: Option A — Hybrid CLI + SKILL.md

**Why:** Moves all automated work into a single CLI invocation, eliminating 5+ tool-call round trips. The CLI can print progress synchronously, is unit-testable, and SKILL.md shrinks to a thin orchestration layer.

### ADR

- **Decision:** Hybrid approach — SKILL.md for 3 interactive questions, CLI for all automation.
- **Drivers:** Speed (<30s), UX (3 questions), testability, generation bug fix.
- **Alternatives considered:** Pure SKILL.md optimization (Option B).
- **Why chosen:** Only Option A can meet the <30s target by eliminating tool-call overhead.
- **Consequences:** New `cmdSetup` function in tokenmon.ts (~120-170 lines); SKILL.md rewrite; new test file.
- **Follow-ups:** Consider adding `--interactive` flag to CLI setup for terminal-only usage without Claude.

---

## Context

Tokenmon's current setup (`skills/setup/SKILL.md`, 289 lines) asks 6-7 questions via AskUserQuestion and executes 7+ Bash tool calls through Claude. This takes 60-100 seconds and has a bug where only Gen 1 and Gen 4 appear in generation selection (hardcoded).

The new hybrid approach keeps SKILL.md as the entry point for 3 essential questions (generation, language, starter), then delegates all automated work to a single `tokenmon setup` CLI command.

## Work Objectives

1. Add `tokenmon setup --gen X --lang Y --starter Z` subcommand
2. Rewrite `skills/setup/SKILL.md` to 3 questions + 1 CLI call
3. Add tests for the new setup command
4. Verify backward compatibility and all existing tests pass

## Guardrails

**Must Have:**
- `tokenmon setup --gen gen4 --lang ko --starter 387` completes all automated steps
- CLI prints `[1/7]` through `[7/7]` progress for each step (migration check + 6 setup steps)
- Generation selection shows ALL generations from `gen list` output
- Setup completes in <30s (excluding user decision time)
- Existing user data preserved on re-run
- All existing tests pass (`npm test`)
- Migration state validated before proceeding (blocking issue #1)
- `setup-statusline.ts` invoked via `execSync` child process, NOT import (blocking issue #2)

**Must NOT Have:**
- No changes to `src/setup/postinstall.ts` (migration is separate)
- No changes to the hook system
- No new TUI library or interactive CLI prompts (questions stay in SKILL.md)
- No removal of `tokenmon config set` commands
- No direct import of `setup-statusline.ts` (has bare `main()` at line 124 causing side-effect execution)

---

## Task Flow

```
[Task 1: cmdSetup in tokenmon.ts]
         |
[Task 2: SKILL.md rewrite]
         |
[Task 3: Tests + Integration verification]
```

---

## Detailed TODOs

### Task 1: Add `cmdSetup` function to `src/cli/tokenmon.ts`

**What:** Create a new `cmdSetup(args)` function that accepts `--gen`, `--lang`, `--starter` flags and orchestrates all automated setup steps in sequence with progress output.

**Upfront flag validation (Architect non-blocking #5):**
Before any steps execute, validate all flags up front:
- `--gen` value must exist in available generations (check `data/` directory or `generations.json`)
- `--lang` value must be `en` or `ko`
- `--starter` value must be a valid Pokemon ID in the chosen generation's starter list
- If any validation fails, print a clean error message and exit immediately (before any state changes)

**Steps the CLI must perform (in order):**

1. `[1/7] Checking migration state...` — Verify `global-config.json` exists (the end-state of `migrateToMultiGen()` from `postinstall.ts`). If it does not exist and legacy root-level `state.json`/`config.json` files are present, print error: `"Run 'npm run postinstall' first to complete migration."` and exit. If `global-config.json` exists, print `done`. If fresh install (no legacy files, no global-config), create default `global-config.json` (matching `migrateToMultiGen()` fresh-install behavior).
   - **Why:** `migrateToMultiGen()` in `postinstall.ts` is not exported. Rather than extracting/duplicating it, `cmdSetup` validates that `postinstall` already ran successfully. This covers upgrading users from pre-multi-gen.

2. `[2/7] Switching generation...` — Parse `--gen` flag, call `gen switch` logic (reuse `cmdGen('switch', gen)` internals or call config directly)
   - **Idempotency:** If `active_generation` already equals `--gen` value, print `[2/7] Generation already set to gen4... skipped` and continue

3. `[3/7] Setting language...` — Parse `--lang` flag, write to config via `cmdConfigSet('language', lang)` path
   - **Idempotency:** If current language already equals `--lang` value, print `[3/7] Language already set to ko... skipped` and continue
   - **Locale init (Architect non-blocking #3):** After setting language, call `initLocale(lang, readGlobalConfig().voice_tone)` so all subsequent steps (4-7) use the correct locale AND preserve the user's custom voice tone setting. Import from `src/i18n/index.ts`.

4. `[4/7] Configuring statusline...` — Execute `setup-statusline.ts` as a **child process** via `execSync`
   - **CRITICAL (Architect blocking #2):** Do NOT import `setup-statusline.ts`. It has a bare `main()` call at line 124 that executes on import. Use `execSync('node <path>/setup-statusline.js', { stdio: 'inherit' })` to run it as a child process, matching the current SKILL.md pattern.
   - **Idempotency:** The statusline script already handles this internally (checks for existing statusline and returns early). No additional check needed.

5. `[5/7] Auto-detecting renderer...` — Call `detectRenderer()` from `src/core/detect-renderer.ts`, write `recommended` to config
   - `detect-renderer.ts` exports `detectRenderer()` cleanly (no bare `main()` call) -- safe to import directly.
   - **Idempotency:** If `renderer` config key is already set, print `[5/7] Renderer already configured... skipped` and continue

6. `[6/7] Selecting starter Pokemon...` — Parse `--starter` flag, call `cmdStarter(starterId)` logic
   - **Idempotency:** `cmdStarter` already checks `config.starter_chosen` and returns early with a warning (line 133). Print `[6/7] Starter already chosen... skipped` instead of letting `cmdStarter` print its own warning. Check `config.starter_chosen` before calling `cmdStarter`.

7. `[7/7] Applying defaults...` — Set `sprite_mode=all`, `info_mode=ace_full`, auto-configure sound based on environment detection (SSH/Docker/WSL check from current SKILL.md Step 5.5 logic)
   - **Idempotency:** If all default values are already set to expected values, print `[7/7] Defaults already applied... skipped` and continue

Print setup complete summary after all steps.

**File:** `src/cli/tokenmon.ts`
- Add `cmdSetup` function (~120-170 lines) near other cmd functions
- Add `case 'setup': cmdSetup(args.slice(1)); break;` to main dispatch switch (after line 1537)
- Parse flags: `--gen <value>`, `--lang <value>`, `--starter <value>`
- `initLocale` — already imported in tokenmon.ts (used at line 1535), no new import needed
- `readGlobalConfig` — already imported in tokenmon.ts (line 6), no new import needed
- Add import: `import { detectRenderer } from '../core/detect-renderer.js';` (new)
- Add import: `import { execSync } from 'node:child_process';` (new)
- Do NOT add import for `setup-statusline.ts` (use `execSync` instead)

**Progress output format:**
```
[1/7] Checking migration state...
  done
[2/7] Switching to gen4...
  done
[3/7] Setting language to ko...
  done
[4/7] Configuring statusline...
  done
[5/7] Auto-detecting renderer... braille
  done
[6/7] Selecting starter #387...
  done
[7/7] Applying defaults...
  sprite_mode=all, info_mode=ace_full, cry_enabled=true
  done
```

**Idempotent re-run output (Architect non-blocking #4):**
```
[1/7] Checking migration state... done
[2/7] Generation already set to gen4... skipped
[3/7] Language already set to ko... skipped
[4/7] Configuring statusline...
  Statusline already configured
  done
[5/7] Renderer already configured... skipped
[6/7] Starter already chosen... skipped
[7/7] Defaults already applied... skipped
```

**Flag parsing pattern** (consistent with existing `--sort`, `--keep-state` patterns in the file):
```typescript
function cmdSetup(args: string[]): void {
  let gen = '', lang = '', starter = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gen' && args[i + 1]) gen = args[++i];
    else if (args[i] === '--lang' && args[i + 1]) lang = args[++i];
    else if (args[i] === '--starter' && args[i + 1]) starter = args[++i];
  }
  if (!gen || !lang || !starter) {
    error('Usage: tokenmon setup --gen <gen_id> --lang <en|ko> --starter <pokemon_id>');
    process.exit(1);
  }

  // Upfront validation (Architect non-blocking #5)
  if (!['en', 'ko'].includes(lang)) {
    error(`Invalid language: ${lang}. Must be 'en' or 'ko'.`);
    process.exit(1);
  }
  // Validate gen exists in data/ directory
  // Validate starter is valid for chosen gen
  // ... then proceed to steps
}
```

**Acceptance criteria:**
- [ ] `tokenmon setup --gen gen4 --lang ko --starter 387` runs to completion without error
- [ ] Each step prints `[N/7]` progress line
- [ ] Step 1 validates migration state and exits with clear error if migration needed
- [ ] Invalid `--gen` value prints error and exits BEFORE any state changes
- [ ] Invalid `--lang` value prints error and exits BEFORE any state changes
- [ ] Invalid `--starter` value prints error and exits BEFORE any state changes
- [ ] Missing required flags prints usage help
- [ ] Re-running setup on existing data prints `skipped` for already-completed steps (idempotent)
- [ ] `setup-statusline.ts` called via `execSync`, NOT imported
- [ ] `initLocale(lang, readGlobalConfig().voice_tone)` called after step 2 so steps 3-6 use correct locale and preserve voice tone
- [ ] Sound auto-configured: WSL (not SSH) -> `cry_enabled=true`; SSH/Docker -> `relay_audio=true` + `relay_sound_root=tkm-sounds`; local -> `cry_enabled=true`

**Key imports to add** (only genuinely new ones — `initLocale` and `readGlobalConfig` are already imported in tokenmon.ts):
```typescript
import { execSync } from 'node:child_process';
import { detectRenderer } from '../core/detect-renderer.js';
// initLocale — already imported (line 1535 usage)
// readGlobalConfig — already imported (line 6)
// Do NOT import setup-statusline.ts — has bare main() at line 124
```

---

### Task 2: Rewrite `skills/setup/SKILL.md`

**What:** Replace the 289-line SKILL.md with a streamlined version: Step 0 (resolve root), 3x AskUserQuestion, 1x CLI call, 1x verification.

**File:** `skills/setup/SKILL.md`

**New structure (~60-70 lines):**

```
Step 0: Resolve Plugin Root (keep existing bash snippet)
Step 0.5: Install dependencies (pre-flight)
  - Run: cd "${CLAUDE_PLUGIN_ROOT}" && npm install --omit=dev 2>/dev/null
  - Why: The CLI binary requires installed deps. Fresh installs will fail without this.
  - This is a SKILL.md responsibility (not CLI) because the CLI itself cannot run without deps.
Step 1: AskUserQuestion — Generation
  - Run `tokenmon gen list` to get ALL available generations
  - Present output verbatim as options (fixes the hardcoded gen1/gen4 bug)
Step 2: AskUserQuestion — Language (en / ko)
Step 3: AskUserQuestion — Starter
  - Run `tokenmon starter` to get localized starter list
  - Present output verbatim
Step 4: Run CLI setup
  - `tokenmon setup --gen <chosen_gen> --lang <chosen_lang> --starter <chosen_id>`
Step 5: Verify with `tokenmon status`
  - Show result to user, confirm setup complete
```

**Acceptance criteria:**
- [ ] SKILL.md is under 80 lines
- [ ] `npm install --omit=dev` runs before any CLI calls (pre-flight for fresh installs)
- [ ] Exactly 3 AskUserQuestion calls (gen, lang, starter)
- [ ] Generation list comes from `gen list` output (not hardcoded)
- [ ] Starter list comes from `starter` output (not hardcoded)
- [ ] Single `tokenmon setup` CLI call handles all automation
- [ ] Verification step uses `tokenmon status`
- [ ] Uninstall notice preserved at bottom

---

### Task 3: Tests and Integration Verification

**What:** Add a test file for the new `cmdSetup` logic and verify all existing tests still pass.

**File:** `test/setup-cli.test.ts`

**Test cases:**
1. **Flag parsing** — Verify `--gen`, `--lang`, `--starter` are correctly parsed
2. **Missing flags** — Verify error + exit when required flags missing
3. **Upfront validation** — Verify invalid `--gen`, `--lang`, `--starter` caught before any state changes
4. **Invalid generation** — Verify error when `--gen` value not in generations.json
5. **Invalid starter** — Verify error when `--starter` not in starters list
6. **Migration check** — Verify step 1 detects missing `global-config.json` with legacy files present
7. **Environment detection for sound** — Verify SSH -> relay_audio, WSL -> cry_enabled, local -> cry_enabled
8. **Renderer auto-detection** — Verify `detectRenderer()` result is written to config
9. **Idempotency** — Verify re-running setup prints `skipped` messages and does not duplicate data or corrupt state
10. **Statusline invocation** — Verify `setup-statusline.ts` is called via `execSync` (not imported)

**Test pattern** (matches existing `node:test` + `node:assert/strict` pattern):
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
```

**Acceptance criteria:**
- [ ] `test/setup-cli.test.ts` has >= 7 test cases
- [ ] All new tests pass
- [ ] All existing tests pass (`npm test`)
- [ ] Manual smoke test: `tokenmon setup --gen gen4 --lang ko --starter 387` completes in <30s

---

## Architect Feedback Resolution Tracker

| # | Type | Issue | Resolution |
|---|------|-------|------------|
| 1 | **BLOCKING** | Migration check dropped from plan | Added Step 1: validate `global-config.json` exists; exit with clear error if legacy files need migration |
| 2 | **BLOCKING** | `setup-statusline.ts` has bare `main()` at L124 | Step 4 uses `execSync` child process call; explicit "Do NOT import" warnings in plan |
| 3 | Non-blocking | Locale initialization order | `initLocale(lang, readGlobalConfig().voice_tone)` called after Step 3 (language set), before Steps 4-7 |
| 4 | Non-blocking | Idempotent re-runs | Each step checks existing state first; prints `[N/7] ... skipped` if already done |
| 5 | Non-blocking | Upfront flag validation | All `--gen`, `--lang`, `--starter` validated before Step 1 begins; clean error messages |

## Critic Feedback Resolution Tracker (R2)

| # | Type | Issue | Resolution |
|---|------|-------|------------|
| 1 | **MAJOR** | `initLocale(lang)` missing `voiceTone` parameter | Changed all occurrences to `initLocale(lang, readGlobalConfig().voice_tone)` to preserve custom voice tone settings. Added `readGlobalConfig` import. |
| 2 | **MAJOR** | `npm install` step missing — fresh installs will fail | Added Step 0.5 in SKILL.md: `cd "${CLAUDE_PLUGIN_ROOT}" && npm install --omit=dev 2>/dev/null` as pre-flight before CLI call. Belongs in SKILL.md since CLI binary itself requires installed deps. |
| 3 | Minor | Step count numbering inconsistent (`[0/7]` through `[7/7]` = 8 lines) | Renumbered to `[1/7]` through `[7/7]` (1-indexed, 7 steps). Updated all step definitions, progress output examples, and cross-references. |

---

## Success Criteria

1. `tokenmon setup --gen gen4 --lang ko --starter 387` completes all 7 steps (migration check + 6 setup steps) with `[N/7]` progress output
2. SKILL.md reduced from 289 lines to <80 lines with exactly 3 AskUserQuestion calls
3. All generations shown in setup selection (bug fixed)
4. Setup completes in <30 seconds (excluding user think time)
5. Existing user data preserved on re-run (idempotent with `skipped` messages)
6. Migration state validated for upgrading users (step 1)
7. All tests pass (`npm test`)
