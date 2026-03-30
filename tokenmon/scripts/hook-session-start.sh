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

# Ensure files exist
if [[ ! -f "$STATE_FILE" ]]; then
    echo '{"pokemon":{},"unlocked":[],"achievements":{},"total_tokens_consumed":0,"session_count":0,"error_count":0,"permission_count":0,"evolution_count":0,"last_session_id":null,"xp_bonus_multiplier":1.0,"last_session_tokens":{}}' > "$STATE_FILE"
fi
if [[ ! -f "$SESSION_FILE" ]]; then
    echo '{"session_id":null,"agent_assignments":[],"evolution_events":[],"achievement_events":[]}' > "$SESSION_FILE"
fi

# Reset session.json for new session
jq -n \
    --arg sid "$SESSION_ID" \
    '{"session_id": $sid, "agent_assignments": [], "evolution_events": [], "achievement_events": []}' \
    > "$SESSION_FILE"

# Increment session_count in state.json
NEW_STATE=$(jq '.session_count += 1 | .last_session_id = $sid' \
    --arg sid "$SESSION_ID" \
    "$STATE_FILE")
echo "$NEW_STATE" > "$STATE_FILE"

SESSION_COUNT=$(echo "$NEW_STATE" | jq -r '.session_count')

# Check first_session achievement
ACHIEVEMENTS_FILE="$TOKENMON_DIR/data/achievements.json"
SYSTEM_MESSAGES=()

if [[ -f "$ACHIEVEMENTS_FILE" ]]; then
    ALREADY_ACHIEVED=$(echo "$NEW_STATE" | jq -r '.achievements.first_session // empty')
    if [[ -z "$ALREADY_ACHIEVED" && "$SESSION_COUNT" -ge 1 ]]; then
        # Unlock first_session achievement
        REWARD_POKEMON=$(jq -r '.achievements[] | select(.id == "first_session") | .reward_pokemon // empty' "$ACHIEVEMENTS_FILE")
        ACH_NAME=$(jq -r '.achievements[] | select(.id == "first_session") | .name' "$ACHIEVEMENTS_FILE")

        UPDATED_STATE=$(jq '.achievements.first_session = true' "$STATE_FILE")
        if [[ -n "$REWARD_POKEMON" ]]; then
            # Add to unlocked if not already there
            ALREADY_UNLOCKED=$(echo "$UPDATED_STATE" | jq -r --arg p "$REWARD_POKEMON" '.unlocked | index($p)')
            if [[ "$ALREADY_UNLOCKED" == "null" ]]; then
                UPDATED_STATE=$(echo "$UPDATED_STATE" | jq --arg p "$REWARD_POKEMON" '.unlocked += [$p]')
                # Initialize pokemon in state if not present
                POKEMON_JSON="$TOKENMON_DIR/data/pokemon.json"
                if [[ -f "$POKEMON_JSON" ]]; then
                    POKEMON_ID=$(jq -r --arg name "$REWARD_POKEMON" '.pokemon[$name].id // 0' "$POKEMON_JSON")
                    UPDATED_STATE=$(echo "$UPDATED_STATE" | jq \
                        --arg p "$REWARD_POKEMON" \
                        --argjson id "$POKEMON_ID" \
                        'if .pokemon[$p] == null then .pokemon[$p] = {"id": $id, "xp": 0, "level": 1} else . end')
                fi
            fi
        fi
        echo "$UPDATED_STATE" > "$STATE_FILE"
        SYSTEM_MESSAGES+=("🏆 업적 달성: ${ACH_NAME}! ${REWARD_POKEMON}을(를) 얻었습니다!")
    fi

    # Check ten_sessions achievement
    ALREADY_TEN=$(echo "$NEW_STATE" | jq -r '.achievements.ten_sessions // empty')
    if [[ -z "$ALREADY_TEN" && "$SESSION_COUNT" -ge 10 ]]; then
        ACH_NAME=$(jq -r '.achievements[] | select(.id == "ten_sessions") | .name' "$ACHIEVEMENTS_FILE")
        REWARD_MSG=$(jq -r '.achievements[] | select(.id == "ten_sessions") | .reward_message // empty' "$ACHIEVEMENTS_FILE")
        jq '.achievements.ten_sessions = true | .xp_bonus_multiplier = (.xp_bonus_multiplier + 0.2)' "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
        SYSTEM_MESSAGES+=("🏆 업적 달성: ${ACH_NAME}! ${REWARD_MSG}")
    fi
fi

# Play cry async
if [[ -f "$CONFIG_FILE" ]]; then
    bash "$TOKENMON_DIR/scripts/play-cry.sh" &>/dev/null &
fi

# Build output
if [[ ${#SYSTEM_MESSAGES[@]} -gt 0 ]]; then
    MSG=$(printf '%s\n' "${SYSTEM_MESSAGES[@]}")
    jq -n --arg msg "$MSG" '{"continue": true, "system_message": $msg}'
else
    echo '{"continue": true}'
fi
