---
description: "Tokenmon install diagnostics. Verify dependencies, StatusLine, CLI, data, assets, sprite rendering, multi-gen migration. Korean: doctor, 진단, 설치 확인, 안 돼요"
---

# Tokenmon Doctor

Diagnose the tokenmon plugin installation and find any issues. Auto-fix when possible.

## Test Flow

Run each step in order using the Bash tool. Record PASS/FAIL for each step.

### Step 1: Plugin Cache

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
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
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
cd "$PLUGIN_ROOT" && npm install 2>&1 | tail -3
echo "---"
[ -d "$PLUGIN_ROOT/node_modules/.bin" ] && "$PLUGIN_ROOT/bin/tsx-resolve.sh" --version > /dev/null 2>&1 && echo "PASS: npm install + tsx" || echo "FAIL: tsx not found — run: npm install --prefix $PLUGIN_ROOT"
```

If FAIL: auto-fix by running `cd "$PLUGIN_ROOT" && npm install`.

### Step 3: Multi-Generation Migration

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
node -e "
const fs = require('fs');
const home = process.env.HOME || require('os').homedir();
const dataDir = (process.env.CLAUDE_CONFIG_DIR || home + '/.claude') + '/tokenmon';
const results = [];

// 3a: global-config.json
const globalCfg = dataDir + '/global-config.json';
if (fs.existsSync(globalCfg)) {
  const gc = JSON.parse(fs.readFileSync(globalCfg, 'utf-8'));
  results.push('PASS: global-config.json (active: ' + gc.active_generation + ', lang: ' + gc.language + ')');
} else {
  results.push('FAIL: global-config.json missing');
}

// 3b: per-gen directories
const gen4State = dataDir + '/gen4/state.json';
const gen4Config = dataDir + '/gen4/config.json';
const rootState = dataDir + '/state.json';
const rootConfig = dataDir + '/config.json';

if (fs.existsSync(gen4State) || fs.existsSync(gen4Config)) {
  results.push('PASS: gen4/ data directory exists');
} else if (fs.existsSync(rootState) || fs.existsSync(rootConfig)) {
  results.push('FAIL: legacy root files need migration to gen4/');
} else {
  results.push('INFO: no save data yet (fresh install)');
}

// 3c: party size cap
if (fs.existsSync(gen4Config)) {
  const cfg = JSON.parse(fs.readFileSync(gen4Config, 'utf-8'));
  if (cfg.max_party_size > 6) {
    results.push('FAIL: max_party_size=' + cfg.max_party_size + ' exceeds cap of 6');
  } else {
    results.push('PASS: max_party_size=' + (cfg.max_party_size || 'default'));
  }
  if (cfg.party && cfg.party.length > (cfg.max_party_size || 6)) {
    results.push('FAIL: party has ' + cfg.party.length + ' members but max is ' + (cfg.max_party_size || 6));
  }
} else if (fs.existsSync(rootConfig)) {
  const cfg = JSON.parse(fs.readFileSync(rootConfig, 'utf-8'));
  if (cfg.max_party_size > 6) {
    results.push('FAIL: max_party_size=' + cfg.max_party_size + ' exceeds cap of 6');
  }
}

// 3d: gen data directories in plugin
const genJson = '$PLUGIN_ROOT' + '/data/generations.json';
if (fs.existsSync(genJson)) {
  const gens = JSON.parse(fs.readFileSync(genJson, 'utf-8'));
  const genIds = Object.keys(gens.generations);
  results.push('PASS: generations.json (' + genIds.join(', ') + ')');
  for (const gid of genIds) {
    const genDir = '$PLUGIN_ROOT' + '/data/' + gid;
    if (fs.existsSync(genDir + '/pokemon.json')) {
      const pdb = JSON.parse(fs.readFileSync(genDir + '/pokemon.json', 'utf-8'));
      results.push('PASS: ' + gid + '/pokemon.json (' + Object.keys(pdb.pokemon).length + ' species)');
    } else {
      results.push('FAIL: ' + gid + '/pokemon.json missing');
    }
  }
} else {
  results.push('FAIL: generations.json missing');
}

results.forEach(r => console.log(r));
"
```

