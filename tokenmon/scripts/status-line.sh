#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

CONFIG_FILE="$TOKENMON_DIR/config.json"
STATE_FILE="$TOKENMON_DIR/state.json"
SESSION_FILE="$TOKENMON_DIR/session.json"
POKEMON_JSON="$TOKENMON_DIR/data/pokemon.json"

# Bail out silently if core files missing
if [[ ! -f "$CONFIG_FILE" || ! -f "$STATE_FILE" ]]; then
    echo "[토큰몬 미설치]"
    exit 0
fi

STARTER_CHOSEN=$(jq -r '.starter_chosen // false' "$CONFIG_FILE" 2>/dev/null || echo "false")
if [[ "$STARTER_CHOSEN" != "true" ]]; then
    echo "[스타터를 선택하세요: tokenmon starter]"
    exit 0
fi

PARTY_RAW=$(jq -r '.party[]' "$CONFIG_FILE" 2>/dev/null || echo "")
if [[ -z "$PARTY_RAW" ]]; then
    echo "[파티가 비어있습니다]"
    exit 0
fi

mapfile -t PARTY <<< "$PARTY_RAW"

# 6-group experience formula helpers (matches original Pokemon games)
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

# Build XP bar (6 blocks)
xp_bar() {
    local current_xp="$1"
    local level="$2"
    local group="${3:-medium_fast}"
    local BLOCKS=6

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

# Read agent assignments
AGENT_ASSIGNMENTS=""
if [[ -f "$SESSION_FILE" ]]; then
    AGENT_ASSIGNMENTS=$(jq -r '.agent_assignments // []' "$SESSION_FILE" 2>/dev/null || echo "[]")
fi

# Output line
OUTPUT_PARTS=()

for POKEMON_NAME in "${PARTY[@]}"; do
    [[ -z "$POKEMON_NAME" ]] && continue

    # Get pokemon data
    LEVEL=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].level // 1' "$STATE_FILE" 2>/dev/null || echo "1")
    CURRENT_XP=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].xp // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    POKEMON_ID=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
    EXP_GROUP=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].exp_group // "medium_fast"' "$POKEMON_JSON" 2>/dev/null || echo "medium_fast")

    # Sprite: first line of terminal sprite file, else [name]
    SPRITE=""
    SPRITE_FILE="$TOKENMON_DIR/sprites/terminal/${POKEMON_ID}.txt"
    if [[ -f "$SPRITE_FILE" ]]; then
        SPRITE=$(head -1 "$SPRITE_FILE" 2>/dev/null || echo "")
    fi
    if [[ -z "$SPRITE" ]]; then
        SPRITE="[${POKEMON_NAME}]"
    fi

    # XP bar
    BAR=$(xp_bar "$CURRENT_XP" "$LEVEL" "$EXP_GROUP")

    # Agent assignment label
    AGENT_LABEL=""
    if [[ -n "$AGENT_ASSIGNMENTS" && "$AGENT_ASSIGNMENTS" != "[]" ]]; then
        ASSIGNED_AGENT=$(echo "$AGENT_ASSIGNMENTS" | jq -r --arg p "$POKEMON_NAME" \
            'map(select(.pokemon == $p)) | first | .agent_id // empty' 2>/dev/null || echo "")
        if [[ -n "$ASSIGNED_AGENT" ]]; then
            SHORT_AGENT="${ASSIGNED_AGENT:0:6}"
            AGENT_LABEL=" @${SHORT_AGENT}"
        fi
    fi

    PART="${SPRITE} ${POKEMON_NAME} Lv.${LEVEL} [${BAR}]${AGENT_LABEL}"
    OUTPUT_PARTS+=("$PART")
done

# Join with separator
IFS=" | "
echo "${OUTPUT_PARTS[*]}"
