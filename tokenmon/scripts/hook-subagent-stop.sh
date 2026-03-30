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

if [[ ! -f "$SESSION_FILE" ]]; then
    echo '{"continue": true}'
    exit 0
fi

# Use flock to safely update session.json
(
    flock -x 200

    jq --arg agent "$AGENT_ID" \
        '.agent_assignments = [.agent_assignments[] | select(.agent_id != $agent)]' \
        "$SESSION_FILE" > "$_TMP" && mv "$_TMP" "$SESSION_FILE"

) 200>"$SESSION_FILE.lock"

echo '{"continue": true}'
