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

REMOTE_TKM="~/.claude/plugins/marketplaces/tkm"

echo "Syncing tokenmon sounds from ${REMOTE_HOST}..."

mkdir -p "${LOCAL_TKM_ROOT}/cries" "${LOCAL_TKM_ROOT}/sfx"

echo "  cries/ ..."
rsync -az --info=progress2 \
  "${REMOTE_HOST}:${REMOTE_TKM}/cries/" \
  "${LOCAL_TKM_ROOT}/cries/"

echo "  sfx/ ..."
rsync -az --info=progress2 \
  "${REMOTE_HOST}:${REMOTE_TKM}/sfx/" \
  "${LOCAL_TKM_ROOT}/sfx/"

echo "Done. Synced to: ${LOCAL_TKM_ROOT}"
echo ""
echo "Next: create symlink for the peon-ping relay:"
echo "  ln -sfn ${LOCAL_TKM_ROOT} ~/.claude/hooks/peon-ping/tkm-sounds"
