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
"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --init --gym "${GYM_ID:-auto}" --gen "$GEN"
```

Parse the JSON output. Read `sessionId`, `phase`, `status`, `questionContext`, `moveOptions`, `partyOptions` (fallback `switchOptions` only if `partyOptions` is absent), `animationFrames`, and `currentFrameIndex`. Do NOT parse or trust the legacy `menu` string.

**Step 2 — Non-negotiable input rule:**

During battle, ALWAYS use **AskUserQuestion** for action selection. Never infer actions from plain chat. If the user types `1`, `공격`, `교체`, or anything else in free chat during battle, ignore it as a battle command and re-open the correct AskUserQuestion UI.

**Step 3 — Action-select flow (`status=="ongoing"` and `phase=="select_action"`):**

Build AskUserQuestion options from `moveOptions` only:
- Show exactly `min(moveOptions.length, 4)` move-slot options.
- Each label must be `{index}. {nameKo} ({pp}/{maxPp})`.
- Use a brief description only if type/power is actually known from the JSON/context.
- Never add switch or surrender as buttons. Never show slots 5 or 6 as buttons.
- If a move has `disabled: true`, keep it visibly unavailable for that slot instead of replacing it with another action.

Then ask the user via AskUserQuestion and rely on the auto-provided `Other` field for non-move intents.

All battle-turn invocations below use the same launcher as Step 1:
`"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" <flags>` — keep `$P` in scope from the initialization shell block.

Parse the AskUserQuestion answer like this:
- Button `1`-`4` on a shown move slot: run `"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --action <index>`.
- `Other` text: trim and lowercase it.
- `Other` matching `/^(교체|switch|change|s)$/i`: enter switch flow.
- `Other` matching `/^(항복|surrender|quit|giveup|gg)$/i`: enter surrender confirm flow.
- Anything else: show `알아들을 수 없어. 기술 버튼을 누르거나 "교체" / "항복" 을 입력해줘.` and re-ask the same AskUserQuestion.

**Step 4 — Switch flow (`switch_menu`):**

To open the switch menu, run:

```bash
"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --action 5
```

Parse the returned JSON and read `partyOptions[]` first, or `switchOptions` only as a fallback. Then make a SECOND AskUserQuestion:
- Show up to 4 party members.
- Label each live option as `{index}. {nameKo} HP:{hp}/{maxHp}`.
- If a member is fainted, mark that slot unavailable or note `기절`; do not offer it as a valid switch target.
- If more than 4 live members exist, mention `그 외는 이름으로 입력해줘` and rely on `Other`.

Parse the second AskUserQuestion answer like this:
- Button on a listed live member: run `"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --action switch:<index>`.
- `Other` text: fuzzy match `nameKo` by lowercase exact match or substring match.
- No match: re-ask the same switch AskUserQuestion.

**Step 5 — Surrender flow:**

AskUserQuestion:
- Question: `정말 항복할거야? 체육관 재도전 패널티가 있을 수 있어.`
- Options: `항복 확정`, `취소`

If confirmed, run:

```bash
"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --action 6
```

If cancelled, return to the same action-select AskUserQuestion.

**Step 6 — Forced switch flow (`status=="fainted_switch"`):**

Use the same party AskUserQuestion as the switch flow, but do not allow cancel or return to action-select. The user must choose a live party member or type a valid name in `Other`, then run:

```bash
"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --action switch:<index>
```

The CLI handles this forced switch without an extra AI turn.

**Step 7 — Animation pump after every `--action` call:**

After every action command that returns JSON, inspect `animationFrames[]`.
- If `animationFrames.length == 0`, continue immediately based on the returned `status` and `phase`.
- If frames exist, drive the pump loop strictly from the JSON contract:
  1. For each frame index `i` from `0` to `animationFrames.length - 1`, sleep for `animationFrames[i].durationMs / 1000`.
  2. After each sleep, run `"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --refresh --frame <i> --session <sessionId>`.
  3. Ignore refresh stdout unless it returns `status=="rejected"`.
  4. After the loop, run `"$P/bin/tsx-resolve.sh" "$P/src/cli/battle-turn.ts" --refresh --finalize --session <sessionId>`.

After finalize, continue from the post-turn JSON state:
- `ongoing` + `select_action`: return to the move AskUserQuestion.
- `switch_menu`: run the switch flow above.
- `fainted_switch`: run the forced switch flow above.
- `victory`: show victory messages and badge info, then stop.
- `defeat`: show defeat message, then stop.

**Step 8 — After battle ends:**

The battle-turn flow cleans up automatically. Show the final result to the user. The status bar returns to the normal party view on the next refresh.

## JSON Output Contract

```json
{
  "sessionId": "battle-session-id",
  "phase": "select_action",
  "status": "ongoing",
  "questionContext": "⚔️ vs 꼬마돌 Lv.12 HP:20/40 | 디아루가 Lv.53 HP:169/169",
  "moveOptions": [
    { "index": 1, "nameKo": "용의파동", "pp": 10, "maxPp": 10, "disabled": false }
  ],
  "partyOptions": [
    { "index": 2, "nameKo": "디아루가", "hp": 169, "maxHp": 169, "fainted": false }
  ],
  "animationFrames": [
    { "kind": "hit", "durationMs": 150, "target": "opponent" },
    { "kind": "flash", "durationMs": 200, "target": "opponent", "effectiveness": "super" },
    { "kind": "drain", "durationMs": 800, "playerHp": 169, "opponentHp": 18 },
    { "kind": "drain", "durationMs": 600, "playerHp": 169, "opponentHp": 12 }
  ],
  "currentFrameIndex": 0
}
```

## Display Guidelines

- Show battle messages naturally in conversation, one per line.
- Keep prompts SHORT and UI-driven: messages plus the next AskUserQuestion.
- Respect `questionContext` when wording the question, but never use chat parsing instead of AskUserQuestion.
- Do NOT add commentary or strategy advice unless asked.
- The status bar automatically shows sprites and HP bars during battle.

## Usage

| Command | Description |
|---------|-------------|
| `/tkm:gym` | Challenge next uncleared gym |
| `/tkm:gym 3` | Challenge gym #3 |
| `/tkm:gym list` | Show all gyms and badge status |