If any FAIL found in migration checks, auto-fix by running postinstall:
```
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/setup/postinstall.ts"
```

### Step 4: StatusLine Integration

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/setup/setup-statusline.ts" 2>&1
echo "---"
node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/settings.json', 'utf-8'));
console.log(d.statusLine ? 'PASS: statusLine configured' : 'FAIL: statusLine missing');
"
```

### Step 5: CLI Command Verification

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
TSX="$PLUGIN_ROOT/bin/tsx-resolve.sh"
CLI="$PLUGIN_ROOT/src/cli/tokenmon.ts"
PASS=0; TOTAL=0

for cmd in "help" "status" "pokedex" "region" "region list" "gen list" "items" "achievements"; do
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

### Step 6: Data Integrity

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
node -e "
const fs = require('fs');
const genJson = '$PLUGIN_ROOT/data/generations.json';
const gens = JSON.parse(fs.readFileSync(genJson, 'utf-8'));
let totalPass = 0, totalChecks = 0;

for (const [gid, gen] of Object.entries(gens.generations)) {
  const dir = '$PLUGIN_ROOT/data/' + gid;
  console.log('--- ' + gid + ' (' + gen.region_name + ') ---');

  const d = JSON.parse(fs.readFileSync(dir + '/pokemon.json', 'utf-8'));
  const r = JSON.parse(fs.readFileSync(dir + '/regions.json', 'utf-8'));
  const a = JSON.parse(fs.readFileSync(dir + '/achievements.json', 'utf-8'));

  const pokemonCount = Object.keys(d.pokemon).length;
  const expectedRange = gen.pokemon_range[1] - gen.pokemon_range[0] + 1;
  const checks = [
    ['pokemon count (' + pokemonCount + ')', pokemonCount > 0],
    ['regions >= 8 (' + Object.keys(r.regions).length + ')', Object.keys(r.regions).length >= 8],
    ['achievements >= 10 (' + a.achievements.length + ')', a.achievements.length >= 10],
    ['i18n en exists', fs.existsSync(dir + '/i18n/en.json')],
    ['i18n ko exists', fs.existsSync(dir + '/i18n/ko.json')],
  ];

  for (const [name, ok] of checks) {
    totalChecks++;
    if (ok) totalPass++;
    console.log(ok ? 'PASS: ' + name : 'FAIL: ' + name);
  }
}

// Shared data
const sharedPath = '$PLUGIN_ROOT/data/shared.json';
totalChecks++;
if (fs.existsSync(sharedPath)) {
  const shared = JSON.parse(fs.readFileSync(sharedPath, 'utf-8'));
  const hasAll = shared.type_chart && shared.type_colors && shared.rarity_weights;
  console.log(hasAll ? 'PASS: shared.json (type_chart + type_colors + rarity_weights)' : 'FAIL: shared.json incomplete');
  if (hasAll) totalPass++;
} else {
  console.log('FAIL: shared.json missing');
}

console.log('---');
console.log(totalPass === totalChecks ? 'PASS: data integrity (' + totalPass + '/' + totalChecks + ')' : 'FAIL: data integrity (' + totalPass + '/' + totalChecks + ')');
"
```

### Step 7: Asset Files

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"

node -e "
const fs = require('fs');
const gens = JSON.parse(fs.readFileSync('$PLUGIN_ROOT/data/generations.json', 'utf-8'));
let allPass = true;

for (const [gid, gen] of Object.entries(gens.generations)) {
  const [start, end] = gen.pokemon_range;
  let cries = 0, rawSprites = 0, brailleSprites = 0;
  for (let id = start; id <= end; id++) {
    if (fs.existsSync('$PLUGIN_ROOT/cries/' + id + '.ogg')) cries++;
    if (fs.existsSync('$PLUGIN_ROOT/sprites/raw/' + id + '.png')) rawSprites++;
    if (fs.existsSync('$PLUGIN_ROOT/sprites/braille/' + id + '.txt')) brailleSprites++;
  }
  const expected = end - start + 1;
  console.log('--- ' + gid + ' (expected: ' + expected + ') ---');
  console.log(cries === expected ? 'PASS: cries (' + cries + ')' : 'FAIL: cries (' + cries + '/' + expected + ')');
  console.log(rawSprites === expected ? 'PASS: raw sprites (' + rawSprites + ')' : 'FAIL: raw sprites (' + rawSprites + '/' + expected + ')');
  console.log(brailleSprites === expected ? 'PASS: braille sprites (' + brailleSprites + ')' : 'FAIL: braille sprites (' + brailleSprites + '/' + expected + ')');
  if (cries !== expected || rawSprites !== expected || brailleSprites !== expected) allPass = false;
}

