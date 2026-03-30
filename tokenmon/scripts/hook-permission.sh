#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
_TMP=$(mktemp)
trap 'rm -f "$_TMP"' EXIT

# Read stdin (required by hook protocol)
INPUT=$(cat)

STATE_FILE="$TOKENMON_DIR/state.json"
CONFIG_FILE="$TOKENMON_DIR/config.json"
ACHIEVEMENTS_FILE="$TOKENMON_DIR/data/achievements.json"

if [[ ! -f "$STATE_FILE" ]]; then
    echo '{"continue": true}'
    exit 0
fi

# Increment permission_count
NEW_STATE=$(jq '.permission_count += 1' "$STATE_FILE")
echo "$NEW_STATE" > "$STATE_FILE"

PERM_COUNT=$(echo "$NEW_STATE" | jq -r '.permission_count')
SYSTEM_MESSAGES=()

# Check permission_master achievement
if [[ -f "$ACHIEVEMENTS_FILE" ]]; then
    ALREADY_ACHIEVED=$(echo "$NEW_STATE" | jq -r '.achievements.permission_master // empty')
    if [[ -z "$ALREADY_ACHIEVED" && "$PERM_COUNT" -ge 50 ]]; then
        ACH_NAME=$(jq -r '.achievements[] | select(.id == "permission_master") | .name' "$ACHIEVEMENTS_FILE")
        REWARD_MSG=$(jq -r '.achievements[] | select(.id == "permission_master") | .reward_message // empty' "$ACHIEVEMENTS_FILE")
        jq '.achievements.permission_master = true | .max_party_size = ((.max_party_size // 6) + 1 | if . > 7 then 7 else . end)' "$STATE_FILE" > "$_TMP" && mv "$_TMP" "$STATE_FILE"
        # Also update config max_party_size
        if [[ -f "$CONFIG_FILE" ]]; then
            jq '.max_party_size = ((.max_party_size // 6) + 1 | if . > 7 then 7 else . end)' "$CONFIG_FILE" > "$_TMP" && mv "$_TMP" "$CONFIG_FILE"
        fi
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
