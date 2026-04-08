# Tokenmon Battle System Design

> Turn-based battle engine with gym system, move mechanics, and TUI interface.
> Full roadmap covers PvP and endgame content.

## Overview

Tokenmon gains a turn-based battle system. Wild encounters remain auto-battle (unchanged). Turn-based combat is reserved for **gym battles** (Phase 1) and **PvP** (Phase 2).

Battles run in a **separate TUI process** — no token consumption. Claude Code spawns the process on `/gym`, results are written back to Tokenmon state on completion.

## Phase 1 Scope

- Move (skill) data system
- Turn-based battle engine
- Custom ANSI TUI battle screen
- Gym leader content (mainline game data)
- Move learning + `/moves` management command

## Architecture

### Move Data System

```ts
interface Move {
  id: number;            // PokeAPI ID
  name: string;          // English name (thunderbolt)
  nameKo: string;        // Korean name (10만볼트)
  type: PokemonType;     // electric
  category: 'physical' | 'special' | 'status';
  power: number | null;  // 90 (null for status moves)
  accuracy: number | null;
  pp: number;
  effect: MoveEffect;
}
```

**Move effects (v1):** Pure damage only. No status conditions, no stat changes.

```ts
// v1: damage only
type MoveEffect = { kind: 'none' };
```

**Per-Pokémon move selection:**
- Source: PokeAPI level-up learnset
- Curate 4-6 representative moves per Pokémon at build time (this is the learnable pool; Pokémon knows up to 4 at a time)
- Selection criteria: STAB priority, type coverage diversity, power balance
- v1: only curate physical/special moves (status moves are useless without status effects)
- Output: static JSON file, no runtime API calls

**Move learning flow:**
- Auto-learn on level-up (if Pokémon has a move at that level in curated set)
- If > 4 moves, auto-replace lowest power move
- `/moves` command: view learnable moves, manually swap move slots

### Battle Engine

**Damage formula (mainline simplified):**

```
damage = ((2 * level / 5 + 2) * power * atk / def) / 50 + 2
       × STAB (1.5 if move type matches Pokémon type)
       × typeEffectiveness (0.25 / 0.5 / 1 / 2 / 4)
       × random (0.85 ~ 1.0)
```

- Physical moves: use atk / def stats
- Special moves: use spAtk / spDef stats
- Stats: base stats (species values) + level-based calculation (existing Tokenmon system)

**Turn options:**
1. Skill 1-4 (select a move)
2. Switch (swap active Pokémon)
3. Surrender (forfeit with confirmation prompt)

No items in battle. No flee option.

**Turn resolution order:**
1. Both sides choose action
2. Priority: switch > move (higher speed goes first)
3. First action executes → apply damage
4. Second action executes → apply damage
5. End-of-turn processing (PP reduction)
6. If fainted → force switch to next Pokémon

**Surrender confirmation:**
```
정말 항복하시겠습니까?
1. 예    2. 아니오
```
Surrender = immediate defeat, battle ends.

**Gym leader AI:**
- Prioritize super-effective moves against player's active Pokémon
- Small randomness factor to avoid perfect play
- No switching logic in v1

### TUI Battle Screen

**Execution flow:**
1. `/gym` or `/gym <number>` in Claude Code
2. Spawn process: `node battle-tui.js`
3. Battle runs in full terminal (custom ANSI rendering)
4. Battle ends → result JSON returned → Tokenmon state updated (XP, badges, etc.)

**Screen layout:**
```
═══════════════════════════════════════
  웅의 체육관 — 바위 타입 전문
═══════════════════════════════════════

  [Enemy Braille Sprite]
  꼬마돌 Lv.12        HP ████████░░

          [Player Braille Sprite]
          파이리 Lv.14  HP ██████████

───────────────────────────────────────
  파이리의 불꽃세례!
  효과가 굉장했다!
───────────────────────────────────────
  1. 불꽃세례     2. 할퀴기
  3. 연막         4. 불대문자
          5. 교체    6. 항복
═══════════════════════════════════════
```

