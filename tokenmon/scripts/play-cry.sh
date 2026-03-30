#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

TOKENMON_DIR="${TOKENMON_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Parse arguments
TEST_MODE=false
POKEMON_NAME=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --test) TEST_MODE=true; shift ;;
        *) POKEMON_NAME="$1"; shift ;;
    esac
done

# Read config
CONFIG_FILE="$TOKENMON_DIR/config.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    exit 0
fi

CRY_ENABLED=$(jq -r '.cry_enabled // true' "$CONFIG_FILE" 2>/dev/null || echo "true")
if [[ "$CRY_ENABLED" != "true" ]]; then
    exit 0
fi

VOLUME=$(jq -r '.volume // 0.5' "$CONFIG_FILE" 2>/dev/null || echo "0.5")

# Determine which pokemon to play
if [[ -z "$POKEMON_NAME" ]]; then
    # Pick random from party
    PARTY=$(jq -r '.party[]' "$CONFIG_FILE" 2>/dev/null || echo "")
    if [[ -z "$PARTY" ]]; then
        exit 0
    fi
    # Convert to array and pick random
    mapfile -t PARTY_ARRAY <<< "$PARTY"
    PARTY_SIZE=${#PARTY_ARRAY[@]}
    if [[ $PARTY_SIZE -eq 0 ]]; then
        exit 0
    fi
    RANDOM_IDX=$(( RANDOM % PARTY_SIZE ))
    POKEMON_NAME="${PARTY_ARRAY[$RANDOM_IDX]}"
fi

# Get pokemon ID from pokemon.json
POKEMON_JSON="$TOKENMON_DIR/data/pokemon.json"
if [[ ! -f "$POKEMON_JSON" ]]; then
    exit 0
fi

POKEMON_ID=$(jq -r --arg name "$POKEMON_NAME" '.pokemon[$name].id // empty' "$POKEMON_JSON" 2>/dev/null || echo "")
if [[ -z "$POKEMON_ID" ]]; then
    exit 0
fi

# Find cry file
CRY_DIR="$TOKENMON_DIR/cries"
CRY_FILE=""
for ext in wav mp3 ogg; do
    candidate="$CRY_DIR/${POKEMON_ID}.${ext}"
    if [[ -f "$candidate" ]]; then
        CRY_FILE="$candidate"
        break
    fi
done

if [[ -z "$CRY_FILE" ]]; then
    exit 0
fi

if [[ "$TEST_MODE" == "true" ]]; then
    echo "Would play: $CRY_FILE (volume: $VOLUME)"
    exit 0
fi

# Detect WSL2
IS_WSL=false
if grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=true
fi

play_sound() {
    local file="$1"
    local vol="$2"

    if [[ "$IS_WSL" == "true" ]]; then
        # Try powershell.exe
        POWERSHELL_EXE=""
        if command -v powershell.exe &>/dev/null; then
            POWERSHELL_EXE="powershell.exe"
        elif [[ -f /mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe ]]; then
            POWERSHELL_EXE="/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe"
        elif [[ -f /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe ]]; then
            POWERSHELL_EXE="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
        fi

        if [[ -n "$POWERSHELL_EXE" ]]; then
            PS1_SCRIPT="$TOKENMON_DIR/scripts/tokenmon-play.ps1"
            WIN_FILE=$(wslpath -w "$file" 2>/dev/null || echo "$file")
            WIN_PS1=$(wslpath -w "$PS1_SCRIPT" 2>/dev/null || echo "$PS1_SCRIPT")
            "$POWERSHELL_EXE" -NonInteractive -NoProfile -ExecutionPolicy Bypass \
                -File "$WIN_PS1" -FilePath "$WIN_FILE" -Volume "$vol" &>/dev/null &
            return 0
        fi
    fi

    # Linux audio players
    if command -v aplay &>/dev/null; then
        aplay -q "$file" &>/dev/null &
        return 0
    fi
    if command -v ffplay &>/dev/null; then
        ffplay -nodisp -autoexit -volume "$(echo "$vol * 100" | bc | cut -d. -f1)" "$file" &>/dev/null &
        return 0
    fi
    if command -v mpv &>/dev/null; then
        mpv --no-video --volume="$(echo "$vol * 100" | bc | cut -d. -f1)" "$file" &>/dev/null &
        return 0
    fi
    if command -v cvlc &>/dev/null; then
        cvlc --intf dummy --play-and-exit "$file" &>/dev/null &
        return 0
    fi
}

play_sound "$CRY_FILE" "$VOLUME"

# Optional peon-ping integration
PEON_PING=$(jq -r '.peon_ping_integration // false' "$CONFIG_FILE" 2>/dev/null || echo "false")
if [[ "$PEON_PING" == "true" ]]; then
    PEON_PORT=$(jq -r '.peon_ping_port // 19998' "$CONFIG_FILE" 2>/dev/null || echo "19998")
    curl -s --max-time 1 "http://localhost:${PEON_PORT}/ping" &>/dev/null || true
fi

exit 0
