---
description: "Tokenmon install diagnostics. Verify dependencies, StatusLine, CLI, data, assets, sprite rendering. Korean: doctor, 진단, 설치 확인, 안 돼요"
---

# Tokenmon Doctor

Diagnose the tokenmon plugin installation and find any issues.

## Test Flow

Run each step in order using the Bash tool. Record PASS/FAIL for each step.

### Step 1: Plugin Cache

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | head -1)
if [ -z "$PLUGIN_ROOT" ]; then
  echo "FAIL: plugin cache not found. Run '/plugin install tkm@tkm' first."
  exit 1
fi
echo "Plugin root: $PLUGIN_ROOT"
cat "$PLUGIN_ROOT/package.json" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log('Version:', d.version)"
echo "PASS: plugin cache exists"
```

### Step 2: npm install

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
cd "$PLUGIN_ROOT" && npm install 2>&1 | tail -3
echo "---"
[ -f "$PLUGIN_ROOT/bin/tsx-resolve.sh" ] && echo "PASS: npm install" || echo "FAIL: tsx not found"
```

### Step 3: StatusLine Integration

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/setup/setup-statusline.ts" 2>&1
echo "---"
node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/settings.json', 'utf-8'));
console.log(d.statusLine ? 'PASS: statusLine configured' : 'FAIL: statusLine missing');
"
```

### Step 4: CLI Command Verification

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
TSX="$PLUGIN_ROOT/bin/tsx-resolve.sh"
CLI="$PLUGIN_ROOT/src/cli/tokenmon.ts"
PASS=0; TOTAL=0

for cmd in "help" "status" "pokedex" "region" "region list" "items" "achievements"; do
  TOTAL=$((TOTAL + 1))
  if $TSX $CLI $cmd > /dev/null 2>&1; then
    echo "PASS: $cmd"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $cmd"
  fi
done

echo "---"
[ "$PASS" -eq "$TOTAL" ] && echo "PASS: CLI commands ($PASS/$TOTAL)" || echo "FAIL: CLI commands ($PASS/$TOTAL)"
```

### Step 5: Data Integrity

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
node -e "
const d = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/pokemon.json', 'utf-8'));
const r = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/regions.json', 'utf-8'));
const a = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/achievements.json', 'utf-8'));

const pokemonCount = Object.keys(d.pokemon).length;
const checks = [
  ['pokemon count > 0 (' + pokemonCount + ')', pokemonCount > 0],
  ['type_chart exists', !!d.type_chart && Object.keys(d.type_chart).length >= 17],
  ['rarity_weights sum ~1.0', Math.abs(Object.values(d.rarity_weights).reduce((a,b)=>a+b,0) - 1.0) < 0.01],
  ['regions >= 8', Object.keys(r.regions).length >= 8],
  ['achievements >= 20', a.achievements.length >= 20],
  ['starters === 3', d.starters.length === 3],
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS: ' + name : 'FAIL: ' + name);
  if (ok) pass++;
}
console.log('---');
console.log(pass === checks.length ? 'PASS: data integrity' : 'FAIL: data integrity (' + pass + '/' + checks.length + ')');
"
```

### Step 6: Asset Files

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
EXPECTED=$(node -e "const d=JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/pokemon.json','utf-8'));console.log(Object.keys(d.pokemon).length)")
CRIES=$(ls "$PLUGIN_ROOT/cries/"*.ogg 2>/dev/null | wc -l)
SPRITES=$(ls "$PLUGIN_ROOT/sprites/terminal/"*.txt 2>/dev/null | wc -l)
SFX=$(ls "$PLUGIN_ROOT/sfx/"*.wav 2>/dev/null | wc -l)

[ "$CRIES" -eq "$EXPECTED" ] && echo "PASS: cries ($CRIES)" || echo "FAIL: cries ($CRIES/$EXPECTED)"
[ "$SPRITES" -eq "$EXPECTED" ] && echo "PASS: sprites ($SPRITES)" || echo "FAIL: sprites ($SPRITES/$EXPECTED)"
[ "$SFX" -ge 1 ] && echo "PASS: sfx ($SFX)" || echo "FAIL: sfx ($SFX)"
echo "---"
[ "$CRIES" -eq "$EXPECTED" ] && [ "$SPRITES" -eq "$EXPECTED" ] && [ "$SFX" -ge 1 ] && echo "PASS: assets" || echo "FAIL: assets"
```

### Step 7: Starter & Party Check (read-only)

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
TSX="$PLUGIN_ROOT/bin/tsx-resolve.sh"
CLI="$PLUGIN_ROOT/src/cli/tokenmon.ts"

CONFIG_FILE=~/.claude/tokenmon/config.json
if [ ! -f "$CONFIG_FILE" ]; then
  echo "FAIL: config not found at $CONFIG_FILE"
  echo "  → Run 'tokenmon starter' to choose your starter"
else
  STARTER_CHOSEN=$(node -e "try{const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));console.log(c.starter_chosen?'yes':'no')}catch(e){console.log('error: '+e.message)}")
  if [ "$STARTER_CHOSEN" = "yes" ]; then
    echo "PASS: starter chosen"
  else
    echo "FAIL: starter not chosen"
    echo "  → Run 'tokenmon starter' to choose your starter"
  fi
fi
echo "---"
OUTPUT=$("$TSX" "$CLI" status 2>&1)
echo "$OUTPUT"
echo "---"
echo "$OUTPUT" | grep -qE "Lv\." && echo "PASS: party has pokemon" || echo "FAIL: no pokemon in party (run 'tokenmon starter')"
```

### Step 8: Visual QA

Render and visually verify CLI output.

**8a. Status Line**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/status-line.ts" 2>&1
```

Check: sprite ANSI art + Pokémon name + level + XP bar

**8b. Pokédex List**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/cli/tokenmon.ts" pokedex 2>&1 | head -20
```

Check: status icons (●/◐/○), type colors, Pokémon number alignment

**8c. Pokédex Detail**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/cli/tokenmon.ts" pokedex Turtwig 2>&1
```

Check: type, stats, evolution line, rarity, catch status

**8d. Region List**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/cli/tokenmon.ts" region list 2>&1
```

Check: 9 regions, lock/unlock (●/○), current location marker

**8e. Sprite Samples (5)**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ | head -1)
for id in 387 393 448 483 493; do
  echo "=== #$id ==="
  cat "$PLUGIN_ROOT/sprites/terminal/$id.txt"
  echo ""
done
```

Check: ANSI half-block art renders as Pokémon silhouette with correct colors

**Visual Verdict**: Run `/oh-my-claudecode:visual-verdict` if available. Otherwise show output to user for visual confirmation.

Success criteria: no broken rendering

### Step 9: Report

Summarize all results:

```
=== Tokenmon Install Report ===
Step 1: Plugin cache        [PASS/FAIL]
Step 2: npm install         [PASS/FAIL]
Step 3: StatusLine          [PASS/FAIL]
Step 4: CLI commands        [PASS/FAIL]
Step 5: Data integrity      [PASS/FAIL]
Step 6: Assets              [PASS/FAIL]
Step 7: Starter             [PASS/FAIL]
Step 8: Visual QA           [PASS/FAIL]
==============================
Result: X/8 PASS
```

## Options

- `--skip-visual`: Skip Step 8 Visual QA
