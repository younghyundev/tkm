#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
_TMP=$(mktemp)
trap 'rm -f "$_TMP"' EXIT

INPUT=$(cat)
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty' 2>/dev/null || echo "")

if [[ -z "$AGENT_ID" ]]; then
    echo '{"continue": true}'
    exit 0
fi

SESSION_FILE="$TOKENMON_DIR/session.json"
CONFIG_FILE="$TOKENMON_DIR/config.json"

if [[ ! -f "$SESSION_FILE" || ! -f "$CONFIG_FILE" ]]; then
    echo '{"continue": true}'
    exit 0
fi

# Use flock to safely update session.json
(
    flock -x 200

    # Read current assignments
    ASSIGNMENTS=$(jq -r '.agent_assignments // []' "$SESSION_FILE")
    ASSIGNED_POKEMON=$(echo "$ASSIGNMENTS" | jq -r '.[].pokemon' 2>/dev/null || echo "")

    # Get party members
    PARTY_RAW=$(jq -r '.party[]' "$CONFIG_FILE" 2>/dev/null || echo "")
    mapfile -t PARTY <<< "$PARTY_RAW"

    # Find first unassigned party pokemon
    CHOSEN=""
    for p in "${PARTY[@]}"; do
        [[ -z "$p" ]] && continue
        # Check if already assigned
        ALREADY=$(echo "$ASSIGNMENTS" | jq -r --arg p "$p" 'map(select(.pokemon == $p)) | length')
        if [[ "$ALREADY" == "0" ]]; then
            CHOSEN="$p"
            break
        fi
    done

    if [[ -n "$CHOSEN" ]]; then
        # Add assignment
        jq --arg agent "$AGENT_ID" --arg pokemon "$CHOSEN" \
            '.agent_assignments += [{"agent_id": $agent, "pokemon": $pokemon}]' \
            "$SESSION_FILE" > "$_TMP" && mv "$_TMP" "$SESSION_FILE"
    fi

) 200>"$SESSION_FILE.lock"

echo '{"continue": true}'
