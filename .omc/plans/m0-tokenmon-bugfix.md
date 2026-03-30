# M0: Tokenmon 버그수정 / 안정화 — 합의 계획

## RALPLAN-DR Summary

### Principles
1. **Delta-only XP**: 세션 JSONL의 전체 누적이 아닌, 마지막 처리 이후의 차이분만 XP로 반영
2. **원작 충실**: 포켓몬 원작 경험치 그룹 공식을 정확히 구현 (Medium Slow, Slow 등)
3. **Backward-compatible**: 기존 state.json 구조를 유지하면서 필드 추가 (파괴적 변경 없음)
4. **Minimal scope**: M0는 bash 수정만. 구조 변경/리팩터링은 M1으로 이연
5. **Testable**: 모든 수정은 수동 테스트로 검증 가능한 구체적 기준 포함

### Decision Drivers
1. **정확성**: Lv.160 버그 해결이 최우선 — 사용자 경험의 핵심
2. **데이터 무결성**: 기존 세션 데이터와의 충돌 방지
3. **복잡도 관리**: 6종 경험치 공식 추가 시 기존 bash 구조 내에서 관리 가능한 수준 유지

### Viable Options

**Option A: Session-level delta tracking (Recommended)**
- state.json에 `last_session_tokens: {"<session_id>": <tokens>}` 딕셔너리 추가
- Stop 훅에서: `delta = current_jsonl_total - last_session_tokens[session_id]`
- Pros: 세션별 정확한 델타, 멀티세션 안전, 구현 단순
- Cons: state.json에 세션 히스토리 누적 (정리 필요)

**Option B: File offset tracking**
- state.json에 `last_jsonl_offset: {"<session_id>": <byte_offset>}` 저장
- Stop 훅에서 offset 이후의 새 라인만 파싱
- Pros: 파싱 시간 단축 (대용량 JSONL)
- Cons: 파일이 재작성/truncate되면 오프셋 무효화, 구현 복잡

**Invalidation of Option B**: bash에서 바이트 오프셋 기반 파싱은 `tail -c +N`으로 가능하지만, JSONL 라인 경계와 오프셋 불일치 위험이 있고, 세션 JSONL이 외부에서 수정될 경우 데이터 손상 가능. Option A가 더 안정적.

---

## Requirements Summary

Deep Interview 스펙 M0 섹션 기반 (`.omc/specs/deep-interview-tokenmon-milestones.md`):
- T-001: 토큰 델타 추적
- T-002: cache 토큰 제외
- T-003: tokens_per_xp=100 기본값
- T-004: 종별 경험치 그룹
- T-005: /tokenmon CLI 미동작 수정
- T-006: install.sh --reset

---

## Consensus Review Results

- **Architect**: APPROVE_WITH_IMPROVEMENTS
- **Critic**: APPROVE_WITH_IMPROVEMENTS
- **Iterations**: 1 (consensus reached on first pass)

### Applied Improvements
1. **[Critical] mktemp 패턴**: 모든 `/tmp/tokenmon_state_tmp.json` → `$(mktemp)` 교체 (race condition 방지)
2. **[Major] Early-exit 정확한 배치**: DELTA_TOKENS 체크를 line 99 이후, line 123 이전에 배치
3. **[Major] 기존 설치 마이그레이션**: install.sh가 기존 config.json의 tokens_per_xp=10을 자동 감지 → 100으로 업데이트
4. **[Minor] 세션 정리**: last_session_tokens에서 최근 10개만 보존하는 정리 로직 포함
5. **[Minor] status-line.sh 명시적 수정 가이드**: exp_group 반영 코드 추가

### Rejected Suggestions
- **DRY exp_calc.py 분리**: M0 최소 범위 원칙에 위배. 파일 추가 없이 inline 유지. M1 TS 전환 시 자연스럽게 모듈화.

---

## Implementation Steps

> **Cross-cutting: mktemp 패턴**
> 모든 hook 스크립트에서 `/tmp/tokenmon_state_tmp.json` → `TMP=$(mktemp) && jq ... > "$TMP" && mv "$TMP" "$STATE_FILE"` 로 교체.
> 대상 파일: hook-stop.sh, hook-session-start.sh, hook-permission.sh, tokenmon.sh
> 이 변경은 모든 Step에서 jq 쓰기 시 적용.

### Step 1: T-002 — cache 토큰 제외 (hook-stop.sh:60-93)

**파일**: `tokenmon/scripts/hook-stop.sh`

