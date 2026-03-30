---
description: Tokenmon 상태 확인 및 파티 관리
---

사용자가 Tokenmon 명령을 실행하려고 합니다. Bash 도구를 사용하여 다음 명령을 실행하고 결과를 보여주세요:

```
bash ~/.claude/hooks/tokenmon/tokenmon.sh $ARGUMENTS
```

$ARGUMENTS가 비어있으면 `status`를 기본값으로 사용하세요.

사용 가능한 명령어:
- `status` — 현재 파티와 통계
- `starter` — 스타터 포켓몬 선택
- `party` — 파티 보기
- `party add <이름>` — 파티에 추가
- `party remove <이름>` — 파티에서 제거
- `unlock list` — 해금된 포켓몬 목록
- `achievements` — 업적 목록
- `config set <키> <값>` — 설정 변경
- `help` — 도움말
