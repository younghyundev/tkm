# High-level Design: Battery Token Meter

## Context
Claude Code가 status line 스크립트에 stdin으로 실시간 사용량 데이터를 전달한다.
이 데이터를 활용하여 5시간 롤링 윈도우 토큰 잔여량을 PP로 footer에 표시한다.

## 검증된 stdin 데이터 (실제 캡처)

```json
{
  "rate_limits": {
    "five_hour": { "used_percentage": 30, "resets_at": 1775192400 },
    "seven_day": { "used_percentage": 29, "resets_at": 1775523600 }
  },
  "context_window": {
    "used_percentage": 11,
    "remaining_percentage": 89,
    "context_window_size": 1000000
  }
}
```

## 확정된 결정사항

| # | 결정 | 선택 |
|---|------|------|
| 1 | 네이밍 | 🔋 배터리 아이콘 (가벼운 게임 컨셉에 맞춤) |
| 2 | 표시 형식 | `🔋[████░░] 70% (~2h)` |
| 3 | 배치 위치 | Status line footer, 포켓볼 옆 |
| 4 | 데이터 소스 | stdin → rate_limits.five_hour |
| 5 | 퍼센트 | remaining = 100 - used_percentage |
| 6 | 리셋 시간 | resets_at 타임스탬프로 (~Xh) 표시 |
| 7 | config toggle | pp_enabled (기본 true) |

## 변경 파일

| 파일 | 변경 |
|------|------|
| `src/status-line.ts` | stdin 읽기, PP 바 렌더링, footer 추가 |
| `src/i18n/ko.json` | PP 라벨 ("AI대타출동") |
| `src/i18n/en.json` | PP 라벨 ("Substitute") |
| `src/core/types.ts` | Config에 pp_enabled 추가 |
| `src/core/config.ts` | pp_enabled 기본값 |

## Data Flow

```
Claude Code
    │ stdin (JSON)
    ▼
status-line.ts: readStdin()
    │
    ├── rate_limits.five_hour.used_percentage → remaining%
    ├── rate_limits.five_hour.resets_at → (~Xh) 계산
    │
    ▼
배터리 바: 🔋[████░░] 70% (~2h)
    │
    ▼
footer parts → wrapPrint()
```

## Edge Cases
- stdin 없거나 파싱 실패 → PP 생략 (기존 footer 그대로)
- rate_limits null (비구독자) → PP 생략
- pp_enabled = false → PP 생략
- resets_at이 과거 → 리셋 시간 생략
- wrapper 경유 시 stdin 전달 → setup-statusline.ts에서 이미 처리됨
- 직접 실행 시 → stdin이 바로 들어옴

## 불필요해진 것들
- ~~token_log 추적~~ / ~~state.ts 수정~~ / ~~stop.ts 수정~~
- ~~플랜 감지~~ / ~~plan.ts 신규 모듈~~ / ~~credentials 읽기~~
- ~~5시간 윈도우 계산~~ → stdin에서 직접 제공
