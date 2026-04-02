#!/bin/bash
# Resolve tsx: local node_modules → system tsx → fail fast
# Never use npx fallback — it can hang downloading and block Claude Code.

# Resolve plugin root: CLAUDE_PLUGIN_ROOT → script directory parent
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
LOCAL_TSX="${PLUGIN_DIR}/node_modules/.bin/tsx"
if [ -x "$LOCAL_TSX" ]; then
  exec "$LOCAL_TSX" "$@"
elif command -v tsx >/dev/null 2>&1; then
  exec tsx "$@"
else
  echo "⚠️ tsx not found. Run: npm install --prefix $PLUGIN_DIR"
  echo "⚠️ tsx not found. Run: npm install --prefix $PLUGIN_DIR" >&2
  echo '{"continue": true}'
  exit 0
fi