Python 파서 (line 60-81) 수정:
```python
# 변경 전
total += usage.get("cache_creation_input_tokens", 0)
total += usage.get("cache_read_input_tokens", 0)

# 변경 후: 해당 2줄 삭제
# input_tokens + output_tokens만 합산
```

jq fallback 파서 (line 84-92) 수정:
```jq
# 변경 전
(.message.usage.cache_creation_input_tokens // 0) +
(.message.usage.cache_read_input_tokens // 0)

# 변경 후: 해당 2줄 삭제
```

**검증**: JSONL에 cache 토큰이 있는 세션에서 Stop 훅 실행 후, state.json의 XP가 input+output만 반영하는지 확인.

### Step 2: T-001 — 델타 추적 (hook-stop.sh)

**파일**: `tokenmon/scripts/hook-stop.sh`

**변경 사항**:

1. **line 99 직후** (TOTAL_TOKENS 확정 후, config/state 로드 전): 세션의 이전 처리 토큰 읽기
```bash
# ── delta tracking ────────────────────────────────────────────────────────────
PREV_SESSION_TOKENS=$(jq -r --arg sid "$SESSION_ID" \
    '.last_session_tokens[$sid] // 0' "$STATE_FILE" 2>/dev/null || echo "0")
PREV_SESSION_TOKENS=$(( PREV_SESSION_TOKENS + 0 )) 2>/dev/null || PREV_SESSION_TOKENS=0
DELTA_TOKENS=$(( TOTAL_TOKENS - PREV_SESSION_TOKENS ))
```

2. **line 99~121 사이** (party 로드 전): 델타가 0 이하이면 early exit
```bash
if [[ $DELTA_TOKENS -le 0 ]]; then
    echo '{"continue": true}'
    exit 0
fi
```
> **배치 근거**: line 99에서 TOTAL_TOKENS 확정, line 103에서 config 로드 시작, line 123에서 party 루프 진입. early exit는 config 로드 전에 배치하여 불필요한 작업 방지.

3. **line 125-132 XP_TOTAL 계산부**: `TOTAL_TOKENS` → `DELTA_TOKENS`로 교체
```bash
XP_TOTAL=$(python3 -c "
tokens = $DELTA_TOKENS
tpx = max(1, $TOKENS_PER_XP)
bonus = $XP_BONUS
xp = int((tokens / tpx) * bonus)
print(max(0, xp))
" 2>/dev/null || echo "0")
```
> **참고**: 기존 `max(1, xp)` → `max(0, xp)` 변경. 델타가 tokens_per_xp 미만이면 XP=0 (의도된 동작).

4. **line 236 이후** (party 루프 종료 후, total_tokens_consumed 업데이트 전): 세션 토큰 기록 + 오래된 세션 정리
```bash
# Update last_session_tokens and prune to 10 most recent
TMP=$(mktemp)
jq --arg sid "$SESSION_ID" --argjson t "$TOTAL_TOKENS" '
    .last_session_tokens[$sid] = $t |
    if (.last_session_tokens | length) > 10 then
        .last_session_tokens = (.last_session_tokens | to_entries | sort_by(.value) | reverse | .[0:10] | from_entries)
    else . end
' "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
```

5. **line 240-242**: total_tokens_consumed도 delta 기반으로 변경
```bash
# 변경 전: NEW_TOTAL = PREV_TOTAL + TOTAL_TOKENS (매번 전체 합산)
# 변경 후:
NEW_TOTAL=$(( PREV_TOTAL + DELTA_TOKENS ))
```

6. **install.sh:150** state.json 초기화에 `last_session_tokens` 필드 추가:
```json
{"pokemon":{},"unlocked":[],"achievements":{},"total_tokens_consumed":0,"session_count":0,"error_count":0,"permission_count":0,"evolution_count":0,"last_session_id":null,"xp_bonus_multiplier":1.0,"last_session_tokens":{}}
```

**검증**: 동일 세션에서 Stop 2회 호출 시, 2번째는 1번째 이후 추가된 토큰만 XP로 반영되는지 확인.

### Step 3: T-003 — tokens_per_xp=100 기본값

**파일**: `tokenmon/config.json` (line 2)
```json
"tokens_per_xp": 100,
```

**파일**: `tokenmon/install.sh` — `init_data_files()` (line 150)도 `config.json`을 복사하므로 소스의 config.json만 수정하면 됨.

