#!/bin/bash
# Resolve tsx: local node_modules → system tsx → fail fast
# Never use npx fallback — it can hang downloading and block Claude Code.
LOCAL_TSX="${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx"
if [ -x "$LOCAL_TSX" ]; then
  exec "$LOCAL_TSX" "$@"
elif command -v tsx >/dev/null 2>&1; then
  exec tsx "$@"
else
  echo "⚠️ tsx not found. Run: npm install --prefix $CLAUDE_PLUGIN_ROOT"
  echo "⚠️ tsx not found. Run: npm install --prefix $CLAUDE_PLUGIN_ROOT" >&2
  echo '{"continue": true}'
  exit 0
fi
