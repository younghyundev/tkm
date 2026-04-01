---
description: "Tokenmon 플러그인 제거 전 정리. statusLine, 데이터 파일을 정리한 후 /plugin uninstall 안내. 'uninstall', '제거', '삭제', '지우기' 등을 말할 때 사용."
---

# Tokenmon Uninstall

tokenmon 플러그인을 깨끗하게 제거합니다. `/plugin uninstall` 전에 반드시 이 스킬을 먼저 실행하세요.

## 실행 순서

### Step 1: 데이터 정리

Bash 도구로 다음을 실행하세요:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.ts"
```

### Step 2: 사용자에게 안내

> tokenmon 데이터가 정리되었습니다.
>
> 플러그인을 완전히 제거하려면 다음을 실행하세요:
> ```
> /plugin uninstall tkm@tkm
> ```
>
> 그 후 `/reload-plugins`로 반영하세요.

### 옵션

포켓몬 데이터(state.json)를 보존하고 싶다면:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.ts" --keep-state
```

> state.json이 보존되었습니다. 나중에 재설치하면 기존 포켓몬을 이어서 키울 수 있습니다.
