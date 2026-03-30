#!/usr/bin/env bash
# Tokénmon statusLine wrapper
# Runs existing statusLine command (if any) + appends tokenmon status

export PATH="$HOME/.local/bin:$PATH"
_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
TOKENMON_DIR="$(cd "$(dirname "$_SELF")/.." && pwd)"

# Run the original statusLine command (saved during install)
ORIGINAL_CMD_FILE="$TOKENMON_DIR/.original-statusline"
if [[ -f "$ORIGINAL_CMD_FILE" ]]; then
    ORIGINAL_CMD=$(cat "$ORIGINAL_CMD_FILE")
    if [[ -n "$ORIGINAL_CMD" ]]; then
        eval "$ORIGINAL_CMD" 2>/dev/null || true
    fi
fi

# Append tokenmon status
"$TOKENMON_DIR/scripts/status-line.sh" 2>/dev/null || true
