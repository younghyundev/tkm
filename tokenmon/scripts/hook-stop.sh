#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
_TMP=$(mktemp)
trap 'rm -f "$_TMP"' EXIT

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

STATE_FILE="$TOKENMON_DIR/state.json"
SESSION_FILE="$TOKENMON_DIR/session.json"
CONFIG_FILE="$TOKENMON_DIR/config.json"
POKEMON_JSON="$TOKENMON_DIR/data/pokemon.json"
ACHIEVEMENTS_FILE="$TOKENMON_DIR/data/achievements.json"

if [[ ! -f "$STATE_FILE" || ! -f "$CONFIG_FILE" ]]; then
    echo '{"continue": true}'
    exit 0
fi

# ── helpers ────────────────────────────────────────────────────────────────────

# 6-group experience formula (matches original Pokemon games)
# Groups: medium_fast, medium_slow, slow, fast, erratic, fluctuating
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

# ── find JSONL file ────────────────────────────────────────────────────────────

TOTAL_TOKENS=0

if [[ -n "$SESSION_ID" ]]; then
    CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
    PROJECTS_DIR="$CLAUDE_DIR/projects"

    if [[ -d "$PROJECTS_DIR" ]]; then
        # Search all project dirs for the session JSONL
        JSONL_FILE=$(find "$PROJECTS_DIR" -maxdepth 2 -name "${SESSION_ID}.jsonl" 2>/dev/null | head -1 || echo "")

        if [[ -n "$JSONL_FILE" && -f "$JSONL_FILE" ]]; then
            # Parse tokens with python3
            TOTAL_TOKENS=$(python3 - "$JSONL_FILE" <<'PYEOF' 2>/dev/null || echo "0"
import json, sys
total = 0
with open(sys.argv[1]) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            # Look for usage objects in the message
            msg = obj.get("message", {})
            usage = msg.get("usage", {})
            if usage:
                total += usage.get("input_tokens", 0)
                total += usage.get("output_tokens", 0)
        except Exception:
            pass
print(total)
PYEOF
            )
            # Fallback to jq if python3 failed
            if [[ "$TOTAL_TOKENS" -eq 0 && -f "$JSONL_FILE" ]]; then
                TOTAL_TOKENS=$(jq -s '
                    map(
                        (.message.usage.input_tokens // 0) +
                        (.message.usage.output_tokens // 0)
                    ) | add // 0
                ' "$JSONL_FILE" 2>/dev/null || echo "0")
            fi
        fi
    fi
fi

# Ensure TOTAL_TOKENS is a number
TOTAL_TOKENS=$(( TOTAL_TOKENS + 0 )) || TOTAL_TOKENS=0

# ── delta tracking ────────────────────────────────────────────────────────────
PREV_SESSION_TOKENS=$(jq -r --arg sid "$SESSION_ID" \
    '.last_session_tokens[$sid] // 0' "$STATE_FILE" 2>/dev/null || echo "0")
PREV_SESSION_TOKENS=$(( PREV_SESSION_TOKENS + 0 )) 2>/dev/null || PREV_SESSION_TOKENS=0
DELTA_TOKENS=$(( TOTAL_TOKENS - PREV_SESSION_TOKENS ))

if [[ $DELTA_TOKENS -le 0 ]]; then
    echo '{"continue": true}'
    exit 0
fi

# ── load config & state ────────────────────────────────────────────────────────

TOKENS_PER_XP=$(jq -r '.tokens_per_xp // 10' "$CONFIG_FILE")
XP_FORMULA=$(jq -r '.xp_formula // "medium_fast"' "$CONFIG_FILE")
CONFIG_XP_BONUS=$(jq -r '.xp_bonus_multiplier // 1.0' "$CONFIG_FILE")
STATE_XP_BONUS=$(jq -r '.xp_bonus_multiplier // 1.0' "$STATE_FILE")
# Use the higher of config/state bonus
XP_BONUS=$(python3 -c "print(max($CONFIG_XP_BONUS, $STATE_XP_BONUS))" 2>/dev/null || echo "1.0")

PARTY_RAW=$(jq -r '.party[]' "$CONFIG_FILE" 2>/dev/null || echo "")
mapfile -t PARTY <<< "$PARTY_RAW"
# Filter empty
PARTY=("${PARTY[@]:-}")
PARTY_VALID=()
for p in "${PARTY[@]}"; do
    [[ -n "$p" ]] && PARTY_VALID+=("$p")
done
PARTY=("${PARTY_VALID[@]:-}")
PARTY_SIZE=${#PARTY[@]}

SYSTEM_MESSAGES=()

if [[ $PARTY_SIZE -gt 0 && $DELTA_TOKENS -gt 0 ]]; then
    # Compute XP from delta tokens only (not cumulative)
    XP_TOTAL=$(python3 -c "
tokens = $DELTA_TOKENS
tpx = max(1, $TOKENS_PER_XP)
bonus = $XP_BONUS
xp = int((tokens / tpx) * bonus)
print(max(0, xp))
" 2>/dev/null || echo "0")

    XP_PER_POKEMON=$(python3 -c "print(max(1, $XP_TOTAL // max(1, $PARTY_SIZE)))" 2>/dev/null || echo "1")

    for POKEMON_NAME in "${PARTY[@]}"; do
        [[ -z "$POKEMON_NAME" ]] && continue

        # Get current XP and level from state
        CURRENT_XP=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].xp // 0' "$STATE_FILE")
        CURRENT_LEVEL=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].level // 1' "$STATE_FILE")

        # Ensure pokemon entry exists in state
        POKEMON_ID=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
        if [[ "$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p] // empty' "$STATE_FILE")" == "" ]]; then
            jq --arg p "$POKEMON_NAME" --argjson id "$POKEMON_ID" \
                '.pokemon[$p] = {"id": $id, "xp": 0, "level": 1}' \
                "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
            CURRENT_XP=0
            CURRENT_LEVEL=1
        fi

        # Get experience group for this pokemon
        EXP_GROUP=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].exp_group // "medium_fast"' "$POKEMON_JSON" 2>/dev/null || echo "medium_fast")

        NEW_XP=$(( CURRENT_XP + XP_PER_POKEMON ))
        NEW_LEVEL=$(xp_to_level "$NEW_XP" "$EXP_GROUP")
        CURRENT_LEVEL_INT=$(( CURRENT_LEVEL + 0 ))
        NEW_LEVEL_INT=$(( NEW_LEVEL + 0 ))

        # XP in current level (clamped, no underflow)
        CURR_LVL_XP=$(level_to_xp "$NEW_LEVEL_INT" "$EXP_GROUP")
        XP_IN_LEVEL=$(( NEW_XP > CURR_LVL_XP ? NEW_XP - CURR_LVL_XP : 0 ))

        # Update state
        jq --arg p "$POKEMON_NAME" \
            --argjson xp "$NEW_XP" \
            --argjson lvl "$NEW_LEVEL_INT" \
            '.pokemon[$p].xp = $xp | .pokemon[$p].level = $lvl' \
            "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"

        # Level-up notification
        if [[ $NEW_LEVEL_INT -gt $CURRENT_LEVEL_INT ]]; then
            SYSTEM_MESSAGES+=("⬆️ ${POKEMON_NAME} Lv.${CURRENT_LEVEL_INT} → Lv.${NEW_LEVEL_INT}! (XP: +${XP_PER_POKEMON})")
        fi

        # Check evolution
        EVOLVES_AT=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].evolves_at // "null"' "$POKEMON_JSON" 2>/dev/null || echo "null")
        if [[ "$EVOLVES_AT" != "null" && "$EVOLVES_AT" != "" ]]; then
            EVOLVES_AT_INT=$(( EVOLVES_AT + 0 ))
            if [[ $NEW_LEVEL_INT -ge $EVOLVES_AT_INT && $CURRENT_LEVEL_INT -lt $EVOLVES_AT_INT ]]; then
                # Get next evolution
                EVOL_LINE=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].line[]' "$POKEMON_JSON" 2>/dev/null || echo "")
                mapfile -t EVOL_ARRAY <<< "$EVOL_LINE"
                STAGE=$(jq -r --arg p "$POKEMON_NAME" '.pokemon[$p].stage // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
                STAGE_INT=$(( STAGE + 0 ))
                NEXT_STAGE=$(( STAGE_INT + 1 ))

                if [[ $NEXT_STAGE -lt ${#EVOL_ARRAY[@]} ]]; then
                    NEXT_POKEMON="${EVOL_ARRAY[$NEXT_STAGE]}"

                    # Transfer XP/level to evolved form
                    NEXT_ID=$(jq -r --arg p "$NEXT_POKEMON" '.pokemon[$p].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")

                    # Update state: add new pokemon, remove old from party
                    jq --arg old "$POKEMON_NAME" \
                        --arg new "$NEXT_POKEMON" \
                        --argjson id "$NEXT_ID" \
                        --argjson xp "$NEW_XP" \
                        --argjson lvl "$NEW_LEVEL_INT" \
                        '
                        .pokemon[$new] = {"id": $id, "xp": $xp, "level": $lvl} |
                        if (.unlocked | index($new)) == null then .unlocked += [$new] else . end |
                        .evolution_count += 1
                        ' \
                        "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"

                    # Update party in config: replace old with new
                    jq --arg old "$POKEMON_NAME" --arg new "$NEXT_POKEMON" \
                        '.party = [.party[] | if . == $old then $new else . end]' \
                        "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"

                    SYSTEM_MESSAGES+=("✨ ${POKEMON_NAME}이(가) ${NEXT_POKEMON}(으)로 진화했습니다!")

                    # Check first_evolution achievement
                    if [[ -f "$ACHIEVEMENTS_FILE" ]]; then
                        ALREADY_EVOL=$(jq -r '.achievements.first_evolution // empty' "$STATE_FILE")
                        if [[ -z "$ALREADY_EVOL" ]]; then
                            REWARD_POKEMON=$(jq -r '.achievements[] | select(.id == "first_evolution") | .reward_pokemon // empty' "$ACHIEVEMENTS_FILE")
                            ACH_NAME=$(jq -r '.achievements[] | select(.id == "first_evolution") | .name' "$ACHIEVEMENTS_FILE")
                            jq '.achievements.first_evolution = true' "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"

                            if [[ -n "$REWARD_POKEMON" ]]; then
                                ALREADY_UNLOCKED=$(jq -r --arg p "$REWARD_POKEMON" '.unlocked | index($p)' "$STATE_FILE")
                                if [[ "$ALREADY_UNLOCKED" == "null" ]]; then
                                    REWARD_ID=$(jq -r --arg p "$REWARD_POKEMON" '.pokemon[$p].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
                                    jq --arg p "$REWARD_POKEMON" --argjson id "$REWARD_ID" \
                                        '.unlocked += [$p] | if .pokemon[$p] == null then .pokemon[$p] = {"id": $id, "xp": 0, "level": 1} else . end' \
                                        "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
                                    SYSTEM_MESSAGES+=("🏆 업적 달성: ${ACH_NAME}! ${REWARD_POKEMON}을(를) 얻었습니다!")
                                fi
                            fi
                        fi
                    fi
                fi
            fi
        fi
    done
fi

# ── update session tokens tracking & total tokens ─────────────────────────────

# Record this session's cumulative token count and prune to 10 most recent
jq --arg sid "$SESSION_ID" --argjson t "$TOTAL_TOKENS" '
    .last_session_tokens[$sid] = $t |
    if (.last_session_tokens | length) > 10 then
        .last_session_tokens = (.last_session_tokens | to_entries | sort_by(.value) | reverse | .[0:10] | from_entries)
    else . end
' "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"

# Update total_tokens_consumed with delta only
PREV_TOTAL=$(jq -r '.total_tokens_consumed // 0' "$STATE_FILE")
NEW_TOTAL=$(( PREV_TOTAL + DELTA_TOKENS ))
jq --argjson t "$NEW_TOTAL" '.total_tokens_consumed = $t' "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"

if [[ -f "$ACHIEVEMENTS_FILE" ]]; then
    # hundred_k_tokens
    ALREADY_100K=$(jq -r '.achievements.hundred_k_tokens // empty' "$STATE_FILE")
    if [[ -z "$ALREADY_100K" && $NEW_TOTAL -ge 100000 ]]; then
        REWARD_POKEMON=$(jq -r '.achievements[] | select(.id == "hundred_k_tokens") | .reward_pokemon // empty' "$ACHIEVEMENTS_FILE")
        ACH_NAME=$(jq -r '.achievements[] | select(.id == "hundred_k_tokens") | .name' "$ACHIEVEMENTS_FILE")
        jq '.achievements.hundred_k_tokens = true' "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
        if [[ -n "$REWARD_POKEMON" ]]; then
            ALREADY_UNLOCKED=$(jq -r --arg p "$REWARD_POKEMON" '.unlocked | index($p)' "$STATE_FILE")
            if [[ "$ALREADY_UNLOCKED" == "null" ]]; then
                REWARD_ID=$(jq -r --arg p "$REWARD_POKEMON" '.pokemon[$p].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
                jq --arg p "$REWARD_POKEMON" --argjson id "$REWARD_ID" \
                    '.unlocked += [$p] | if .pokemon[$p] == null then .pokemon[$p] = {"id": $id, "xp": 0, "level": 1} else . end' \
                    "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
                SYSTEM_MESSAGES+=("🏆 업적 달성: ${ACH_NAME}! ${REWARD_POKEMON}을(를) 얻었습니다!")
            fi
        fi
    fi

    # five_hundred_k_tokens
    ALREADY_500K=$(jq -r '.achievements.five_hundred_k_tokens // empty' "$STATE_FILE")
    if [[ -z "$ALREADY_500K" && $NEW_TOTAL -ge 500000 ]]; then
        REWARD_POKEMON=$(jq -r '.achievements[] | select(.id == "five_hundred_k_tokens") | .reward_pokemon // empty' "$ACHIEVEMENTS_FILE")
        ACH_NAME=$(jq -r '.achievements[] | select(.id == "five_hundred_k_tokens") | .name' "$ACHIEVEMENTS_FILE")
        jq '.achievements.five_hundred_k_tokens = true' "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
        if [[ -n "$REWARD_POKEMON" ]]; then
            ALREADY_UNLOCKED=$(jq -r --arg p "$REWARD_POKEMON" '.unlocked | index($p)' "$STATE_FILE")
            if [[ "$ALREADY_UNLOCKED" == "null" ]]; then
                REWARD_ID=$(jq -r --arg p "$REWARD_POKEMON" '.pokemon[$p].id // 0' "$POKEMON_JSON" 2>/dev/null || echo "0")
                jq --arg p "$REWARD_POKEMON" --argjson id "$REWARD_ID" \
                    '.unlocked += [$p] | if .pokemon[$p] == null then .pokemon[$p] = {"id": $id, "xp": 0, "level": 1} else . end' \
                    "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
                SYSTEM_MESSAGES+=("🏆 업적 달성: ${ACH_NAME}! ${REWARD_POKEMON}을(를) 얻었습니다!")
            fi
        fi
    fi
fi

# ── build output ───────────────────────────────────────────────────────────────

if [[ ${#SYSTEM_MESSAGES[@]} -gt 0 ]]; then
    MSG=$(printf '%s\n' "${SYSTEM_MESSAGES[@]}")
    jq -n --arg msg "$MSG" '{"continue": true, "system_message": $msg}'
else
    echo '{"continue": true}'
fi
