#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "$_SELF")" && pwd)}"
_TMP=$(mktemp)
trap 'rm -f "$_TMP"' EXIT

CONFIG_FILE="$TOKENMON_DIR/config.json"
STATE_FILE="$TOKENMON_DIR/state.json"
POKEMON_JSON="$TOKENMON_DIR/data/pokemon.json"
ACHIEVEMENTS_FILE="$TOKENMON_DIR/data/achievements.json"

# ── color helpers ──────────────────────────────────────────────────────────────
BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RED="\033[31m"
GRAY="\033[90m"

info()    { echo -e "${CYAN}$*${RESET}"; }
success() { echo -e "${GREEN}$*${RESET}"; }
warn()    { echo -e "${YELLOW}$*${RESET}"; }
error()   { echo -e "${RED}$*${RESET}" >&2; }
bold()    { echo -e "${BOLD}$*${RESET}"; }

# ── require jq ────────────────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
    error "jq가 필요합니다. 먼저 install.sh를 실행하세요."
    exit 1
fi

# ── ensure files exist ─────────────────────────────────────────────────────────
if [[ ! -f "$CONFIG_FILE" || ! -f "$STATE_FILE" ]]; then
    error "토큰몬이 설치되지 않았습니다. install.sh를 먼저 실행하세요."
    exit 1
fi

# ── XP helpers (6-group experience formula) ───────────────────────────────────
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
else:
    xp = max(0, n**3)
print(xp)
" 2>/dev/null || echo "0"
}

next_level_xp() {
    local lvl="$1"
    local group="${2:-medium_fast}"
    level_to_xp "$(( lvl + 1 ))" "$group"
}

xp_bar_10() {
    local current_xp="$1"
    local level="$2"
    local group="${3:-medium_fast}"
    local BLOCKS=10

    local curr_lvl_xp
    curr_lvl_xp=$(level_to_xp "$level" "$group")
    local next_lvl_xp
    next_lvl_xp=$(next_level_xp "$level" "$group")

    local xp_in_level=$(( current_xp > curr_lvl_xp ? current_xp - curr_lvl_xp : 0 ))
    local xp_needed=$(( next_lvl_xp - curr_lvl_xp ))
    if [[ $xp_needed -le 0 ]]; then xp_needed=1; fi

    local filled
    filled=$(python3 -c "print(min($BLOCKS, int($xp_in_level / $xp_needed * $BLOCKS)))" 2>/dev/null || echo "0")
    local empty=$(( BLOCKS - filled ))

    local bar=""
    for (( i=0; i<filled; i++ )); do bar+="█"; done
    for (( i=0; i<empty; i++ )); do bar+="░"; done
    echo "$bar"
}

# ── commands ───────────────────────────────────────────────────────────────────

