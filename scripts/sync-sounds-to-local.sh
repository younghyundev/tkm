#!/usr/bin/env bash
# sync-sounds-to-local.sh — Mirror tokenmon sound files from a remote host to local.
#
# Usage:
#   ./scripts/sync-sounds-to-local.sh <REMOTE_HOST> [LOCAL_TKM_ROOT]
#
# Arguments:
#   REMOTE_HOST     SSH alias or hostname (e.g., 40614_out)
#   LOCAL_TKM_ROOT  Local tokenmon plugin root (default: ~/.claude/plugins/marketplaces/tkm)
#
# Example:
#   ./scripts/sync-sounds-to-local.sh 40614_out
#   ./scripts/sync-sounds-to-local.sh myserver ~/.claude/plugins/marketplaces/tkm

set -euo pipefail

REMOTE_HOST="${1:?Usage: $0 <REMOTE_HOST> [LOCAL_TKM_ROOT]}"
LOCAL_TKM_ROOT="${2:-$HOME/.claude/plugins/marketplaces/tkm}"

# Dynamically resolve remote tokenmon plugin root (marketplace or cache install)
echo "Resolving remote tokenmon plugin root on ${REMOTE_HOST}..."
REMOTE_TKM=$(ssh "${REMOTE_HOST}" 'bash -lc "
  mp=\"\$HOME/.claude/plugins/marketplaces/tkm\"
  if [ -d \"\$mp/cries\" ]; then echo \"\$mp\"; exit 0; fi
  cache=\$(ls -d \"\$HOME/.claude/plugins/cache/tkm/tkm/\"*/ 2>/dev/null | sort -V | tail -1)
  if [ -n \"\$cache\" ] && [ -d \"\${cache}cries\" ]; then echo \"\$cache\"; exit 0; fi
  echo \"\"
"' 2>/dev/null) || true

if [ -z "${REMOTE_TKM}" ]; then
  echo "ERROR: Could not find tokenmon plugin root on ${REMOTE_HOST}" >&2
  echo "  Checked: ~/.claude/plugins/marketplaces/tkm" >&2
  echo "  Checked: ~/.claude/plugins/cache/tkm/tkm/*/" >&2
  exit 1
fi
# Trim trailing whitespace/newline
REMOTE_TKM=$(echo "${REMOTE_TKM}" | tr -d '[:space:]')
echo "  Found: ${REMOTE_TKM}"

echo "Syncing tokenmon sounds from ${REMOTE_HOST}..."

mkdir -p "${LOCAL_TKM_ROOT}/cries" "${LOCAL_TKM_ROOT}/sfx"

echo "  cries/ ..."
if ! rsync -az --info=progress2 \
  "${REMOTE_HOST}:${REMOTE_TKM}/cries/" \
  "${LOCAL_TKM_ROOT}/cries/"; then
  echo "ERROR: Failed to sync cries/ from ${REMOTE_HOST}" >&2
  exit 1
fi

echo "  sfx/ ..."
if ! rsync -az --info=progress2 \
  "${REMOTE_HOST}:${REMOTE_TKM}/sfx/" \
  "${LOCAL_TKM_ROOT}/sfx/"; then
  echo "ERROR: Failed to sync sfx/ from ${REMOTE_HOST}" >&2
  exit 1
fi

# Verify synced files
cry_count=$(find "${LOCAL_TKM_ROOT}/cries" -type f 2>/dev/null | wc -l)
sfx_count=$(find "${LOCAL_TKM_ROOT}/sfx" -type f 2>/dev/null | wc -l)

if [ "${cry_count}" -eq 0 ] && [ "${sfx_count}" -eq 0 ]; then
  echo "ERROR: No sound files synced. Remote directory may be empty." >&2
  exit 1
fi

echo "Done. Synced ${cry_count} cries + ${sfx_count} sfx to: ${LOCAL_TKM_ROOT}"
echo ""
echo "Next: create symlink for the peon-ping relay:"
echo "  ln -sfn ${LOCAL_TKM_ROOT} ~/.claude/hooks/peon-ping/tkm-sounds"
