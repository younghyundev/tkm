---
description: "Tokenmon 플러그인 클린 설치 테스트. 임시 디렉토리에서 plugin install → npm install → setup → CLI 검증까지 자동 수행. 플러그인 배포 전 설치 흐름 검증에 사용."
---

# Tokenmon Test Install

깨끗한 환경에서 tokenmon 플러그인의 전체 설치 흐름을 검증합니다.

## 언제 사용하나

- 새 버전 배포 전 설치 테스트
- plugin install → setup 흐름이 정상 동작하는지 확인
- 사용자: "test install", "설치 테스트", "플러그인 테스트"

## 테스트 흐름

아래 단계를 순서대로 Bash 도구로 실행하세요. 각 단계마다 성공/실패를 기록합니다.

### Step 1: 기존 tokenmon 잔재 제거

먼저 현재 환경의 tokenmon 흔적을 깨끗이 제거합니다.

```bash
# 1a. 플러그인 캐시 제거
rm -rf ~/.claude/plugins/cache/tokenmon/

# 1b. 데이터 디렉토리 제거
rm -rf ~/.claude/tokenmon/

# 1c. installed_plugins.json에서 tokenmon 제거
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude/plugins/installed_plugins.json';
if (fs.existsSync(p)) {
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
  delete d.plugins['tokenmon@tokenmon'];
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}
"

# 1d. settings.json에서 statusLine 제거 (tokenmon 참조인 경우만)
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude/settings.json';
if (fs.existsSync(p)) {
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
  if (d.statusLine?.command?.includes('tokenmon')) {
    delete d.statusLine;
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
  }
}
"
```

성공 기준: 에러 없이 완료

### Step 2: 테스트 디렉토리 생성

```bash
TEST_DIR=$(mktemp -d /tmp/tokenmon-test-XXXXXX)
cd "$TEST_DIR"
git init
echo '{}' > package.json
echo "Test dir: $TEST_DIR"
```

성공 기준: git repo가 초기화된 임시 디렉토리 생성

### Step 3: 플러그인 설치

이 단계는 **사용자가 직접 실행**해야 합니다. Claude Code CLI 커맨드이므로 Bash로 실행할 수 없습니다.

사용자에게 안내하세요:

> 다음 명령을 입력해주세요:
> ```
> /plugin install tokenmon@tokenmon
> ```
> 설치가 완료되면 알려주세요.

설치 후 확인:

```bash
# 플러그인 캐시 확인
ls ~/.claude/plugins/cache/tokenmon/tokenmon/*/package.json && echo "PASS: plugin cache exists" || echo "FAIL: plugin cache missing"
```

### Step 4: 의존성 설치 (npm install)

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
cd "$PLUGIN_ROOT" && npm install 2>&1
echo "---"
ls node_modules/.bin/tsx && echo "PASS: tsx installed" || echo "FAIL: tsx missing"
```

성공 기준: tsx가 node_modules에 설치됨

### Step 5: StatusLine 통합

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
"$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/setup/setup-statusline.ts" 2>&1
echo "---"
node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/settings.json', 'utf-8'));
console.log(d.statusLine ? 'PASS: statusLine configured' : 'FAIL: statusLine missing');
"
```

성공 기준: settings.json에 statusLine 등록됨

### Step 6: CLI 명령어 검증

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
TSX="$PLUGIN_ROOT/node_modules/.bin/tsx"
CLI="$PLUGIN_ROOT/src/cli/tokenmon.ts"

echo "=== help ==="
"$TSX" "$CLI" help && echo "PASS: help" || echo "FAIL: help"

echo ""
echo "=== status ==="
"$TSX" "$CLI" status && echo "PASS: status" || echo "FAIL: status"

echo ""
echo "=== pokedex ==="
"$TSX" "$CLI" pokedex 2>&1 | head -5 && echo "PASS: pokedex" || echo "FAIL: pokedex"

echo ""
echo "=== region ==="
"$TSX" "$CLI" region && echo "PASS: region" || echo "FAIL: region"