cmd_status() {
    bold "=== 토큰몬 상태 ==="
    echo ""

    local starter_chosen
    starter_chosen=$(jq -r '.starter_chosen // false' "$CONFIG_FILE")
    if [[ "$starter_chosen" != "true" ]]; then
        warn "스타터 포켓몬을 선택하지 않았습니다."
        info "  tokenmon starter  명령으로 스타터를 선택하세요."
        echo ""
    fi

    # Party
    bold "[ 파티 ]"
    local party_raw
    party_raw=$(jq -r '.party[]' "$CONFIG_FILE" 2>/dev/null || echo "")
    if [[ -z "$party_raw" ]]; then
        warn "  파티가 비어있습니다."
    else
        mapfile -t party <<< "$party_raw"
        for pokemon in "${party[@]}"; do
            [[ -z "$pokemon" ]] && continue
            local level xp pokemon_id types_raw types evolves_at
            level=$(jq -r --arg p "$pokemon" '.pokemon[$p].level // 1' "$STATE_FILE" 2>/dev/null || echo "1")
            xp=$(jq -r --arg p "$pokemon" '.pokemon[$p].xp // 0' "$STATE_FILE" 2>/dev/null || echo "0")
            pokemon_id=$(jq -r --arg p "$pokemon" '.pokemon[$p].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
            types_raw=$(jq -r --arg p "$pokemon" '.pokemon[$p].types[]' "$POKEMON_JSON" 2>/dev/null || echo "")
            types=$(echo "$types_raw" | tr '\n' '/' | sed 's|/$||')
            evolves_at=$(jq -r --arg p "$pokemon" '.pokemon[$p].evolves_at // "null"' "$POKEMON_JSON" 2>/dev/null || echo "null")
            local exp_group
            exp_group=$(jq -r --arg p "$pokemon" '.pokemon[$p].exp_group // "medium_fast"' "$POKEMON_JSON" 2>/dev/null || echo "medium_fast")

            local bar
            bar=$(xp_bar_10 "$xp" "$level" "$exp_group")

            local evol_info=""
            if [[ "$evolves_at" != "null" && -n "$evolves_at" ]]; then
                evol_info=" (Lv.${evolves_at}에서 진화)"
            fi

            echo -e "  ${BOLD}${pokemon}${RESET} [#${pokemon_id}] ${GRAY}${types}${RESET}"
            echo -e "  Lv.${level} [${GREEN}${bar}${RESET}] XP: ${xp}${evol_info}"
        done
    fi

    echo ""
    bold "[ 통계 ]"
    local session_count total_tokens error_count perm_count evol_count
    session_count=$(jq -r '.session_count // 0' "$STATE_FILE")
    total_tokens=$(jq -r '.total_tokens_consumed // 0' "$STATE_FILE")
    error_count=$(jq -r '.error_count // 0' "$STATE_FILE")
    perm_count=$(jq -r '.permission_count // 0' "$STATE_FILE")
    evol_count=$(jq -r '.evolution_count // 0' "$STATE_FILE")

    echo "  세션 수: ${session_count}"
    echo "  총 토큰: $(printf '%d' "$total_tokens" | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"
    echo "  에러 수: ${error_count}"
    echo "  권한 승인: ${perm_count}"
    echo "  진화 횟수: ${evol_count}"
}

cmd_starter() {
    if [[ ! -f "$POKEMON_JSON" ]]; then
        error "pokemon.json을 찾을 수 없습니다."
        exit 1
    fi

    local already_chosen
    already_chosen=$(jq -r '.starter_chosen // false' "$CONFIG_FILE")
    if [[ "$already_chosen" == "true" ]]; then
        warn "이미 스타터를 선택했습니다."
        local current_party
        current_party=$(jq -r '.party[]' "$CONFIG_FILE" 2>/dev/null | tr '\n' ', ' | sed 's|,$||')
        info "현재 파티: ${current_party}"
        return 0
    fi

    bold "스타터 포켓몬을 선택하세요:"
    echo ""
    local starters
    mapfile -t starters <<< "$(jq -r '.starters[]' "$POKEMON_JSON")"
    local i=1
    for s in "${starters[@]}"; do
        [[ -z "$s" ]] && continue
        local types_raw types pokemon_id
        types_raw=$(jq -r --arg p "$s" '.pokemon[$p].types[]' "$POKEMON_JSON" 2>/dev/null || echo "")
        types=$(echo "$types_raw" | tr '\n' '/' | sed 's|/$||')
        pokemon_id=$(jq -r --arg p "$s" '.pokemon[$p].id' "$POKEMON_JSON" 2>/dev/null || echo "?")
        echo "  ${i}) ${BOLD}${s}${RESET} [#${pokemon_id}] ${GRAY}${types}${RESET}"
        (( i++ )) || true
    done

    echo ""
    local choice
    read -r -p "번호를 입력하세요 (1-${#starters[@]}): " choice

    if [[ "$choice" =~ ^[1-9][0-9]*$ ]] && [[ $choice -ge 1 && $choice -le ${#starters[@]} ]]; then
        local chosen="${starters[$((choice-1))]}"
        local pokemon_id
        pokemon_id=$(jq -r --arg p "$chosen" '.pokemon[$p].id // 0' "$POKEMON_JSON")

        # Update config
        jq --arg p "$chosen" '.party = [$p] | .starter_chosen = true' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"

        # Update state
        jq --arg p "$chosen" \
            --argjson id "$pokemon_id" \
            'if .pokemon[$p] == null then .pokemon[$p] = {"id": $id, "xp": 0, "level": 1} else . end |
            if (.unlocked | index($p)) == null then .unlocked += [$p] else . end' \
            "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"

        success "✓ ${chosen}을(를) 선택했습니다! 모험을 시작하세요!"
    else
        error "잘못된 선택입니다."
        exit 1
    fi
}

cmd_party() {
    local subcmd="${1:-}"
    local pokemon="${2:-}"

    case "$subcmd" in
        add)
            if [[ -z "$pokemon" ]]; then
                error "사용법: tokenmon party add <포켓몬이름>"
                exit 1
            fi
            # Check unlocked
            local unlocked
            unlocked=$(jq -r --arg p "$pokemon" '.unlocked | index($p)' "$STATE_FILE" 2>/dev/null || echo "null")
            if [[ "$unlocked" == "null" ]]; then
                error "${pokemon}은(는) 아직 잠금 해제되지 않았습니다."
                info "  tokenmon unlock list  로 잠금 해제된 포켓몬을 확인하세요."
                exit 1
            fi
            local max_party
            max_party=$(jq -r '.max_party_size // 6' "$CONFIG_FILE")
            local current_size
            current_size=$(jq -r '.party | length' "$CONFIG_FILE")
            if [[ $current_size -ge $max_party ]]; then
                error "파티가 가득 찼습니다 (최대 ${max_party}마리)."
                exit 1
            fi
            local already_in
            already_in=$(jq -r --arg p "$pokemon" '.party | index($p)' "$CONFIG_FILE" 2>/dev/null || echo "null")
            if [[ "$already_in" != "null" ]]; then
                warn "${pokemon}은(는) 이미 파티에 있습니다."
                exit 0
            fi
            jq --arg p "$pokemon" '.party += [$p]' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"
            success "✓ ${pokemon}을(를) 파티에 추가했습니다."
            ;;
        remove)
            if [[ -z "$pokemon" ]]; then
                error "사용법: tokenmon party remove <포켓몬이름>"
                exit 1
            fi
            local current_size
            current_size=$(jq -r '.party | length' "$CONFIG_FILE")
            if [[ $current_size -le 1 ]]; then
                error "파티에 최소 1마리는 있어야 합니다."
                exit 1
            fi
            jq --arg p "$pokemon" '.party = [.party[] | select(. != $p)]' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"
            success "✓ ${pokemon}을(를) 파티에서 제외했습니다."
            ;;
        ""|list)
            bold "[ 현재 파티 ]"
            jq -r '.party[]' "$CONFIG_FILE" 2>/dev/null | while IFS= read -r p; do
                local level xp exp_group
                level=$(jq -r --arg n "$p" '.pokemon[$n].level // 1' "$STATE_FILE" 2>/dev/null || echo "1")
                xp=$(jq -r --arg n "$p" '.pokemon[$n].xp // 0' "$STATE_FILE" 2>/dev/null || echo "0")
                exp_group=$(jq -r --arg n "$p" '.pokemon[$n].exp_group // "medium_fast"' "$POKEMON_JSON" 2>/dev/null || echo "medium_fast")
                local bar
                bar=$(xp_bar_10 "$xp" "$level" "$exp_group")
                echo -e "  ${BOLD}${p}${RESET} Lv.${level} [${GREEN}${bar}${RESET}]"
            done
            ;;
        *)
            error "사용법: tokenmon party [add|remove|list] [포켓몬이름]"
            exit 1
            ;;
    esac
}

