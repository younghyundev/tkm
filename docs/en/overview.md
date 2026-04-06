# Tokénmon Overview

[← Back to README](../../README.md) · [Next: Gameplay Systems →](systems.md)

## The Loop

Tokénmon turns Claude Code usage into a visible progression loop: session activity becomes XP, XP grows your party, and your party becomes the face of your work inside the status line.

## What Progression Tracks

- party growth and leveling
- Pokédex progress
- achievements
- encounters and catches
- generation-specific progression data

## How It Hooks Into Claude Code

| Event | Role |
| --- | --- |
| `SessionStart` | initialize session state and status line context |
| `Stop` | convert token usage into progression updates |
| `PermissionRequest` | track permission-driven achievement counters |
| `PostToolUseFailure` | track failure-driven counters |
| `SubagentStart` | assign dispatch roles |
| `SubagentStop` | settle subagent-related progression |
