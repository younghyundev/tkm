---
description: "Tokenmon 데이터 초기화. 모든 포켓몬, 업적, 아이템을 리셋하고 처음부터 다시 시작. 사용자가 'reset', '초기화', '리셋', '처음부터' 등을 말할 때 사용."
---

# Tokenmon Reset

tokenmon의 모든 데이터를 초기화합니다. 치트 로그는 보존됩니다.

## 실행 순서

### Step 1: 확인

AskUserQuestion 도구로 사용자에게 확인합니다:

> **경고**: 모든 tokenmon 데이터가 초기화됩니다.
> - 포켓몬, 레벨, XP
> - 업적, 도감
> - 아이템, 전투 기록
> - 파티 설정, 지역
>
> 치트 로그만 보존됩니다. 계속하시겠습니까?

선택지: [초기화 진행] [state만 보존하고 초기화] [취소]

### Step 2a: 전체 초기화

사용자가 "초기화 진행"을 선택한 경우:

```bash
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" reset --confirm
```

### Step 2b: state 보존 초기화

사용자가 "state만 보존"을 선택한 경우 — config만 초기화하고 포켓몬 데이터는 유지:

```bash
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set starter_chosen false
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set current_region 쌍둥이잎\ 마을
```

### Step 3: 스타터 재선택 안내

초기화 후 사용자에게 안내하세요:

> 초기화 완료! `/tokenmon:setup`으로 스타터를 다시 선택하세요.
