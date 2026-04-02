---
description: "Automated Codex adversarial review→fix→retest loop. Runs 3 reviews (gen-addition, concurrency, stability), fixes all findings, retests until clean. Korean: 리뷰 루프, 자동 리뷰, adversarial, codex 리뷰"
---

# Review-Fix Loop

Automated adversarial review cycle for Tokénmon. Runs 3 Codex adversarial reviews in parallel, fixes all findings, adds tests, and repeats until all reviews pass.

## Prerequisites

- Codex plugin installed (`/codex:adversarial-review` available)
- Working build: `npm run build` passes
- Working tests: `npm test` passes

## The 3 Review Axes

1. **Gen Addition** — Future generation extensibility, data isolation, migration safety
2. **Concurrency** — Multi-session XP safety, lock contention, session binding durability
3. **Stability** — Overall system reliability, env compatibility, error handling

## Workflow

### Step 1: Verify baseline

```bash
npm run build && npm test
```

Both must pass before starting. Record the test count.

### Step 2: Run 3 adversarial reviews in parallel

Use `--base v0.2.1` to review all changes since the last stable release. Run all 3 as background tasks:

```
/codex:adversarial-review --base v0.2.1 다세대 시스템에서, 앞으로 세대 추가 가능성을 중점으로 리뷰. 세대 추가할때 걸리는 점은 없는지?
/codex:adversarial-review --base v0.2.1 다 세션 동시성 기준 평가
/codex:adversarial-review --base v0.2.1 전체 시스템 안정성 기준 평가
```

### Step 3: Collect and deduplicate findings

When all 3 complete, read each result. Create a consolidated table:

```
| # | Finding | Severity | Source | Status |
```

Deduplicate — the same issue often appears in multiple reviews. Mark duplicates.

### Step 4: Fix all findings

For each unique finding:
1. Investigate the actual code path referenced
2. Determine if the finding is valid (Codex can sometimes flag already-fixed code if it reviewed a stale diff)
3. If valid: fix the code
4. If the fix involves non-trivial logic: add a unit test
5. Run `npm run build && npm test` after each batch of fixes

Commit fixes (do NOT create tags or releases).

### Step 5: Retest

Run `npm run build && npm test` to confirm all tests pass.

### Step 6: Repeat from Step 2

Loop back to Step 2 and run the 3 reviews again on the updated code.

**Exit condition:** All 3 reviews return `verdict: "ok"` OR all findings are either:
- Already fixed (Codex flagging stale code)
- Acknowledged design tradeoffs (documented, not bugs)
- Low severity and not actionable

When the exit condition is met, report the final status:

```
=== Review Loop Complete ===
Iterations: N
Findings fixed: X
Tests added: Y
Final test count: Z
Verdict: CLEAN / ACKNOWLEDGED
```

## Important Rules

- **Never create tags or releases** — only commit and push
- **Always add tests** for non-trivial fixes
- **Validate findings** before fixing — Codex reviews stale diffs and can flag already-fixed code
- **Deduplicate across reviews** — same issue often appears in 2-3 reviews
- **Keep commits atomic** — one commit per logical fix batch, not one giant commit
