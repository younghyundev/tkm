# Ball Economy Rebalance — Design Spec

**Date**: 2026-04-06
**Status**: Draft
**Problem**: 중후반에 몬스터볼 수급이 절대적으로 부족하여 포켓몬을 만나도 잡지 못하는 상황 발생

## Goals

- 도감 완성이 현실적으로 가능한 수준의 볼 수급
- 레어/전설급은 여전히 볼 관리가 필요한 긴장감 유지
- 코딩 흐름을 방해하지 않는 패시브 수급
- 기존 수치는 소폭만 조정, 새 수입원 추가가 주력

## 1. Action-Based Ball Drop (신규)

코딩 중 발생하는 액션(도구 호출, 서브에이전트, 세션 종료)에 연동한 볼 드롭.

| Event | Hook | Drop Rate | Quantity |
|-------|------|-----------|----------|
| Tool use | `PostToolUse` (신규) | 15% | 1~2 |
| Subagent complete | `SubagentStop` (수정) | 100% | 3~5 |
| Session end | `Stop` (수정) | 100% | 2~3 |

- 스팸 방지 없음 — 도구를 많이 쓰면 볼도 많이 쌓임. 의도된 동작.
- 실시간 적립: 훅 발동 시마다 `addItem(state, 'pokeball', n)` 즉시 반영.

### Messages (voice_tone 양쪽 대응)

공통 i18n (`ko.json` / `ko.pokemon.json` / `en.json` / `en.pokemon.json`)에 추가:

**Tool drop**:
- claude: `"모험 도중 몬스터볼을 발견했습니다! 몬스터볼 {n}개를 손에 넣었습니다!"`
- pokemon: `"모험 도중 몬스터볼을 발견했다! 몬스터볼 {n}개를 손에 넣었다!"`

**Subagent drop**:
- claude: `"동료가 몬스터볼을 가지고 돌아왔습니다! 몬스터볼 {n}개를 손에 넣었습니다!"`
- pokemon: `"동료가 몬스터볼을 가지고 돌아왔다! 몬스터볼 {n}개를 손에 넣었다!"`

**Session end drop**:
- claude: `"오늘의 모험 보수로 몬스터볼 {n}개를 받았습니다!"`
- pokemon: `"오늘의 모험 보수로 몬스터볼 {n}개를 받았다!"`

## 2. Non-Battle Turn Drop (신규)

인카운터 미발생 또는 전투 스킵된 턴에서 별도 드롭 판정.

- **확률**: 20%
- **수량**: 1~5개 (균등 분포)
- **메시지**: 현재 `gen` + `region`에 따라 지역별 커스텀 메시지

### Region-Specific Messages

각 gen의 i18n 파일에 배치. 지역당 variation 2~3개, 랜덤 선택.

**구조** (각 gen i18n 파일):
```json
{
  "item_drop.region.1": [
    "마을 근처 풀숲에서 몬스터볼을 발견했다!",
    "길가에 몬스터볼이 떨어져 있었다!"
  ],
  "item_drop.region.3": [
    "호숫가에 몬스터볼이 떠내려왔다!",
    "물가 바위 틈에 몬스터볼이 끼어 있었다!"
  ]
}
```

- 9 gen × 평균 9 지역 × 2~3 variation × 2 voice_tone × 2 language
- 포켓몬 풀의 테마에 맞는 flavor (숲, 동굴, 호수, 설산, 화산 등)

## 3. Existing Value Adjustments (소폭 조정)

### Battle Drop (`src/core/items.ts`)

| Metric | Before | After |
|--------|--------|-------|
| `BALL_DROP_RATE_ON_VICTORY` | 0.20 | **0.30** |
| Victory drop quantity | 1 | **1~5** |
| `BALL_DROP_RATE_ON_BATTLE` | 0.05 | **0.12** |
| Loss drop quantity | 1 | **1~2** |

### Evolution Chain Reward (`data/pokedex-rewards.json`)

| Metric | Before | After |
|--------|--------|-------|
| Chain completion reward | 1~2 | **3~5** |

### Not Changed

- Catch cost formula: `ceil(e^(4.5 × (1 - catch_rate/255)))` — 유지
- Milestone rewards (10종, 25종 등) — 유지
- Achievement rewards — 유지

## 4. Tips (기존 팁 풀에 추가)

양쪽 voice_tone × 2 language 대응:

| claude | pokemon |
|--------|---------|
| `"도구를 사용하면 가끔 몬스터볼을 주울 수 있습니다!"` | `"도구를 사용하면 가끔 몬스터볼을 주울 수 있다!"` |
| `"서브에이전트를 보내면 반드시 몬스터볼을 가져옵니다!"` | `"서브에이전트를 보내면 반드시 몬스터볼을 가져온다!"` |
| `"세션이 끝나면 몬스터볼 보너스를 받을 수 있습니다!"` | `"세션이 끝나면 몬스터볼 보너스를 받을 수 있다!"` |
| `"풀숲을 걷다 보면 몬스터볼이 떨어져 있을 때도 있습니다!"` | `"풀숲을 걷다 보면 몬스터볼이 떨어져 있을 때도 있다!"` |

## 5. Expected Balance

세션당 예상 수입 (도구 ~100회, 서브에이전트 ~5회, 배틀 ~3회 기준):

| Source | Calculation | Expected |
|--------|-------------|----------|
| Tool drop | 100 × 15% × 1.5avg | ~23 |
| Subagent drop | 5 × 100% × 4avg | ~20 |
| Battle win (2) | 2 × 30% × 3avg | ~2 |
| Battle loss (1) | 1 × 12% × 1.5avg | ~0 |
| Non-battle turn | turns × 20% × 3avg | ~10 |
| Session end | 1 × 100% × 2.5avg | ~3 |
| **Total** | | **~58/session** |

**Spend profile**:
- Easy Pokémon (catch_rate 255): 1 ball — 여유
- Mid-tier (catch_rate 75~120): 4~10 balls — 세션당 여러 마리 가능
- Rare (catch_rate 25~45): 20~38 balls — 관리 필요하지만 현실적
- Legendary (catch_rate 3): 82 balls — 1~2세션 모아야 함

## Files to Modify

**Code**:
- `src/core/items.ts` — 드롭률, 수량 변경
- `src/hooks/stop.ts` — 세션 종료 보너스 추가
- `src/hooks/subagent-stop.ts` — 서브에이전트 드롭 추가
- `src/hooks/session-start.ts` — 비전투 턴 드롭 로직
- `hooks/hooks.json` — `PostToolUse` 훅 등록
- 신규: `src/hooks/post-tool-use.ts` — 도구 사용 드롭

**Data**:
- `data/pokedex-rewards.json` — 체인 완성 보상 상향
- `data/tips.json` — 볼 획득 팁 추가

**i18n** (공통 + 각 gen):
- `src/i18n/ko.json`, `src/i18n/ko.pokemon.json` — 액션 드롭 메시지, 팁
- `src/i18n/en.json`, `src/i18n/en.pokemon.json` — 액션 드롭 메시지, 팁
- `data/gen{1~9}/i18n/ko.json`, `ko.pokemon.json` — 지역별 메시지
- `data/gen{1~9}/i18n/en.json`, `en.pokemon.json` — 지역별 메시지
