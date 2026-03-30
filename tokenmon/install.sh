#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.claude/hooks/tokenmon"
_TMP=$(mktemp)
trap 'rm -f "$_TMP"' EXIT
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
BACKUP_FILE="$SETTINGS_FILE.tokenmon-backup"
LOCAL_BIN="$HOME/.local/bin"

mkdir -p "$LOCAL_BIN"
export PATH="$LOCAL_BIN:$PATH"

# ── colors ─────────────────────────────────────────────────────────────────────
BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RED="\033[31m"

info()    { echo -e "${CYAN}ℹ ${*}${RESET}"; }
success() { echo -e "${GREEN}✓ ${*}${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ ${*}${RESET}"; }
error()   { echo -e "${RED}✗ ${*}${RESET}" >&2; }
bold()    { echo -e "${BOLD}${*}${RESET}"; }
step()    { echo -e "\n${BOLD}[$(date +%H:%M:%S)] ${*}${RESET}"; }

# ── dependency: jq ─────────────────────────────────────────────────────────────
ensure_jq() {
    if command -v jq &>/dev/null; then
        success "jq 이미 설치됨: $(jq --version)"
        return 0
    fi

    info "jq 설치 중..."
    local JQ_BIN="$LOCAL_BIN/jq"
    local ARCH
    ARCH=$(uname -m)
    local JQ_URL=""

    case "$ARCH" in
        x86_64)  JQ_URL="https://github.com/jqlang/jq/releases/latest/download/jq-linux-amd64" ;;
        aarch64) JQ_URL="https://github.com/jqlang/jq/releases/latest/download/jq-linux-arm64" ;;
        *)
            warn "알 수 없는 아키텍처: $ARCH. jq를 수동으로 설치하세요."
            return 1
            ;;
    esac

    if command -v curl &>/dev/null; then
        curl -fsSL "$JQ_URL" -o "$JQ_BIN" && chmod +x "$JQ_BIN"
    elif command -v wget &>/dev/null; then
        wget -qO "$JQ_BIN" "$JQ_URL" && chmod +x "$JQ_BIN"
    else
        error "curl 또는 wget이 필요합니다."
        return 1
    fi

    if command -v jq &>/dev/null; then
        success "jq 설치 완료: $(jq --version)"
    else
        error "jq 설치 실패"
        return 1
    fi
}

# ── dependency: uv ─────────────────────────────────────────────────────────────
ensure_uv() {
    if command -v uv &>/dev/null; then
        success "uv 이미 설치됨: $(uv --version 2>/dev/null | head -1)"
        return 0
    fi

    info "uv 설치 중..."
    if command -v curl &>/dev/null; then
        curl -LsSf https://astral.sh/uv/install.sh | sh 2>/dev/null || true
    fi

    # Reload PATH
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

    if command -v uv &>/dev/null; then
        success "uv 설치 완료"
    else
        warn "uv 설치 실패 - 스프라이트 변환을 건너뜁니다."
        return 1
    fi
}

# ── dependency: Pillow ─────────────────────────────────────────────────────────
ensure_pillow() {
    mkdir -p "$INSTALL_DIR"
    if python3 -c "import PIL" &>/dev/null || \
       (command -v uv &>/dev/null && cd "$INSTALL_DIR" && uv run python3 -c "import PIL" &>/dev/null); then
        success "Pillow 이미 설치됨"
        return 0
    fi

    if command -v uv &>/dev/null; then
        info "Pillow 설치 중 (uv)..."
        # uv needs a project — init in INSTALL_DIR if needed
        mkdir -p "$INSTALL_DIR"
        if [[ ! -f "$INSTALL_DIR/pyproject.toml" ]]; then
            (cd "$INSTALL_DIR" && uv init --no-readme --no-pin-python 2>/dev/null) || true
        fi
        (cd "$INSTALL_DIR" && uv add pillow 2>/dev/null) || true
    elif command -v pip3 &>/dev/null; then
        info "Pillow 설치 중 (pip3)..."
        pip3 install --quiet --user Pillow 2>/dev/null || true
    fi

    if python3 -c "import PIL" &>/dev/null || \
       (command -v uv &>/dev/null && cd "$INSTALL_DIR" && uv run python3 -c "import PIL" &>/dev/null); then
        success "Pillow 설치 완료"
    else
        warn "Pillow 설치 실패 - 텍스트 대체 스프라이트를 사용합니다."
    fi
}

