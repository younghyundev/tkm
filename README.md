<div align="center">
  <img src="docs/assets/hero.png" alt="Tokénmon hero art" width="960">
</div>

# Tokénmon (tkm)

> **Spend Tokens. Train Pokémon. Hit the Limit.**

A Claude Code gamification plugin that turns token spend into a Pokémon training loop with party progression, encounters, achievements, and a Braille-first status line.

[Install](#install) · [Commands](#core-commands) · [한국어 README](README.ko.md)

## What It Is

Tokénmon turns everyday Claude Code usage into a visible progression loop. Your sessions feed XP, your party grows over time, and the status line keeps the loop in view while you work.

## Core Features

- Braille-first status line for broad terminal compatibility
- Token-to-XP progression with authentic Pokémon growth curves
- Party, box, Pokédex, achievements, encounters, and evolution systems
- Multi-generation data support with generation switching
- Claude Code hook integration for session-aware progression

## Install

```bash
/plugin marketplace add ThunderConch/tkm
/plugin install tkm@tkm
/reload-plugins
/tkm:setup
```

## Core Commands

| Command | What it does |
| --- | --- |
| `/tkm:setup` | Run the guided setup flow |
| `/tkm:tkm status` | Show your current party and XP progress |
| `/tkm:tkm party` | Inspect your active party |
| `/tkm:tkm pokedex` | Browse your Pokédex progress |
| `/tkm:tkm achievements` | View achievement progress |
| `/tkm:tkm config set renderer braille` | Return to the recommended display mode |

## Documentation

- [Overview](docs/en/overview.md)
- [Commands](docs/en/commands.md)
- [Generations](docs/en/generations.md)
- [Display Modes](docs/en/display-modes.md)
- [Docs Index](docs/README.md)
- [한국어 README](README.ko.md)

## Fair Warning

There might be bugs. But you can literally ask Claude to fix them — it built most of this anyway.

## Development

Built with TypeScript and the Claude Code plugin system.

## License

[MIT](LICENSE)
