# Tokenmon

Gen 4 Pokemon XP gamification plugin for Claude Code. Train and evolve Sinnoh-region Pokemon as you code.

Gen 4 포켓몬 기반 Claude Code 경험치 플러그인. 코딩하면서 신오지방 포켓몬을 키우세요.

```
 +-----------------------------------------+
 | Lv.24 팽태자  [=====>      ] 1240/2000 XP |
 | ▓▓░░▓▓  Water / Steel                    |
 | Session: 8,450 tokens -> +84 XP          |
 +-----------------------------------------+
```

## Installation

### Marketplace (recommended)

From within a Claude Code session:

```
/plugin marketplace add ThunderConch/tokenmon
/plugin install tokenmon@tkm
/reload-plugins
/tkm:setup
```

The setup command will:
1. Install dependencies (npm install)
2. Guide you to choose a starter Pokemon (모부기, 불꽃숭이, or 팽도리)
3. Initialize your trainer data

After setup, your Pokemon will appear in the status line and start gaining XP.

### Standalone

For manual installation without the marketplace:

```bash
git clone https://github.com/ThunderConch/tokenmon.git
cd tokenmon
npm install
npx tsx install-standalone.ts
```

### Uninstall

```
/plugin uninstall tokenmon@tkm
```

### Requirements

- Claude Code v2.1+
- Node.js >= 22.0.0

## Features

- Token-based XP system (input + output tokens counted, cache excluded)
- 6 Pokemon experience groups from the original games (Medium Fast, Medium Slow, Slow, Fast, Erratic, Fluctuating)
- Evolution system with level-based triggers
- Achievement system that unlocks new Pokemon
- Terminal sprite rendering (half-block ANSI art)
- Pokemon cry audio playback (cross-platform)
- Status line integration showing active Pokemon

## Commands

- `/tokenmon` or `/tokenmon status` — View party status
- `/tokenmon party` — Detailed party view
- `/tokenmon achievements` — Achievement progress

## How It Works

Tokenmon hooks into 6 Claude Code events:

- **SessionStart** — Initialize session, display party
- **Stop** — Parse JSONL token data, award XP, check evolution
- **PermissionRequest** — Track permission grants
- **PostToolUseFailure** — Track errors for achievements
- **SubagentStart** — Assign Pokemon to subagents
- **SubagentStop** — Collect subagent token data

Token usage (input + output, excluding cache) is converted to XP at a configurable rate (default: 100 tokens = 1 XP). Each Pokemon species follows its original experience group formula for leveling.

## Configuration

Settings are stored in `~/.claude/tokenmon/config.json`:

| Option | Default | Description |
|--------|---------|-------------|
| tokens_per_xp | 100 | Tokens required per 1 XP |
| volume | 0.5 | Cry playback volume (0-1) |
| sprite_enabled | true | Show terminal sprites |
| cry_enabled | true | Play Pokemon cries |
| max_party_size | 6 | Maximum party members |

## Pokemon

Six evolution lines from the Sinnoh region (Gen 4):

| Line | Type | Experience Group |
|------|------|-----------------|
| 모부기 → 수풀부기 → 토대부기 | Grass / Ground | Medium Slow |
| 불꽃숭이 → 파이숭이 → 초염몽 | Fire / Fighting | Slow |
| 팽도리 → 팽태자 → 엠페르트 | Water / Steel | Medium Slow |
| 새박이 → 찌르버드 → 찌르호크 | Normal / Flying | Medium Fast |
| 꼬지모 → 럭시오 → 럭시레이 | Electric | Medium Fast |
| 리오르 → 루카리오 | Fighting / Steel | Medium Slow |

## License

MIT
