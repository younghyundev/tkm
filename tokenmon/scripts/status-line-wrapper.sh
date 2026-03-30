#!/usr/bin/env bash
# Runs existing statusLine + tokenmon statusLine
node $HOME/.claude/hud/omc-hud.mjs 2>/dev/null || true
"/home/minsiwon00/claude/tokenmon/node_modules/.bin/tsx" "/home/minsiwon00/claude/tokenmon/src/status-line.ts" 2>/dev/null || true
