---
description: "Tokenmon CLI. 상태 확인, 파티, 도감, 지역, 아이템, 업적 등 모든 tokenmon 명령 실행. 'tokenmon', '포켓몬', '파티', '도감' 등을 말할 때 사용."
---

사용자가 Tokenmon 명령을 실행하려고 합니다.

## 실행

Bash 도구로 다음을 실행하고 결과를 보여주세요:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" $ARGUMENTS
```

`$ARGUMENTS`가 비어있으면 `status`를 기본값으로 사용하세요.
`$ARGUMENTS`가 `--help` 또는 `-h`이면 `help`를 실행하세요.

## 사용 가능한 명령어

| 명령 | 설명 |
|------|------|
| `status` | 파티와 통계 보기 |
| `starter` | 스타터 포켓몬 선택 |
| `party` | 파티 보기 |
| `party add <이름>` | 파티에 포켓몬 추가 |
| `party remove <이름>` | 파티에서 제거 |
| `party dispatch <이름>` | 서브에이전트 디스패치 설정 (1.5x XP) |
| `unlock list` | 잠금해제된 포켓몬 목록 |
| `pokedex` | 도감 보기 (--type/--region/--rarity 필터) |
| `pokedex <이름>` | 포켓몬 상세 정보 |
| `region` | 현재 지역 보기 |
| `region list` | 전체 지역 목록 |
| `region move <지역>` | 지역 이동 |
| `items` | 아이템 목록 |
| `achievements` | 업적 목록 |
| `config set <키> <값>` | 설정 변경 |
| `help` | 전체 도움말 |
