#!/usr/bin/env bash
# setup-relay-local.sh — One-click local setup for tokenmon remote sound relay.
#
# Run this on your LOCAL machine (the one with speakers).
# It syncs sound files from the remote, creates the relay symlink, and verifies.
#
# Usage:
#   ./scripts/setup-relay-local.sh <REMOTE_HOST> [LOCAL_TKM_ROOT] [PEON_DIR]
#
# Arguments:
#   REMOTE_HOST     SSH alias or hostname (e.g., 40614_out)
#   LOCAL_TKM_ROOT  Local tokenmon plugin root (default: ~/.claude/plugins/marketplaces/tkm)
#   PEON_DIR        Local peon-ping directory (default: ~/.claude/hooks/peon-ping)
#
# Example:
#   ./scripts/setup-relay-local.sh 40614_out

set -euo pipefail

REMOTE_HOST="${1:?Usage: $0 <REMOTE_HOST> [LOCAL_TKM_ROOT] [PEON_DIR]}"
LOCAL_TKM_ROOT="${2:-$HOME/.claude/plugins/marketplaces/tkm}"
PEON_DIR="${3:-$HOME/.claude/hooks/peon-ping}"
SYMLINK_NAME="tkm-sounds"

echo "=== Tokenmon Remote Sound Relay — Local Setup ==="
echo ""
echo "  Remote host:   ${REMOTE_HOST}"
echo "  Local TKM:     ${LOCAL_TKM_ROOT}"
echo "  Peon-ping dir: ${PEON_DIR}"
echo "  Symlink name:  ${SYMLINK_NAME}"
echo ""

# ── Step 1: Check prerequisites ──
echo "[1/5] Checking prerequisites..."

if ! command -v rsync &>/dev/null; then
  echo "  ERROR: rsync not found. Install it first." >&2
  exit 1
fi
echo "  rsync: OK"

if [ ! -d "${PEON_DIR}" ]; then
  echo "  ERROR: peon-ping directory not found at ${PEON_DIR}" >&2
  echo "  Install peon-ping first." >&2
  exit 1
fi
echo "  peon-ping dir: OK"

# ── Step 2: Check relay health ──
echo "[2/5] Checking relay health..."

if curl -sf --max-time 2 http://localhost:19998/health >/dev/null 2>&1; then
  echo "  Relay: OK (localhost:19998)"
else
  echo "  WARNING: Relay not responding on localhost:19998"
  echo "  Start it with: peon relay --daemon"
  echo "  Continuing setup anyway..."
fi

# ── Step 3: Sync sound files ──
echo "[3/5] Syncing sound files from ${REMOTE_HOST}..."

REMOTE_TKM="~/.claude/plugins/marketplaces/tkm"
mkdir -p "${LOCAL_TKM_ROOT}/cries" "${LOCAL_TKM_ROOT}/sfx"

echo "  Syncing cries/..."
rsync -az "${REMOTE_HOST}:${REMOTE_TKM}/cries/" "${LOCAL_TKM_ROOT}/cries/" 2>/dev/null || {
  echo "  WARNING: Could not sync cries/ — check SSH access to ${REMOTE_HOST}"
}

echo "  Syncing sfx/..."
rsync -az "${REMOTE_HOST}:${REMOTE_TKM}/sfx/" "${LOCAL_TKM_ROOT}/sfx/" 2>/dev/null || {
  echo "  WARNING: Could not sync sfx/ — check SSH access to ${REMOTE_HOST}"
}

cry_count=$(find "${LOCAL_TKM_ROOT}/cries" -type f 2>/dev/null | wc -l)
sfx_count=$(find "${LOCAL_TKM_ROOT}/sfx" -type f 2>/dev/null | wc -l)
echo "  Synced: ${cry_count} cries, ${sfx_count} sfx files"

# ── Step 4: Create symlink ──
echo "[4/5] Creating symlink..."

SYMLINK_PATH="${PEON_DIR}/${SYMLINK_NAME}"
if [ -L "${SYMLINK_PATH}" ]; then
  current_target=$(readlink -f "${SYMLINK_PATH}" 2>/dev/null || echo "unknown")
  if [ "${current_target}" = "$(readlink -f "${LOCAL_TKM_ROOT}" 2>/dev/null)" ]; then
    echo "  Symlink already exists and points to correct target"
  else
    echo "  Updating symlink (was: ${current_target})"
    ln -sfn "${LOCAL_TKM_ROOT}" "${SYMLINK_PATH}"
  fi
elif [ -e "${SYMLINK_PATH}" ]; then
  echo "  WARNING: ${SYMLINK_PATH} exists but is not a symlink. Skipping."
  echo "  Remove it manually and re-run if needed."
else
  ln -sfn "${LOCAL_TKM_ROOT}" "${SYMLINK_PATH}"
  echo "  Created: ${SYMLINK_PATH} -> ${LOCAL_TKM_ROOT}"
fi

# ── Step 5: Verify ──
echo "[5/5] Verifying..."

errors=0

if [ ! -L "${SYMLINK_PATH}" ]; then
  echo "  FAIL: Symlink not found at ${SYMLINK_PATH}"
  errors=$((errors + 1))
else
  echo "  Symlink: OK"
fi

if [ "${cry_count}" -eq 0 ]; then
  echo "  FAIL: No cry files found"
  errors=$((errors + 1))
else
  echo "  Cry files: OK (${cry_count})"
fi

if curl -sf --max-time 2 http://localhost:19998/health >/dev/null 2>&1; then
  # Try playing a test sound
  test_file=$(find "${LOCAL_TKM_ROOT}/sfx" -name "*.wav" -o -name "*.ogg" | head -1)
  if [ -n "${test_file}" ]; then
    rel_path="${SYMLINK_NAME}/sfx/$(basename "${test_file}")"
    encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${rel_path}'))" 2>/dev/null || echo "${rel_path}")
    if curl -sf --max-time 3 -H "X-Volume: 0.3" "http://localhost:19998/play?file=${encoded}" >/dev/null 2>&1; then
      echo "  Sound test: OK (you should have heard a sound!)"
    else
      echo "  Sound test: FAIL (relay returned error)"
      errors=$((errors + 1))
    fi
  else
    echo "  Sound test: SKIP (no sfx files found)"
  fi
else
  echo "  Sound test: SKIP (relay not running)"
fi

echo ""
if [ "${errors}" -eq 0 ]; then
  echo "=== Local setup complete! ==="
  echo ""
  echo "Next: On the REMOTE machine, run the relay-setup skill or set config manually:"
  echo "  tokenmon config set relay_audio true"
  echo "  tokenmon config set relay_sound_root ${SYMLINK_NAME}"
  echo ""
  echo "Or use the skill: /tkm:relay-setup"
else
  echo "=== Setup completed with ${errors} warning(s). Check above. ==="
fi
