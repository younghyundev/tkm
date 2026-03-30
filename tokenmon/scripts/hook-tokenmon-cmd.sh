#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")

# Strip leading slash and whitespace
CMD=$(echo "$PROMPT" | sed 's|^[/ ]*||')

# Only handle tokenmon commands — exit silently for everything else
if [[ ! "$CMD" =~ ^tokenmon ]]; then
    exit 0
fi

# Extract arguments after "tokenmon"
ARGS="${CMD#tokenmon}"
ARGS=$(echo "$ARGS" | sed 's|^ *||')

# Run tokenmon CLI and capture output
OUTPUT=$(bash "$TOKENMON_DIR/tokenmon.sh" $ARGS 2>&1 || true)

# Strip ANSI color codes for clean display
CLEAN=$(echo "$OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

# Block the prompt from being sent to Claude and add output as context
jq -n --arg msg "$CLEAN" '{
    "decision": "block",
    "reason": $msg
}'
