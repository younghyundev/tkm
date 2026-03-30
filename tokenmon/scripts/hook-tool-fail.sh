#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Read stdin
INPUT=$(cat)

STATE_FILE="$TOKENMON_DIR/state.json"
CONFIG_FILE="$TOKENMON_DIR/config.json"
ACHIEVEMENTS_FILE="$TOKENMON_DIR/data/achievements.json"
POKEMON_JSON="$TOKENMON_DIR/data/pokemon.json"

if [[ ! -f "$STATE_FILE" ]]; then
    echo '{"continue": true}'
    exit 0
fi

# Increment error_count
NEW_STATE=$(jq '.error_count += 1' "$STATE_FILE")
echo "$NEW_STATE" > "$STATE_FILE"

ERROR_COUNT=$(echo "$NEW_STATE" | jq -r '.error_count')
SYSTEM_MESSAGES=()

# Check first_error achievement
if [[ -f "$ACHIEVEMENTS_FILE" ]]; then
    ALREADY_ACHIEVED=$(echo "$NEW_STATE" | jq -r '.achievements.first_error // empty')
    if [[ -z "$ALREADY_ACHIEVED" && "$ERROR_COUNT" -ge 1 ]]; then
        ACH_NAME=$(jq -r '.achievements[] | select(.id == "first_error") | .name' "$ACHIEVEMENTS_FILE")
        REWARD_POKEMON=$(jq -r '.achievements[] | select(.id == "first_error") | .reward_pokemon // empty' "$ACHIEVEMENTS_FILE")

        UPDATED_STATE=$(jq '.achievements.first_error = true' "$STATE_FILE")

        if [[ -n "$REWARD_POKEMON" && -f "$POKEMON_JSON" ]]; then
            ALREADY_UNLOCKED=$(echo "$UPDATED_STATE" | jq -r --arg p "$REWARD_POKEMON" '.unlocked | index($p)')
            if [[ "$ALREADY_UNLOCKED" == "null" ]]; then
                UPDATED_STATE=$(echo "$UPDATED_STATE" | jq --arg p "$REWARD_POKEMON" '.unlocked += [$p]')
                POKEMON_ID=$(jq -r --arg name "$REWARD_POKEMON" '.pokemon[$name].id // 0' "$POKEMON_JSON")
                UPDATED_STATE=$(echo "$UPDATED_STATE" | jq \
                    --arg p "$REWARD_POKEMON" \
                    --argjson id "$POKEMON_ID" \
                    'if .pokemon[$p] == null then .pokemon[$p] = {"id": $id, "xp": 0, "level": 1} else . end')
                SYSTEM_MESSAGES+=("🏆 업적 달성: ${ACH_NAME}! ${REWARD_POKEMON}을(를) 얻었습니다!")
            fi
        fi
        echo "$UPDATED_STATE" > "$STATE_FILE"
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