cmd_unlock_list() {
    bold "[ 잠금 해제된 포켓몬 ]"
    local unlocked_raw
    unlocked_raw=$(jq -r '.unlocked[]' "$STATE_FILE" 2>/dev/null || echo "")
    if [[ -z "$unlocked_raw" ]]; then
        warn "  아직 아무것도 없습니다."
        return 0
    fi
    while IFS= read -r p; do
        [[ -z "$p" ]] && continue
        local level pokemon_id types_raw types
        level=$(jq -r --arg n "$p" '.pokemon[$n].level // 1' "$STATE_FILE" 2>/dev/null || echo "1")
        pokemon_id=$(jq -r --arg n "$p" '.pokemon[$n].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
        types_raw=$(jq -r --arg n "$p" '.pokemon[$n].types[]' "$POKEMON_JSON" 2>/dev/null || echo "")
        types=$(echo "$types_raw" | tr '\n' '/' | sed 's|/$||')
        echo -e "  ${BOLD}${p}${RESET} [#${pokemon_id}] ${GRAY}${types}${RESET} Lv.${level}"
    done <<< "$unlocked_raw"
}

cmd_achievements() {
    if [[ ! -f "$ACHIEVEMENTS_FILE" ]]; then
        error "achievements.json을 찾을 수 없습니다."
        exit 1
    fi

    bold "[ 업적 ]"
    echo ""
    local achieved_keys
    achieved_keys=$(jq -r '.achievements | keys[]' "$STATE_FILE" 2>/dev/null || echo "")

    while IFS= read -r ach; do
        local ach_id ach_name ach_desc rarity_label
        ach_id=$(echo "$ach" | jq -r '.id')
        ach_name=$(echo "$ach" | jq -r '.name')
        ach_desc=$(echo "$ach" | jq -r '.description')
        rarity_label=$(echo "$ach" | jq -r '.rarity_label')

        local achieved=false
        if echo "$achieved_keys" | grep -q "^${ach_id}$" 2>/dev/null; then
            achieved=true
        fi

        if [[ "$achieved" == "true" ]]; then
            echo -e "  ${GREEN}✓${RESET} ${BOLD}${ach_name}${RESET} ${rarity_label}"
            echo -e "    ${GRAY}${ach_desc}${RESET}"
        else
            echo -e "  ${GRAY}○ ${ach_name} ${rarity_label}${RESET}"
            echo -e "    ${GRAY}${ach_desc}${RESET}"
        fi
        echo ""
    done < <(jq -c '.achievements[]' "$ACHIEVEMENTS_FILE")
}

cmd_config_set() {
    local key="${1:-}"
    local value="${2:-}"

    if [[ -z "$key" || -z "$value" ]]; then
        error "사용법: tokenmon config set <키> <값>"
        echo ""
        info "설정 가능한 키:"
        echo "  tokens_per_xp    - 토큰당 XP 비율 (기본: 10)"
        echo "  volume           - 소리 볼륨 0.0-1.0 (기본: 0.5)"
        echo "  sprite_enabled   - 스프라이트 사용 true/false"
        echo "  cry_enabled      - 울음소리 사용 true/false"
        echo "  max_party_size   - 최대 파티 크기 1-6"
        echo "  peon_ping_integration - peon-ping 연동 true/false"
        exit 1
    fi

    # Type-aware value setting
    case "$key" in
        tokens_per_xp|max_party_size|peon_ping_port)
            jq --arg k "$key" --argjson v "$value" '.[$k] = $v' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"
            ;;
        volume|xp_bonus_multiplier)
            jq --arg k "$key" --argjson v "$value" '.[$k] = $v' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"
            ;;
        sprite_enabled|cry_enabled|peon_ping_integration)
            if [[ "$value" == "true" || "$value" == "false" ]]; then
                jq --arg k "$key" --argjson v "$value" '.[$k] = $v' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"
            else
                error "true 또는 false 값을 입력하세요."
                exit 1
            fi
            ;;
        *)
            jq --arg k "$key" --arg v "$value" '.[$k] = $v' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"
            ;;
    esac

    success "✓ ${key} = ${value} 로 설정했습니다."
}

