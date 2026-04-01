#!/bin/bash
# Resolve tsx: local node_modules → system tsx → npx tsx
LOCAL_TSX="${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx"
if [ -x "$LOCAL_TSX" ]; then
  exec "$LOCAL_TSX" "$@"
elif command -v tsx >/dev/null 2>&1; then
  exec tsx "$@"
else
  exec npx -y tsx "$@"
fi