echo ""
echo "=== region list ==="
"$TSX" "$CLI" region list 2>&1 | head -10 && echo "PASS: region list" || echo "FAIL: region list"

echo ""
echo "=== items ==="
"$TSX" "$CLI" items && echo "PASS: items" || echo "FAIL: items"

echo ""
echo "=== achievements ==="
"$TSX" "$CLI" achievements 2>&1 | head -10 && echo "PASS: achievements" || echo "FAIL: achievements"
```

성공 기준: 모든 CLI 명령이 에러 없이 실행

### Step 7: 데이터 무결성 확인

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
node -e "
const d = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/pokemon.json', 'utf-8'));
const r = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/regions.json', 'utf-8'));
const a = JSON.parse(require('fs').readFileSync('$PLUGIN_ROOT/data/achievements.json', 'utf-8'));

const checks = [
  ['pokemon count === 107', Object.keys(d.pokemon).length === 107],
  ['type_chart exists', !!d.type_chart],
  ['rarity_weights exists', !!d.rarity_weights],
  ['regions count >= 8', Object.keys(r.regions).length >= 8],
  ['achievements count >= 20', a.achievements.length >= 20],
  ['starters defined', d.starters.length === 3],
];

for (const [name, pass] of checks) {
  console.log(pass ? 'PASS: ' + name : 'FAIL: ' + name);
}
"
```

### Step 8: 에셋 파일 확인

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
CRIES=$(ls "$PLUGIN_ROOT/cries/"*.ogg 2>/dev/null | wc -l)
SPRITES=$(ls "$PLUGIN_ROOT/sprites/terminal/"*.txt 2>/dev/null | wc -l)
SFX=$(ls "$PLUGIN_ROOT/sfx/"*.wav 2>/dev/null | wc -l)

echo "Cries: $CRIES (expect 107)"
[ "$CRIES" -eq 107 ] && echo "PASS: cries" || echo "FAIL: cries ($CRIES/107)"

echo "Sprites: $SPRITES (expect 107)"
[ "$SPRITES" -eq 107 ] && echo "PASS: sprites" || echo "FAIL: sprites ($SPRITES/107)"

echo "SFX: $SFX (expect 4)"
[ "$SFX" -eq 4 ] && echo "PASS: sfx" || echo "FAIL: sfx ($SFX/4)"
```

### Step 9: 스타터 선택 테스트

이 단계는 **사용자에게 스타터를 선택하게** 합니다. `/tokenmon:setup` 스킬의 Step 3-4를 수행하거나, CLI로 직접:

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
echo "1" | "$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/cli/tokenmon.ts" starter
```

확인:

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/tokenmon/tokenmon/*/ | head -1)
"$PLUGIN_ROOT/node_modules/.bin/tsx" "$PLUGIN_ROOT/src/cli/tokenmon.ts" status
```

성공 기준: 파티에 포켓몬이 보임

### Step 10: 정리 및 결과 보고

```bash
# 테스트 디렉토리 정리
rm -rf /tmp/tokenmon-test-*
echo "Test directory cleaned up"
```

모든 단계의 PASS/FAIL 결과를 요약해서 보고하세요:

```
=== Tokenmon Test Install Report ===
Step 1: 기존 잔재 제거      [PASS/FAIL]
Step 2: 테스트 디렉토리      [PASS/FAIL]
Step 3: 플러그인 설치        [PASS/FAIL]
Step 4: npm install          [PASS/FAIL]
Step 5: StatusLine 통합      [PASS/FAIL]
Step 6: CLI 명령어           [PASS/FAIL]
Step 7: 데이터 무결성        [PASS/FAIL]
Step 8: 에셋 파일            [PASS/FAIL]
Step 9: 스타터 선택          [PASS/FAIL]
Step 10: 정리                [PASS/FAIL]
================================
Result: X/10 PASS
```

## 옵션

- `--skip-cleanup`: Step 10 정리 건너뛰기 (디버깅용)
- `--keep-state`: 테스트 후 설치 상태 유지 (바로 사용하려는 경우)
