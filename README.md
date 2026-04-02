<div align="center">

# 🔴 Tokémon

**Train Pokémon while you code.**

A Gen 4 Pokémon XP gamification plugin for [Claude Code](https://claude.ai/code).
Earn XP from your coding sessions, level up, evolve, and catch 112 Sinnoh-region Pokémon.

[![Version](https://img.shields.io/badge/version-0.1.0--rc.0-blue.svg)](https://github.com/ThunderConch/tkm/releases/tag/v0.1.0-rc.1)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

**[English Guide](docs/README.en.md)** · **[한국어 가이드](docs/README.ko.md)**

<img src="sprites/raw/387.png" width="80" alt="Turtwig">&nbsp;&nbsp;
<img src="sprites/raw/390.png" width="80" alt="Chimchar">&nbsp;&nbsp;
<img src="sprites/raw/393.png" width="80" alt="Piplup">

</div>

---

<!-- Status bar in action (WSL + Braille renderer) -->
<p align="center">
  <img src="docs/screenshot.png" alt="tokenmon status bar (WSL, Braille renderer)">
  <br>
  <sub>Status bar with Braille renderer on WSL — Kitty/Sixel/iTerm2 renderers available for higher quality</sub>
</p>

## Quick Start

```bash
# In a Claude Code session:
/plugin marketplace add ThunderConch/tkm
/plugin install tkm@tkm
/reload-plugins
/tkm:setup
```

The setup wizard guides you through dependency install, starter selection (Turtwig / Chimchar / Piplup), and status bar config.

## Highlights

| | |
|---|---|
| **112 Pokémon** | Full Sinnoh Pokédex with 18 types |
| **9 Regions** | Unlock new areas as you catch more |
| **8 Legendary** | Unlock through Pokédex milestones & type mastery |
| **Branching Evo** | Kirlia → Gardevoir/Gallade, Snorunt → Glalie/Froslass |
| **Events** | Time-of-day type boosts, streak bonuses, milestone encounters |
| **Dashboard** | Full stats, streaks, weekly activity, active events |
| **21 Achievements** | Milestone rewards that unlock rare Pokémon |
| **6 XP Groups** | Authentic leveling curves from the original games |
| **Wild Encounters** | Battle and catch Pokémon mid-session |
| **ANSI Sprites** | Terminal-rendered Pokémon art (Braille / Kitty / Sixel / iTerm2) |
| **Cries & SFX** | Audio playback on level-up, evolution, and encounters |
| **i18n** | English and Korean (한국어) fully supported |

## Commands

```
/tkm:tkm status          # Party & stats
/tkm:tkm dashboard       # Full summary dashboard
/tkm:tkm stats           # Weekly + all-time stats
/tkm:tkm party           # Detailed party view
/tkm:tkm box             # View stored Pokémon
/tkm:tkm party suggest   # Region-optimized party
/tkm:tkm evolve          # Branching evolution
/tkm:tkm legendary       # Legendary Pokémon
/tkm:tkm pokedex         # Browse Pokédex
/tkm:tkm region list     # Explore regions
/tkm:tkm achievements    # Achievement progress
/tkm:tkm help            # Full command list
```

## Requirements

- Claude Code v2.1+
- Node.js ≥ 22.0.0

## Uninstall

```bash
/tkm:uninstall          # Clean up data & statusLine first
/plugin uninstall tkm@tkm
```

## License

[MIT](LICENSE)
