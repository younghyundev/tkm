# Tokénmon 개요

[← README로 돌아가기](../../README.ko.md)

## 핵심 루프

Tokénmon은 Claude Code 사용을 눈에 보이는 성장 루프로 바꿉니다. 세션 활동이 XP가 되고, XP가 파티를 성장시키며, 상태 줄이 그 진행을 계속 보여 줍니다.

## 무엇이 진행되는가

- 파티 성장과 레벨업
- 도감 진행도
- 업적
- 인카운터와 포획
- 세대별 진행 데이터

## Claude Code 훅 연결

| 이벤트 | 역할 |
| --- | --- |
| `SessionStart` | 세션 상태와 상태 줄 문맥 초기화 |
| `Stop` | 토큰 사용량을 진행도로 환산 |
| `PermissionRequest` | 권한 관련 업적 카운터 추적 |
| `PostToolUseFailure` | 실패 관련 카운터 추적 |
| `SubagentStart` | 디스패치 역할 배정 |
| `SubagentStop` | 서브에이전트 진행 정산 |
