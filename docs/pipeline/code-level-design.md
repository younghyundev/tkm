# Code-level Design: Battery Token Meter

## 1. Type Definitions

### `src/core/types.ts`

**Config interface에 추가:**
```typescript
pp_enabled: boolean;
```

**신규 interface (파일 하단):**
```typescript
export interface RateLimitWindow {
  used_percentage: number;
  resets_at: number;
}

export interface StdinRateLimits {
  five_hour?: RateLimitWindow;
  seven_day?: RateLimitWindow;
}

export interface StdinContextWindow {
  used_percentage: number;
  remaining_percentage: number;
  context_window_size: number;
}

export interface StdinData {
  rate_limits?: StdinRateLimits;
  context_window?: StdinContextWindow;
}
```

## 2. Config

### `src/core/config.ts`
- DEFAULT_CONFIG에 `pp_enabled: true` 추가

## 3. Status Line (`src/status-line.ts`)

### 신규 함수: `readStdin()`
```typescript
function readStdin(): StdinData | null
```
- readFileSync(0, 'utf-8') + JSON.parse, try-catch로 null fallback

### 신규 함수: `ppBar()` (export for testing)
```typescript
export function ppBar(
  stdinData: StdinData,
  lang: 'ko' | 'en',
  blocks?: number  // default: 6
): string | null
```
- rate_limits.five_hour 없으면 null
- remaining = 100 - used_percentage, clamp [0, 100]
- filled/empty 블록 (xpBar 패턴)
- label = t('statusline.pp_label')
- resets_at → (~Xh) 계산, 0 이하면 생략
- 반환: `${label} [${bar}] ${remaining}%${timeStr}`

### main() 변경
1. 시작 직후 `const stdinData = readStdin()`
2. `infoParts.push(footer)` 직전에 PP 삽입:
```typescript
if (config.pp_enabled && stdinData) {
  const pp = ppBar(stdinData, lang);
  if (pp) infoParts.push(pp);
}
```

## 4. i18n

### ko.json
```json
"statusline.pp_label": "AI대타출동",
"cli.config.key_pp_enabled": "  pp_enabled           - AI대타출동(PP) 표시 true/false"
```

### en.json
```json
"statusline.pp_label": "Substitute",
"cli.config.key_pp_enabled": "  pp_enabled           - Show PP (Substitute) meter true/false"
```

## 5. CLI (`src/cli/tokenmon.ts`)
- cmdConfigSet()의 boolKeys에 'pp_enabled' 추가
- config key 도움말에 pp_enabled 출력 추가

## 6. Test

### test/helpers.ts
- makeConfig()에 `pp_enabled: true`

### test/pp-bar.test.ts (신규)
| # | 시나리오 | 기대 |
|---|---------|------|
| 1 | 70% 잔여 | bar + 70% + (~2h) |
| 2 | 0% 잔여 | 모두 ░, 0% |
| 3 | 100% 잔여 | 모두 █, 100% |
| 4 | rate_limits 없음 | null |
| 5 | five_hour 없음 | null |
| 6 | resets_at 과거 | 시간 생략 |
| 7 | used > 100 | clamp 0% |
| 8 | en locale | "Substitute" |

## 7. 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/core/types.ts` | Config + StdinData types |
| `src/core/config.ts` | pp_enabled default |
| `src/status-line.ts` | readStdin(), ppBar(), main() 2곳 |
| `src/cli/tokenmon.ts` | boolKeys + help |
| `src/i18n/ko.json` | 2 keys |
| `src/i18n/en.json` | 2 keys |
| `test/helpers.ts` | makeConfig() |
| `test/pp-bar.test.ts` | 신규 |