**Rendering:**
- Reuse existing Braille sprite engine
- ANSI color for HP bars, type indicators
- `process.stdin` raw mode for numeric key input (1-6)

**Integration with Tokenmon:**
- Battle TUI reads party data from existing state files
- On battle end, writes results (XP gained, badges earned, PP consumed) back to state
- Claude Code hook detects process exit and resumes normal session

### Gym Content

**Data source:** PokeAPI — mainline game gym leaders

**Structure per gym:**
```ts
interface Gym {
  id: number;
  leader: string;       // Brock, Misty, Lt. Surge...
  leaderKo: string;     // 웅, 이슬, 마티스...
  type: PokemonType;    // rock, water, electric...
  badge: string;
  team: GymPokemon[];   // 3 Pokémon per leader
  region: string;
}

interface GymPokemon {
  species: number;      // Pokédex number
  level: number;
  moves: number[];      // Move IDs (4 moves)
}
```

**Battle rules:**
- Leader: 3 Pokémon
- Challenger: full party (up to 6)
- Victory reward: badge + XP for all participating Pokémon (XP = gym leader's highest level Pokémon × 50)
- Defeat: no penalty, retry allowed
- Re-challenge cleared gyms: allowed, XP reward at 50% rate, no duplicate badge

**Progression:** Linear gym order per region, matching Tokenmon's existing region system.

## Phase 2: PvP (Documented, Not Implemented)

### Server Architecture
- Central server for party registration, matchmaking, result delivery
- Async flow: register party → server matches → battle simulated → results notified
- Sync option remains open (reversible decision point)

### Anti-Cheat
- Server-side validation on party registration
- XP history / growth log-based validity check
- Reject abnormal stats (impossible level/XP ratios)
- Phase 1 is local-only, so anti-cheat is deferred (cheating only hurts own experience)

### PvP Battle
- Turn-based with same engine as gym battles
- Async: pre-set strategy or AI-driven decisions
- Sync: real-time turn exchange (design TBD)

## Phase 2+: Endgame Content

### Seasonal Challenges
- After all story gyms cleared, unlock rotating challenge gyms
- Diablo rift-style: scaling difficulty tiers
- Server-generated, periodic refresh (weekly/daily)
- Leaderboard potential

## Move Effects Roadmap

| Version | Effects | Status |
|---------|---------|--------|
| v1 | Pure damage only (type effectiveness + STAB) | Phase 1 |
| v2 | Status conditions: paralysis, burn, poison | Backlog |
| v3 | Stat changes, healing, recoil | Backlog |

## Milestones

| Milestone | Content | Phase |
|-----------|---------|-------|
| **M1: Move System** | PokeAPI move data script, per-Pokémon 4-6 move curation, JSON generation | Phase 1 |
| **M2: Battle Engine** | Damage calc, turn resolution, switching, faint handling, gym leader AI | Phase 1 |
| **M3: TUI** | Custom ANSI battle screen, Braille sprites, input handling | Phase 1 |
| **M4: Gym Content** | Mainline gym leader data (PokeAPI), badge system, rewards | Phase 1 |
| **M5: Move Learning** | Level-up auto-learn, `/moves` command, move swap UI | Phase 1 |
| **M6: PvP Server** | Central server, party registration, matchmaking, result notification | Phase 2 |
| **M7: Anti-Cheat** | Server-side validation, XP history verification | Phase 2 |
| **M8: Endgame** | Seasonal challenges, difficulty scaling, leaderboards | Phase 2+ |

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Battle UI | Separate TUI process | No token consumption; battles shouldn't cost money |
| TUI framework | Custom ANSI (no library) | Fixed layout doesn't need React/Ink overhead; Braille engine already exists |
| Move data | PokeAPI, curated at build time | Real move names for authenticity, limited set for manageable scope |
| Gym leaders | Mainline game data | Free balance, player recognition, rich data available |
| Move effects | Phased rollout (v1: damage only) | Start minimal, layer complexity incrementally |
| Wild battles | Unchanged (auto-battle) | Turn-based in coding flow would break concentration |
| Items in battle | Not included | Simplify turn options; add later if needed |