const sfx = fs.readdirSync('$PLUGIN_ROOT/sfx/').filter(f => f.endsWith('.wav')).length;
console.log(sfx >= 1 ? 'PASS: sfx (' + sfx + ')' : 'FAIL: sfx (' + sfx + ')');
if (sfx < 1) allPass = false;

console.log('---');
console.log(allPass ? 'PASS: assets' : 'FAIL: assets (some missing)');
"
```

### Step 8: Starter & Party Check (read-only)

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
TSX="$PLUGIN_ROOT/bin/tsx-resolve.sh"
CLI="$PLUGIN_ROOT/src/cli/tokenmon.ts"

# Check active generation
"$TSX" "$CLI" gen status 2>&1
echo "---"

# Check config for active gen
node -e "
const fs = require('fs');
const home = process.env.HOME || require('os').homedir();
const dataDir = (process.env.CLAUDE_CONFIG_DIR || home + '/.claude') + '/tokenmon';
const globalCfg = dataDir + '/global-config.json';
let activeGen = 'gen4';
if (fs.existsSync(globalCfg)) {
  activeGen = JSON.parse(fs.readFileSync(globalCfg, 'utf-8')).active_generation || 'gen4';
}
const configPath = dataDir + '/' + activeGen + '/config.json';
if (!fs.existsSync(configPath)) {
  console.log('FAIL: config not found for ' + activeGen);
  console.log('  → Run /tkm:setup to set up this generation');
} else {
  const c = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log(c.starter_chosen ? 'PASS: starter chosen (' + activeGen + ')' : 'FAIL: starter not chosen');
  console.log('Party: ' + (c.party || []).join(', ') + ' (' + (c.party || []).length + '/' + (c.max_party_size || 3) + ')');
}
"
echo "---"
OUTPUT=$("$TSX" "$CLI" status 2>&1)
echo "$OUTPUT"
echo "---"
echo "$OUTPUT" | grep -qE "Lv\." && echo "PASS: party has pokemon" || echo "FAIL: no pokemon in party (run /tkm:setup)"
```

### Step 9: Visual QA

Render and visually verify CLI output.

**9a. Status Line**

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/status-line.ts" 2>&1
```

Check: sprite ANSI art + Pokémon name + level + XP bar

**9b. Region List**

```bash
MKT_ROOT=$(ls -d ~/.claude/plugins/marketplaces/tkm/ 2>/dev/null | head -1)
CACHE_ROOT=$(ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)
PLUGIN_ROOT="${MKT_ROOT:-$CACHE_ROOT}"
"$PLUGIN_ROOT/bin/tsx-resolve.sh" "$PLUGIN_ROOT/src/cli/tokenmon.ts" region list 2>&1
```

Check: 9 regions, lock/unlock (●/○), current location marker

**Visual Verdict**: Run `/oh-my-claudecode:visual-verdict` if available. Otherwise show output to user for visual confirmation.

Success criteria: no broken rendering

### Step 10: Report

Summarize all results:

```
=== Tokenmon Install Report ===
Step 1: Plugin cache          [PASS/FAIL]
Step 2: npm install + tsx     [PASS/FAIL]
Step 3: Multi-gen migration   [PASS/FAIL]
Step 4: StatusLine            [PASS/FAIL]
Step 5: CLI commands          [PASS/FAIL]
Step 6: Data integrity        [PASS/FAIL]
Step 7: Assets                [PASS/FAIL]
Step 8: Starter & Party       [PASS/FAIL]
Step 9: Visual QA             [PASS/FAIL]
================================
Result: X/9 PASS
```

## Options

- `--skip-visual`: Skip Step 9 Visual QA
- `--fix`: Auto-fix all FAIL items (run postinstall, npm install, etc.)