**기존 설치 마이그레이션**: `install.sh`의 `init_data_files()`에서 기존 config.json이 있을 때 `tokens_per_xp`가 10(이전 버그 기본값)이면 자동으로 100으로 업데이트:
```bash
# init_data_files() 내, "config.json 이미 존재 (보존)" 분기에 추가:
CURRENT_TPX=$(jq -r '.tokens_per_xp // 10' "$INSTALL_DIR/config.json")
if [[ "$CURRENT_TPX" -eq 10 ]]; then
    TMP=$(mktemp)
    jq '.tokens_per_xp = 100' "$INSTALL_DIR/config.json" > "$TMP" && mv "$TMP" "$INSTALL_DIR/config.json"
    info "tokens_per_xp 10 → 100 으로 업데이트 (버그 수정)"
fi
```

**검증**: 새로 install.sh 실행 시 config.json의 tokens_per_xp가 100인지 확인. 기존 설치에서도 install.sh 재실행 시 자동 업데이트 확인.

### Step 4: T-004 — 종별 경험치 그룹

**파일 1**: `tokenmon/data/pokemon.json` — 각 포켓몬에 `exp_group` 필드 추가

| 포켓몬 | 원작 exp_group |
|--------|---------------|
| 모부기 라인 (#387-389) | medium_slow |
| 불꽃숭이 라인 (#390-392) | slow |
| 팽도리 라인 (#393-395) | medium_slow |
| 새박이 라인 (#396-398) | medium_slow |
| 꼬지모 라인 (#403-405) | medium_slow |
| 리오르/루카리오 (#447-448) | medium_slow |

**파일 2**: `tokenmon/scripts/hook-stop.sh` — `level_to_xp()` 및 `xp_to_level()` 함수 확장

```bash
# 6종 경험치 그룹 공식
level_to_xp() {
    local lvl="$1"
    local group="${2:-medium_fast}"
    python3 -c "
n = max(1, $lvl)
group = '$group'
if group == 'medium_slow':
    xp = max(0, int(6*n**3/5 - 15*n**2 + 100*n - 140))
elif group == 'slow':
    xp = max(0, int(5*n**3/4))
elif group == 'fast':
    xp = max(0, int(4*n**3/5))
elif group == 'erratic':
    if n <= 50: xp = int(n**3 * (100-n)/50)
    elif n <= 68: xp = int(n**3 * (150-n)/100)
    elif n <= 98: xp = int(n**3 * ((1911-10*n)/3)/500)
    else: xp = int(n**3 * (160-n)/100)
    xp = max(0, xp)
elif group == 'fluctuating':
    if n <= 15: xp = int(n**3 * ((n+1)/3 + 24)/50)
    elif n <= 36: xp = int(n**3 * (n+14)/50)
    else: xp = int(n**3 * (n/2 + 32)/50)
    xp = max(0, xp)
else:  # medium_fast (default)
    xp = max(0, n**3)
print(xp)
" 2>/dev/null || echo "0"
}

xp_to_level() {
    local xp="$1"
    local group="${2:-medium_fast}"
    python3 -c "
xp = int($xp)
group = '$group'
if xp <= 0:
    print(1)
else:
    # Binary search for level
    lo, hi = 1, 200
    while lo < hi:
        mid = (lo + hi + 1) // 2
        n = mid
        if group == 'medium_slow':
            need = max(0, int(6*n**3/5 - 15*n**2 + 100*n - 140))
        elif group == 'slow':
            need = max(0, int(5*n**3/4))
        elif group == 'fast':
            need = max(0, int(4*n**3/5))
        elif group == 'erratic':
            if n <= 50: need = int(n**3 * (100-n)/50)
            elif n <= 68: need = int(n**3 * (150-n)/100)
            elif n <= 98: need = int(n**3 * ((1911-10*n)/3)/500)
            else: need = int(n**3 * (160-n)/100)
            need = max(0, need)
        elif group == 'fluctuating':
            if n <= 15: need = int(n**3 * ((n+1)/3 + 24)/50)
            elif n <= 36: need = int(n**3 * (n+14)/50)
            else: need = int(n**3 * (n/2 + 32)/50)
            need = max(0, need)
        else:
            need = max(0, n**3)
        if need <= xp:
            lo = mid
        else:
            hi = mid - 1
    print(max(1, lo))
" 2>/dev/null || echo "1"
}
```

**호출부 수정** (hook-stop.sh, 레벨 계산 부분):
- 각 포켓몬의 `exp_group`을 pokemon.json에서 읽어 함수에 전달:
```bash
EXP_GROUP=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].exp_group // "medium_fast"' "$POKEMON_JSON" 2>/dev/null || echo "medium_fast")
NEW_LEVEL=$(xp_to_level "$NEW_XP" "$EXP_GROUP")
CURR_LVL_XP=$(level_to_xp "$NEW_LEVEL_INT" "$EXP_GROUP")
```

- `status-line.sh`도 동일하게 수정:
  - `status-line.sh`의 `level_to_xp()` (line 33-36)과 `next_level_xp()` (line 39-41)에 exp_group 파라미터 추가
  - 각 포켓몬의 exp_group을 pokemon.json에서 읽어 XP바 계산에 반영
  - 6종 경험치 공식을 hook-stop.sh와 동일하게 구현 (코드 중복은 M1에서 TS 모듈화로 해소)

**검증**:
- Medium Slow(모부기): Lv.16에 필요한 XP = `6*16³/5 - 15*16² + 100*16 - 140 = 3059`
- Slow(불꽃숭이): Lv.14에 필요한 XP = `5*14³/4 = 3430`
- tokens_per_xp=100 기준: 모부기 첫 진화에 ~305,900 토큰

### Step 5: T-005 — /tokenmon CLI 미동작 수정

**파일**: `tokenmon/scripts/hook-tokenmon-cmd.sh`

**현재 코드 분석** (line 1-18):
```bash
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")
CMD=$(echo "$PROMPT" | sed 's|^[/ ]*||')
if [[ "$CMD" =~ ^tokenmon ]]; then
    OUTPUT=$(bash "$TOKENMON_DIR/tokenmon.sh" $ARGS 2>&1 || true)
    CLEAN=$(echo "$OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')
    jq -n --arg msg "$CLEAN" '{"continue": false, "user_message": $msg}'
fi
```

**문제 진단 필요 사항**:
1. `UserPromptSubmit` 훅의 stdin JSON 구조 확인 — `prompt` 필드가 실제로 존재하는지
2. settings.json의 matcher 패턴 확인: `"matcher": "^/?tokenmon"` — Claude Code UserPromptSubmit 훅 문서와 대조
3. `"continue": false` 반환 시 Claude Code가 프롬프트 처리를 중단하는지 확인

**수정 방향**:
- Claude Code 공식 문서에서 UserPromptSubmit 훅의 stdin JSON 스키마를 확인
- `prompt` 필드 이름이 다를 수 있음 (예: `user_prompt`, `input` 등)
- matcher가 stdin JSON이 아닌 프롬프트 텍스트에 적용되는지 확인
- 필요 시 `"continue": false` 대신 적절한 응답 포맷으로 수정

**주의**: 이 티켓은 Claude Code 훅 API 동작 확인이 선행 조건. 실제 Claude Code 세션에서 디버그 필요.

**검증**: Claude Code 세션 내에서 `/tokenmon status` 입력 시 파티 상태 출력 확인.

### Step 6: T-006 — install.sh --reset

**파일**: `tokenmon/install.sh`

main() 함수 앞에 인수 파싱 추가:
```bash
# ── argument parsing ──
RESET_MODE=false
for arg in "$@"; do
    case "$arg" in
        --reset) RESET_MODE=true ;;
    esac
done

if [[ "$RESET_MODE" == "true" ]]; then
    echo ""
    bold "⚠ state.json을 초기화합니다. 모든 포켓몬 진행 상황이 삭제됩니다."
    read -r -p "계속하시겠습니까? (y/N): " confirm || confirm=""
    if [[ "$confirm" =~ ^[yY]$ ]]; then
        cat > "$INSTALL_DIR/state.json" <<'EOF'
{"pokemon":{},"unlocked":[],"achievements":{},"total_tokens_consumed":0,"session_count":0,"error_count":0,"permission_count":0,"evolution_count":0,"last_session_id":null,"xp_bonus_multiplier":1.0,"last_session_tokens":{}}
EOF
        success "state.json 초기화 완료"
        info "config.json, 에셋 파일은 보존됩니다."
    else
        info "초기화 취소"
    fi
    exit 0
fi
```

**검증**: `install.sh --reset` 실행 시 state.json이 초기값으로 리셋되고 config.json은 보존되는지 확인.

---

## Execution Order

```
T-002 (cache 제외) → T-001 (델타 추적) → T-003 (tokens_per_xp) → T-004 (경험치 그룹) → T-005 (/tokenmon) → T-006 (--reset)
```

T-002를 먼저 하는 이유: cache 제거가 가장 단순한 변경이고, 이후 T-001의 델타 계산이 정확한 토큰 범위 위에서 동작해야 하므로.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 기존 state.json의 XP가 이미 부풀려져 있음 | 레벨이 비정상적으로 높은 상태 유지 | T-006 `--reset`으로 해결. 사용자에게 리셋 안내. |
| python3 없는 환경에서 6종 경험치 공식 실행 불가 | XP 계산 실패 | python3 체크 추가. 없으면 jq fallback (medium_fast만 지원) |
| UserPromptSubmit 훅 API가 예상과 다를 수 있음 | T-005 수정 불가 | Claude Code 공식 문서 확인 후 수정. 실제 세션 디버그 필수. |
| last_session_tokens 딕셔너리가 무한히 커질 수 있음 | state.json 파일 비대화 | 최근 10개 세션만 보존하는 정리 로직 추가 |
| status-line.sh도 exp_group 반영 필요 | XP바 계산 불일치 | T-004에서 함께 수정 |

## Verification Steps

1. **T-001/T-002 통합 테스트**: install.sh --reset 후 세션 시작 → Stop → state.json 확인 → 같은 세션에서 다시 Stop → XP가 delta만 추가되었는지 확인
2. **T-003**: config.json의 tokens_per_xp=100 확인
3. **T-004**: 모부기(medium_slow) Lv.16에 3059 XP, 불꽃숭이(slow) Lv.14에 3430 XP 필요한지 수동 계산 검증
4. **T-005**: Claude Code 세션 내 `/tokenmon status` 입력 테스트
5. **T-006**: `install.sh --reset` → state.json 초기화 + config.json 보존 확인

---

## ADR

### Decision
Session-level delta tracking (Option A)으로 토큰 중복 카운팅 버그를 수정하고, 원작 6종 경험치 그룹을 inline Python으로 구현한다.

### Drivers
1. Lv.160 버그가 사용자 경험을 파괴 — 즉시 수정 필요
2. 원작 충실성은 사용자의 명시적 요구사항
3. M0는 bash 범위 내 최소 변경 원칙

### Alternatives Considered
- **File offset tracking**: 바이트 오프셋 기반으로 새 라인만 파싱. bash에서 구현 복잡, JSONL 라인 경계 불일치 위험 → 기각
- **External state DB (SQLite)**: 더 견고하지만 M1 TS 전환 시 폐기될 코드에 의존성 추가 불합리 → 기각
- **단일 공식 유지 + 스케일 조정만**: 사용자가 종별 경험치 그룹을 명시적으로 요청 → 기각

### Why Chosen
Option A는 구현이 단순하고 (jq로 JSON dict 읽기/쓰기), 세션별 정확한 델타를 보장하며, 기존 state.json 구조와 자연스럽게 호환된다. M1에서 TS로 전환 시에도 같은 로직을 그대로 포팅할 수 있다.

### Consequences
- state.json에 `last_session_tokens` 필드 추가 (하위 호환)
- 오래된 세션 엔트리 정리 로직 필요 (10개 제한)
- python3이 6종 공식의 hard dependency가 됨 (이미 XP 계산에 사용 중이므로 추가 부담 없음)

### Follow-ups
- M1에서 TypeScript로 전체 재작성 시 동일 로직 포팅
- state.json 마이그레이션 로직 (M1의 T-107)

---

## Changelog (Consensus Improvements Applied)

1. **mktemp 패턴 추가** — Cross-cutting note added. 모든 jq 쓰기에서 `/tmp/tokenmon_state_tmp.json` → `$(mktemp)` (Architect #1, Critic Major #1)
2. **Early-exit 정확한 배치** — Step 2를 6단계로 세분화, 각 변경의 정확한 위치(line 99 이후, 123 이전) 명시 (Architect #2, Critic Major #2)
3. **기존 설치 마이그레이션** — Step 3에 `tokens_per_xp=10` 자동 감지/업데이트 로직 추가 (Architect #3, Critic Major #3)
4. **세션 정리 로직** — Step 2.4에 `last_session_tokens` 10개 제한 pruning 포함 (Architect #4, Critic Minor #2)
5. **status-line.sh 수정 명시** — Step 4에 구체적 수정 가이드 추가 (Critic Minor #4)
6. **DRY exp_calc.py 분리 거부** — M0 최소 범위 원칙 우선, M1에서 해소 (Critic Minor #3)
