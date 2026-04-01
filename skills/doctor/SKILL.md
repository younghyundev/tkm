---
description: "Tokenmon 설치 상태 진단. 의존성, StatusLine, CLI, 데이터, 에셋, 스프라이트 렌더링을 자동 검증. 문제가 있으면 원인과 해결 방법을 안내. 사용자가 'doctor', '진단', '설치 확인', '안 돼요' 등을 말할 때 사용."
---

# Tokenmon Doctor

tokenmon 플러그인의 설치 상태를 진단하고 문제를 찾아줍니다.

## 테스트 흐름

아래 단계를 순서대로 Bash 도구로 실행하세요. 각 단계마다 PASS/FAIL을 기록합니다.

### Step 1: 플러그인 캐시 확인

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ 2>/dev/null | head -1)
if [ -z "$PLUGIN_ROOT" ]; then
  echo "FAIL: plugin cache not found. Run '/plugin install tokenmon@tokenmon' first."
  exit 1
fi
echo "Plugin root: $PLUGIN_ROOT"
cat "$PLUGIN_ROOT/package.json" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log('Version:', d.version)"
echo "PASS: plugin cache exists"
```

### Step 2: npm install

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
cd "$PLUGIN_ROOT" && npm install 2>&1 | tail -3
echo "---"
[ -f "$PLUGIN_ROOT/node_modules/.bin/tsx" ] && echo "PASS: npm install" || echo "FAIL: tsx not found"
```

### Step 3: StatusLine 통합

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
"$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/setup/setup-statusline.ts" 2>&1
echo "---"
node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/settings.json', 'utf-8'));
console.log(d.statusLine ? 'PASS: statusLine configured' : 'FAIL: statusLine missing');
"
```

### Step 4: CLI 명령어 검증

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
TSX="$PLUGIN_ROOT/node_modules/.bin/tsx"
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

### Step 5: 데이터 무결성

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
node -e "
const d = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/pokemon.json', 'utf-8'));
const r = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/regions.json', 'utf-8'));
const a = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/achievements.json', 'utf-8'));

const checks = [
  ['pokemon === 107', Object.keys(d.pokemon).length === 107],
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

### Step 6: 에셋 파일

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
CRIES=$(ls "$PLUGIN_ROOT/cries/"*.ogg 2>/dev/null | wc -l)
SPRITES=$(ls "$PLUGIN_ROOT/sprites/terminal/"*.txt 2>/dev/null | wc -l)
SFX=$(ls "$PLUGIN_ROOT/sfx/"*.wav 2>/dev/null | wc -l)

[ "$CRIES" -eq 107 ] && echo "PASS: cries ($CRIES)" || echo "FAIL: cries ($CRIES/107)"
[ "$SPRITES" -eq 107 ] && echo "PASS: sprites ($SPRITES)" || echo "FAIL: sprites ($SPRITES/107)"
[ "$SFX" -eq 4 ] && echo "PASS: sfx ($SFX)" || echo "FAIL: sfx ($SFX/4)"
echo "---"
[ "$CRIES" -eq 107 ] && [ "$SPRITES" -eq 107 ] && [ "$SFX" -eq 4 ] && echo "PASS: assets" || echo "FAIL: assets"
```

### Step 7: 스타터 선택 + Status 확인

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
TSX="$PLUGIN_ROOT/node_modules/.bin/tsx"
CLI="$PLUGIN_ROOT/src/cli/tokenmon.ts"

# 스타터가 이미 선택되어 있으면 덮어쓰지 않고 status만 확인
CONFIG_FILE=~/.claude/tokenmon-config.json
STARTER_CHOSEN=$(node -e "try{const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));console.log(c.starter_chosen?'yes':'no')}catch{console.log('no')}")

if [ "$STARTER_CHOSEN" = "yes" ]; then
  echo "SKIP: starter already chosen (preserving current party)"
else
  echo "1" | "$TSX" "$CLI" starter 2>&1
fi
echo "---"
# status 확인
OUTPUT=$("$TSX" "$CLI" status 2>&1)
echo "$OUTPUT"
echo "---"
# 파티에 포켓몬이 있는지 확인 (스타터 종류 무관)
echo "$OUTPUT" | grep -qE "(모부기|불꽃숭이|팽도리)" && echo "PASS: starter in party" || echo "FAIL: no starter in status"
```

### Step 8: Visual QA

각 CLI 출력을 렌더링하고 시각적으로 확인합니다.

**8a. Status Line**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
"$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/status-line.ts" 2>&1
```

확인: 스프라이트 ANSI art + 포켓몬 이름 + 레벨 + XP바 표시

**8b. Pokedex 목록**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
"$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/cli/tokenmon.ts" pokedex 2>&1 | head -20
```

확인: 상태 아이콘(●/◐/○), 타입 컬러, 포켓몬 번호 정렬

**8c. Pokedex 상세**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
"$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/cli/tokenmon.ts" pokedex 모부기 2>&1
```

확인: 타입, 스탯, 진화 라인, 희귀도, 포획 상태

**8d. Region List**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
"$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/cli/tokenmon.ts" region list 2>&1
```

확인: 9개 지역, 잠금/해제(●/○), 현재 위치(← 현재)

**8e. 스프라이트 샘플 (5종)**

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
for id in 387 393 448 483 493; do
  echo "=== #$id ==="
  cat "$PLUGIN_ROOT/sprites/terminal/$id.txt"
  echo ""
done
```

확인: ANSI 반블록 아트가 포켓몬 실루엣으로 렌더링, 색상 정상

**Visual Verdict**: `/oh-my-claudecode:visual-verdict` 스킬이 있으면 스크린샷 기반 리뷰 실행. 없으면 위 출력을 사용자에게 보여주고 육안 확인 요청.

성공 기준: 깨진 렌더링 없음

### Step 9: 결과 보고

모든 단계의 결과를 집계하여 보고하세요:

```
=== Tokenmon Test Install Report ===
Step 1: 플러그인 캐시       [PASS/FAIL]
Step 2: npm install         [PASS/FAIL]
Step 3: StatusLine 통합     [PASS/FAIL]
Step 4: CLI 명령어          [PASS/FAIL]
Step 5: 데이터 무결성       [PASS/FAIL]
Step 6: 에셋 파일           [PASS/FAIL]
Step 7: 스타터 선택         [PASS/FAIL]
Step 8: Visual QA           [PASS/FAIL]
=================================
Result: X/8 PASS
```

## 옵션

- `--skip-visual`: Step 8 Visual QA 건너뛰기
