# Tokenmon Documentation

> **tkm** v0.1.0-rc.0 | Gen 4 Pokemon Claude Code Plugin

## Documents

### PRD (Product Requirements Document)

- [@PRD-concept.md](PRD-concept.md) — 컨셉 PRD: 게임 디자인 철학, 사용자 경험, 핵심 루프
- [@PRD-technical.md](PRD-technical.md) — 기술 PRD: 아키텍처, 훅 시스템, Claude Code 통합

### Spec (Technical Specification)

- [@spec-battle.md](spec-battle.md) — 전투 시스템: 승률 공식, EV, 타입 상성, 파티 멀티플라이어
- [@spec-progression.md](spec-progression.md) — 성장 시스템: XP, 레벨, 진화, 업적, 지역
- [@spec-data.md](spec-data.md) — 데이터 스키마: State, Config, PokemonDB, 타입 시스템

## Quick Reference

```
src/
  core/       # 게임 로직 (battle, xp, evolution, encounter, achievements, items, regions, stats, pokedex-rewards, notifications)
  cli/        # CLI 인터페이스 (tokenmon 명령어)
  hooks/      # Claude Code 훅 (session-start, stop, permission, subagent)
  audio/      # 울음소리 + 효과음 재생
  sprites/    # PNG → ANSI 변환
  setup/      # 설치 + StatusLine 설정
data/         # pokemon.json, achievements.json, regions.json, events.json, pokedex-rewards.json, tips.json
skills/       # tkm, setup, doctor, reset, uninstall
test/         # 439 tests (battle, evolution, encounter, events, stats, pokedex-rewards, legendary, party-management)
```