# ── copy source → install dir ──────────────────────────────────────────────────
copy_files() {
    step "플러그인 파일 복사 중..."

    mkdir -p "$INSTALL_DIR"/{scripts,sprites/{raw,terminal},cries,data}

    cp "$SOURCE_DIR"/scripts/*.sh "$INSTALL_DIR/scripts/"
    cp "$SOURCE_DIR"/scripts/tokenmon-play.ps1 "$INSTALL_DIR/scripts/"
    cp "$SOURCE_DIR"/sprites/convert.py "$INSTALL_DIR/sprites/"
    cp "$SOURCE_DIR"/data/*.json "$INSTALL_DIR/data/"
    cp "$SOURCE_DIR"/tokenmon.sh "$INSTALL_DIR/"

    chmod +x "$INSTALL_DIR"/scripts/*.sh "$INSTALL_DIR/tokenmon.sh"

    success "파일 복사 완료: $INSTALL_DIR"
}

# ── initialize persistent data files (no overwrite) ───────────────────────────
init_data_files() {
    step "데이터 파일 초기화..."

    if [[ ! -f "$INSTALL_DIR/config.json" ]]; then
        cp "$SOURCE_DIR/config.json" "$INSTALL_DIR/config.json"
        success "config.json 생성"
    else
        info "config.json 이미 존재 (보존)"
        # Migrate tokens_per_xp from old default (10) to new default (100)
        CURRENT_TPX=$(jq -r '.tokens_per_xp // 10' "$INSTALL_DIR/config.json")
        if [[ "$CURRENT_TPX" -eq 10 ]]; then
            jq '.tokens_per_xp = 100' "$INSTALL_DIR/config.json" > "$_TMP" && mv "$_TMP" "$INSTALL_DIR/config.json"
            info "tokens_per_xp 10 → 100 으로 업데이트 (버그 수정)"
        fi
    fi

    if [[ ! -f "$INSTALL_DIR/state.json" ]]; then
        cat > "$INSTALL_DIR/state.json" <<'EOF'
{"pokemon":{},"unlocked":[],"achievements":{},"total_tokens_consumed":0,"session_count":0,"error_count":0,"permission_count":0,"evolution_count":0,"last_session_id":null,"xp_bonus_multiplier":1.0,"last_session_tokens":{}}
EOF
        success "state.json 생성"
    else
        info "state.json 이미 존재 (보존)"
    fi

    if [[ ! -f "$INSTALL_DIR/session.json" ]]; then
        echo '{"session_id":null,"agent_assignments":[],"evolution_events":[],"achievement_events":[]}' > "$INSTALL_DIR/session.json"
        success "session.json 생성"
    else
        info "session.json 이미 존재 (보존)"
    fi
}

# ── install /tokenmon command skill ───────────────────────────────────────────
install_command() {
    step "/tokenmon 슬래시 명령어 설치..."

    local CMD_DIR="$CLAUDE_DIR/commands"
    mkdir -p "$CMD_DIR"
    cp "$SOURCE_DIR/commands/tokenmon.md" "$CMD_DIR/tokenmon.md"
    success "/tokenmon 명령어 설치 완료"
}

# ── CLI symlink ────────────────────────────────────────────────────────────────
install_cli() {
    step "CLI 심링크 설치..."
    ln -sf "$INSTALL_DIR/tokenmon.sh" "$LOCAL_BIN/tokenmon"
    success "tokenmon 명령어 설치: $LOCAL_BIN/tokenmon"
}

# ── patch settings.json ────────────────────────────────────────────────────────
patch_settings() {
    step "Claude Code 훅 등록 중..."

    mkdir -p "$CLAUDE_DIR"

    # Backup
    if [[ -f "$SETTINGS_FILE" && ! -f "$BACKUP_FILE" ]]; then
        cp "$SETTINGS_FILE" "$BACKUP_FILE"
        info "설정 백업: $BACKUP_FILE"
    fi

    # Initialize settings.json if missing
    if [[ ! -f "$SETTINGS_FILE" ]]; then
        echo '{}' > "$SETTINGS_FILE"
    fi

    HOOK_BASE="$INSTALL_DIR/scripts"

    # Build hooks JSON (no UserPromptSubmit — /tokenmon is a command skill)
    HOOKS_JSON=$(jq -n \
        --arg session_start  "$HOOK_BASE/hook-session-start.sh" \
        --arg session_stop   "$HOOK_BASE/hook-stop.sh" \
        --arg perm           "$HOOK_BASE/hook-permission.sh" \
        --arg tool_fail      "$HOOK_BASE/hook-tool-fail.sh" \
        --arg sub_start      "$HOOK_BASE/hook-subagent-start.sh" \
        --arg sub_stop       "$HOOK_BASE/hook-subagent-stop.sh" \
        '{
            "hooks": {
                "SessionStart": [{"hooks": [{"type": "command", "command": $session_start}]}],
                "Stop": [{"hooks": [{"type": "command", "command": $session_stop}]}],
                "PermissionRequest": [{"hooks": [{"type": "command", "command": $perm}]}],
                "PostToolUseFailure": [{"hooks": [{"type": "command", "command": $tool_fail}]}],
                "SubagentStart": [{"hooks": [{"type": "command", "command": $sub_start}]}],
                "SubagentStop": [{"hooks": [{"type": "command", "command": $sub_stop}]}]
            }
        }')

    # Merge into existing settings (also remove old UserPromptSubmit tokenmon hook if present)
    MERGED=$(jq -s '
        .[0] as $existing |
        .[1].hooks as $new_hooks |
        $existing |
        .hooks = (($existing.hooks // {}) * $new_hooks) |
        if .hooks.UserPromptSubmit then
            .hooks.UserPromptSubmit = [.hooks.UserPromptSubmit[] | select(.hooks[0].command | test("tokenmon") | not)]
        else . end |
        if .hooks.UserPromptSubmit == [] then del(.hooks.UserPromptSubmit) else . end
    ' "$SETTINGS_FILE" <(echo "$HOOKS_JSON"))

    # Handle statusLine: wrapper if existing, standalone if not
    EXISTING_SL=$(jq -r '.statusLine.command // ""' "$SETTINGS_FILE" 2>/dev/null || echo "")
    TOKENMON_SL="$HOOK_BASE/status-line.sh"
    WRAPPER_SL="$HOOK_BASE/status-line-wrapper.sh"

    if [[ -n "$EXISTING_SL" && "$EXISTING_SL" != *"tokenmon"* ]]; then
        # Save original statusLine command for wrapper
        echo "$EXISTING_SL" > "$INSTALL_DIR/.original-statusline"
        info "기존 statusLine 발견 → 래퍼로 통합: $EXISTING_SL"
        FINAL_SL="$WRAPPER_SL"
    else
        FINAL_SL="$TOKENMON_SL"
    fi

    MERGED=$(echo "$MERGED" | jq --arg sl "$FINAL_SL" '.statusLine = {"type": "command", "command": $sl}')

    echo "$MERGED" > "$SETTINGS_FILE"
    success "훅 등록 완료"
}

# ── download sprites ───────────────────────────────────────────────────────────
download_sprites() {
    step "스프라이트 다운로드 중..."

    local RAW_DIR="$INSTALL_DIR/sprites/raw"
    local TERM_DIR="$INSTALL_DIR/sprites/terminal"
    mkdir -p "$RAW_DIR" "$TERM_DIR"

    # Pokemon IDs to download
    local IDS=(387 388 389 390 391 392 393 394 395 396 397 398 403 404 405 447 448)
    local BASE_URL="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"

    local downloaded=0
    local failed=0

    for id in "${IDS[@]}"; do
        local out="$RAW_DIR/${id}.png"
        if [[ -f "$out" ]]; then
            continue
        fi
        if command -v curl &>/dev/null; then
            if curl -fsSL --max-time 10 "${BASE_URL}/${id}.png" -o "$out" 2>/dev/null; then
                (( downloaded++ )) || true
            else
                (( failed++ )) || true
            fi
        elif command -v wget &>/dev/null; then
            if wget -qO "$out" --timeout=10 "${BASE_URL}/${id}.png" 2>/dev/null; then
                (( downloaded++ )) || true
            else
                (( failed++ )) || true
            fi
        else
            warn "curl/wget 없음 - 스프라이트 다운로드 불가"
            return 0
        fi
    done

    if [[ $downloaded -gt 0 ]]; then
        success "${downloaded}개 스프라이트 다운로드 완료"
    fi
    if [[ $failed -gt 0 ]]; then
        warn "${failed}개 스프라이트 다운로드 실패 (텍스트 대체 사용)"
    fi
}

# ── convert sprites ────────────────────────────────────────────────────────────
convert_sprites() {
    step "스프라이트 변환 중..."

    local RAW_DIR="$INSTALL_DIR/sprites/raw"
    local TERM_DIR="$INSTALL_DIR/sprites/terminal"
    local CONVERT_PY="$INSTALL_DIR/sprites/convert.py"

    if [[ ! -f "$CONVERT_PY" ]]; then
        warn "convert.py 없음 - 스프라이트 변환 건너뜀"
        return 0
    fi

    local IDS=(387 388 389 390 391 392 393 394 395 396 397 398 403 404 405 447 448)
    local converted=0

    for id in "${IDS[@]}"; do
        local raw="$RAW_DIR/${id}.png"
        local out="$TERM_DIR/${id}.txt"
        if [[ -f "$out" ]]; then
            continue
        fi
        if [[ -f "$raw" ]]; then
            if python3 "$CONVERT_PY" --id "$id" --input "$raw" --output "$out" --width 20 2>/dev/null; then
                (( converted++ )) || true
            fi
        fi
    done

    if [[ $converted -gt 0 ]]; then
        success "${converted}개 스프라이트 변환 완료"
    fi
}

# ── download cries ─────────────────────────────────────────────────────────────
download_cries() {
    step "울음소리 다운로드 중..."

    local CRIES_DIR="$INSTALL_DIR/cries"
    mkdir -p "$CRIES_DIR"

    # PokeAPI cries (latest)
    local IDS=(387 388 389 390 391 392 393 394 395 396 397 398 403 404 405 447 448)
    local BASE_URL="https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest"

    local downloaded=0
    local failed=0

    for id in "${IDS[@]}"; do
        local out="$CRIES_DIR/${id}.ogg"
        if [[ -f "$out" ]]; then
            continue
        fi
        local url="${BASE_URL}/${id}.ogg"
        if command -v curl &>/dev/null; then
            if curl -fsSL --max-time 15 "$url" -o "$out" 2>/dev/null; then
                (( downloaded++ )) || true
            else
                rm -f "$out"
                (( failed++ )) || true
            fi
        elif command -v wget &>/dev/null; then
            if wget -qO "$out" --timeout=15 "$url" 2>/dev/null; then
                (( downloaded++ )) || true
            else
                rm -f "$out"
                (( failed++ )) || true
            fi
        else
            warn "curl/wget 없음 - 울음소리 다운로드 불가"
            return 0
        fi
    done

    if [[ $downloaded -gt 0 ]]; then
        success "${downloaded}개 울음소리 다운로드 완료"
    fi
    if [[ $failed -gt 0 ]]; then
        warn "${failed}개 울음소리 다운로드 실패 (소리 비활성화됨)"
    fi
}

# ── starter selection ──────────────────────────────────────────────────────────
select_starter() {
    step "스타터 포켓몬 선택"
    echo ""
    bold "어떤 포켓몬과 모험을 시작하시겠어요?"
    echo ""
    echo "  1) 모부기  [#387] 풀 타입"
    echo "  2) 불꽃숭이 [#390] 불꽃 타입"
    echo "  3) 팽도리  [#393] 물 타입"
    echo ""

    local choice
    read -r -p "번호를 입력하세요 (1-3, 건너뛰기: Enter): " choice || choice=""

    case "$choice" in
        1)
            jq '.party = ["모부기"] | .starter_chosen = true' "$INSTALL_DIR/config.json" > "$_TMP" && mv "$_TMP" "$INSTALL_DIR/config.json"
            local pokemon_id=387
            jq --argjson id "$pokemon_id" \
                'if .pokemon["모부기"] == null then .pokemon["모부기"] = {"id": $id, "xp": 0, "level": 1} else . end |
                 if (.unlocked | index("모부기")) == null then .unlocked += ["모부기"] else . end' \
                "$INSTALL_DIR/state.json" > "$_TMP" && mv "$_TMP" "$INSTALL_DIR/state.json"
            success "모부기을(를) 선택했습니다! 풀 타입의 친구와 모험을 시작하세요!"
            ;;
        2)
            jq '.party = ["불꽃숭이"] | .starter_chosen = true' "$INSTALL_DIR/config.json" > "$_TMP" && mv "$_TMP" "$INSTALL_DIR/config.json"
            local pokemon_id=390
            jq --argjson id "$pokemon_id" \
                'if .pokemon["불꽃숭이"] == null then .pokemon["불꽃숭이"] = {"id": $id, "xp": 0, "level": 1} else . end |
                 if (.unlocked | index("불꽃숭이")) == null then .unlocked += ["불꽃숭이"] else . end' \
                "$INSTALL_DIR/state.json" > "$_TMP" && mv "$_TMP" "$INSTALL_DIR/state.json"
            success "불꽃숭이을(를) 선택했습니다! 불꽃 타입의 친구와 모험을 시작하세요!"
            ;;
        3)
            jq '.party = ["팽도리"] | .starter_chosen = true' "$INSTALL_DIR/config.json" > "$_TMP" && mv "$_TMP" "$INSTALL_DIR/config.json"
            local pokemon_id=393
            jq --argjson id "$pokemon_id" \
                'if .pokemon["팽도리"] == null then .pokemon["팽도리"] = {"id": $id, "xp": 0, "level": 1} else . end |
                 if (.unlocked | index("팽도리")) == null then .unlocked += ["팽도리"] else . end' \
                "$INSTALL_DIR/state.json" > "$_TMP" && mv "$_TMP" "$INSTALL_DIR/state.json"
            success "팽도리을(를) 선택했습니다! 물 타입의 친구와 모험을 시작하세요!"
            ;;
        "")
            info "스타터 선택을 건너뜁니다. 나중에 'tokenmon starter' 명령으로 선택할 수 있습니다."
            ;;
        *)
            warn "잘못된 선택입니다. 나중에 'tokenmon starter' 명령으로 선택할 수 있습니다."
            ;;
    esac
}

# ── argument parsing ──────────────────────────────────────────────────────────
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

# ── main ───────────────────────────────────────────────────────────────────────
main() {
    bold "========================================"
    bold "  토큰몬 (Tokénmon) 설치"
    bold "  소스: $SOURCE_DIR"
    bold "  설치: $INSTALL_DIR"
    bold "========================================"
    echo ""

    ensure_jq
    ensure_uv || true
    ensure_pillow || true

    copy_files
    init_data_files
    install_cli
    install_command
    patch_settings

    download_sprites || warn "스프라이트 다운로드 실패 (선택 사항)"
    convert_sprites  || warn "스프라이트 변환 실패 (선택 사항)"
    download_cries   || warn "울음소리 다운로드 실패 (선택 사항)"

    select_starter

    echo ""
    bold "========================================"
    success "토큰몬 설치 완료!"
    bold "========================================"
    echo ""
    info "시작하기:"
    echo "  tokenmon status      - 현재 상태 확인"
    echo "  tokenmon starter     - 스타터 선택 (미선택 시)"
    echo "  tokenmon help        - 도움말"
    echo ""
    info "Claude Code를 재시작하면 훅이 활성화됩니다."
}

main
