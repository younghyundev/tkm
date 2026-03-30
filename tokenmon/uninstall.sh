#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

# NOTE: uninstall.sh lives in SOURCE_DIR, removes INSTALL_DIR only
INSTALL_DIR="$HOME/.claude/hooks/tokenmon"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
BACKUP_FILE="$SETTINGS_FILE.tokenmon-backup"

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

# ── patch settings.json: remove tokenmon hooks ─────────────────────────────────
_patch_settings() {
    if [[ ! -f "$SETTINGS_FILE" ]]; then
        return 0
    fi

    # Restore from backup if available
    if [[ -f "$BACKUP_FILE" ]]; then
        info "설정 백업 복원: $BACKUP_FILE"
        cp "$BACKUP_FILE" "$SETTINGS_FILE"
        rm -f "$BACKUP_FILE"
        success "settings.json 복원 완료"
        return 0
    fi

    # Otherwise, remove tokenmon hooks by filtering out entries referencing INSTALL_DIR
    local HOOK_PATTERN="$INSTALL_DIR"

    if ! command -v jq &>/dev/null; then
        warn "jq를 찾을 수 없습니다. settings.json을 수동으로 편집하세요."
        warn "  제거할 패턴: $HOOK_PATTERN"
        return 0
    fi

    local PATCHED
    PATCHED=$(jq \
        --arg pattern "$HOOK_PATTERN" \
        '
        if .hooks then
            .hooks |= with_entries(
                .value = [
                    .value[] |
                    .hooks = [
                        .hooks[] |
                        select(.command | test($pattern) | not)
                    ] |
                    select(.hooks | length > 0)
                ] |
                select(length > 0)
            ) |
            if .hooks == {} then del(.hooks) else . end
        else .
        end
        ' "$SETTINGS_FILE" 2>/dev/null || cat "$SETTINGS_FILE")

    echo "$PATCHED" > "$SETTINGS_FILE"
    success "settings.json에서 토큰몬 훅 제거 완료"
}

# ── main ───────────────────────────────────────────────────────────────────────
main() {
    bold "========================================"
    bold "  토큰몬 (Tokénmon) 제거"
    bold "========================================"
    echo ""

    if [[ ! -d "$INSTALL_DIR" ]]; then
        warn "설치 디렉토리를 찾을 수 없습니다: $INSTALL_DIR"
        warn "이미 제거되었거나 설치되지 않았을 수 있습니다."
    fi

    # Confirm
    echo -e "${YELLOW}주의: 설치 디렉토리가 삭제됩니다: $INSTALL_DIR${RESET}"
    echo -e "${YELLOW}소스 디렉토리는 삭제되지 않습니다.${RESET}"
    echo ""
    local confirm
    read -r -p "계속하시겠습니까? (y/N): " confirm || confirm="n"

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        info "제거를 취소했습니다."
        exit 0
    fi

    echo ""

    # Patch settings.json
    _patch_settings

    # Remove symlink
    if [[ -L "$HOME/.local/bin/tokenmon" ]]; then
        rm -f "$HOME/.local/bin/tokenmon"
        success "tokenmon 심링크 제거"
    fi

    # Remove install dir
    if [[ -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
        success "설치 디렉토리 제거: $INSTALL_DIR"
    fi

    echo ""
    bold "========================================"
    success "토큰몬 제거 완료"
    bold "========================================"
    echo ""
    info "소스 디렉토리는 그대로 남아있습니다."
    info "Claude Code를 재시작하면 훅이 비활성화됩니다."
}

main
