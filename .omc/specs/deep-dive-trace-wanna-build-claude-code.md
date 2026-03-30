# Deep Dive Trace: wanna-build-claude-code

## Observed Result
New plugin build request: **Tokénmon** — a Claude Code plugin where Pokémon sounds play on session events, a Pokémon sprite appears in the status bar, tokens consumed = XP → evolution, achievement system unlocks new Pokémon, and lineup management (up to 6) with subagent-to-Pokémon assignment.

## Ranked Hypotheses

| Rank | Hypothesis | Confidence | Evidence Strength | Why it leads |
|------|------------|------------|-------------------|--------------|
| 1 | Standalone audio via PowerShell+WAV is feasible without peon-ping | High | Strong | peon-ping's own relay.sh uses this exact pattern; PowerShell universally present on WSL2 Windows hosts |
| 2 | Token counts are NOT in hook payloads — live in JSONL transcripts | High | Strong | All hook payload schemas lack token fields; OMC HUD reads tokens by JSONL parsing, not hook stdin |
| 3 | Status bar supports single-line Unicode avatar only, NOT multi-row pixel art | High | Strong | safeMode:true strips block chars; maxOutputLines:4 caps vertical space; Braille chars survive safe mode but need 3+ rows |
| 4 | SubagentStart/Stop hooks provide stable `agent_id` for per-agent Pokémon assignment | High | Strong | subagent-tracker.mjs already implements this exact pattern and is the direct model |

## Evidence Summary by Hypothesis

- **Audio (Standalone)**: `relay.sh` implements WSL2 audio via `wslpath -w` → `powershell.exe win-play.ps1 <wav_path> <vol>`. WAV plays natively via `System.Windows.Media.MediaPlayer` with zero external deps. Hook runs `async: true` with 10s timeout — sufficient for PowerShell startup + playback. OGG/MP3 requires `ffplay`/`mpv` on Windows PATH; WAV does not.
- **Token XP**: All hook payload schemas (confirmed across peon.sh, OMC hooks source, hook-handle-use.sh, notify-chain.sh) contain only event metadata — no `input_tokens`, `output_tokens`, or `costUSD` fields. Token data lives in `~/.claude/projects/<hash>/<session-id>.jsonl` under `message.usage`. OMC HUD's `extractLastRequestTokenUsage()` reads it from JSONL, not hook stdin. PreCompact hook payload exposes `transcript_path` directly.
- **Status bar sprites**: `sanitize.js` strips `█░▓▒` → ASCII in `safeMode:true` (default). Braille chars (⣿⣦) survive the strip list but require 3+ rows per sprite. `maxOutputLines:4` shared across all HUD elements leaves no budget for multi-row art. Single-line representations (ANSI-colored text, emoji, `▀▄` half-blocks with safeMode off) are feasible.
- **Multi-agent assignment**: `subagent-tracker/index.js` reads `agent_id`, `agent_type`, `session_id`, `model` from SubagentStart payload. Writes to `.omc/state/subagent-tracking.json`. HUD polls this file every render cycle. New hook on SubagentStart can write `agent_id → pokémon_name` to a parallel state file; HUD agents.js element reads it.

## Evidence Against / Missing Evidence

- **Audio**: No confirmed audio tool list from WSL2 (aplay/paplay/mpg123 presence unverified). PowerShell path in hook execution context not directly probed. MP3/OGG cry files require ffplay on Windows PATH — not guaranteed on vanilla Windows.
- **Token XP**: Stop hook payload schema not definitively confirmed at tier-1. Small chance the Stop event carries a `costUSD` summary that no existing hook consumes (probe needed).
- **Status bar**: `safeMode:false` carries known terminal corruption risk (Issue #346). Ink re-render concurrency with Unicode glyphs in WSL2 terminal unverified. `agent_type` in SubagentStop is unreliable — must key on `agent_id`.
- **Multi-agent**: No existing field in SubagentStart payload carries "Pokémon slot" concept — mapping layer must be authored.

## Per-Lane Critical Unknowns

- **Lane 1 (audio)**: Whether `powershell.exe` is on `$PATH` in the hook shell execution context (vs. requiring hardcoded fallback path `/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe`)
- **Lane 2 (state/XP)**: Whether the `Stop` hook event payload includes any token summary field (`costUSD`, `total_input_tokens`) that existing hooks simply don't parse — determines if XP is pure-hook-driven or requires a JSONL reader step
- **Lane 3 (status bar/agents)**: Whether single-row Unicode glyphs (emoji or Braille) cause Ink re-render concurrency conflicts on this WSL2 terminal setup

## Rebuttal Round

- **Best rebuttal to standalone audio**: PowerShell startup latency (1–3s) + WPF MediaPlayer init (~1–5s) = up to 8s per audio event. Within the 10s hook timeout, but leaves little margin and may feel laggy.
- **Why it holds**: Use `async: true` hook execution — audio fires non-blocking and the 10s timeout doesn't block the session. Same pattern peon-ping uses.
- **Best rebuttal to JSONL-based XP**: JSONL parsing at every PostToolUse would be slow (file read + parse on every tool call).
- **Why it holds**: Parse only at PreCompact (when `transcript_path` is in payload) or at Stop. Use PostToolUse event-count as fast coarse XP; reconcile with exact JSONL token counts at session end.

## Convergence / Separation Notes

- Lane 2's H1 (no tokens in payloads) and H2 (tool calls as proxy) are complementary, not competing. Best architecture uses both: coarse XP from PostToolUse count (real-time) + precise token XP from JSONL at session end (reconciliation).
- Lane 1 standalone and peon-ping relay are genuinely distinct architectures but can coexist: try relay first (peon-ping running), fall back to standalone PowerShell.

## Most Likely Explanation

**Tokénmon is fully implementable as a standalone plugin** following the peon-ping architectural pattern:
1. **Audio**: Shell hook → `wslpath -w` → `powershell.exe` → MediaPlayer (WAV assets). Optional peon-ping relay fallback.
2. **XP**: Hybrid — PostToolUse event counter for real-time XP, JSONL transcript parse at PreCompact/Stop for exact token totals. Flat JSON state persistence.
3. **Status bar**: Single-row avatar per Pokémon (ANSI-colored name + emoji or half-block mini-sprite). Extend OMC HUD's agents element to show assigned Pokémon.
4. **Multi-agent**: SubagentStart hook writes `agent_id → pokémon_slot` to state file; HUD agents.js reads and displays. Lineup slots assigned round-robin.

## Critical Unknown

Whether the Stop hook payload exposes token summary data. This determines the simplest XP architecture path (pure-hook vs. JSONL-reader). Low-cost probe: add `cat > /tmp/tokenmon-stop-payload.json` as a Stop hook for one session.

## Recommended Discriminating Probe

Two probes in parallel:
1. **Audio probe**: Register a Stop hook that runs `wslpath -w <known-wav-path>` and invokes `powershell.exe -File tokenmon-play.ps1 <win_path>` directly. Confirms standalone audio chain.
2. **Token probe**: Register `cat > /tmp/tokenmon-stop-payload.json` as Stop hook. Inspect output for token fields. If present → pure-hook XP. If absent → JSONL reader needed at PreCompact.