cmd_help() {
    bold "토큰몬 (Tokénmon) - Claude Code 포켓몬 파트너"
    echo ""
    info "사용법: tokenmon <명령> [옵션]"
    echo ""
    bold "명령어:"
    echo "  status              현재 파티와 통계 보기"
    echo "  starter             스타터 포켓몬 선택"
    echo "  party               현재 파티 보기"
    echo "  party add <이름>    파티에 포켓몬 추가"
    echo "  party remove <이름> 파티에서 포켓몬 제거"
    echo "  unlock list         잠금 해제된 포켓몬 목록"
    echo "  achievements        업적 목록"
    echo "  config set <키> <값>  설정 변경"
    echo "  help                이 도움말 보기"
    echo ""
    bold "예시:"
    echo "  tokenmon status"
    echo "  tokenmon starter"
    echo "  tokenmon party add 팽도리"
    echo "  tokenmon config set cry_enabled false"
}

# ── dispatch ───────────────────────────────────────────────────────────────────
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    status)         cmd_status ;;
    starter)        cmd_starter ;;
    party)          cmd_party "$@" ;;
    unlock)
        SUBCMD="${1:-list}"
        shift || true
        case "$SUBCMD" in
            list) cmd_unlock_list ;;
            *) error "사용법: tokenmon unlock list" ;;
        esac
        ;;
    achievements)   cmd_achievements ;;
    config)
        SUBCMD="${1:-}"
        shift || true
        case "$SUBCMD" in
            set) cmd_config_set "$@" ;;
            *) error "사용법: tokenmon config set <키> <값>" ;;
        esac
        ;;
    help|--help|-h) cmd_help ;;
    *)
        error "알 수 없는 명령어: ${COMMAND}"
        echo ""
        cmd_help
        exit 1
        ;;
esac
