---
description: "Tokenmon 클린 설치 테스트 준비. 기존 설치 잔재를 제거하고 테스트 디렉토리를 생성한다. 소스 레포에서 실행."
---

# Set Test Dir

tokenmon 플러그인의 클린 설치 테스트를 위한 환경을 준비합니다.
소스 레포에서 실행하며, 이후 사용자가 테스트 디렉토리에서 플러그인을 설치하고 `/tokenmon:test-install`을 실행합니다.

## 실행 순서

### Step 1: 기존 tokenmon 잔재 완전 제거

Bash 도구로 다음을 실행하세요:

```bash
# 플러그인 캐시 제거
rm -rf ~/.claude/plugins/cache/tokenmon/
echo "[1/4] plugin cache removed"

# 데이터 디렉토리 제거 (state, config, wrapper)
rm -rf ~/.claude/tokenmon/
echo "[2/4] data dir removed"

# installed_plugins.json에서 tokenmon 제거
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude/plugins/installed_plugins.json';
if (fs.existsSync(p)) {
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
  if (d.plugins['tokenmon@tokenmon']) {
    delete d.plugins['tokenmon@tokenmon'];
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
    console.log('[3/4] manifest entry removed');
  } else {
    console.log('[3/4] no manifest entry (already clean)');
  }
} else {
  console.log('[3/4] no manifest file');
}
"

# settings.json에서 tokenmon statusLine 제거
node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude/settings.json';
if (fs.existsSync(p)) {
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
  if (d.statusLine && typeof d.statusLine === 'object' && typeof d.statusLine.command === 'string' && d.statusLine.command.includes('tokenmon')) {
    delete d.statusLine;
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
    console.log('[4/4] statusLine removed');
  } else {
    console.log('[4/4] statusLine not tokenmon (skipped)');
  }
} else {
  console.log('[4/4] no settings.json');
}
"
```

### Step 2: 테스트 디렉토리 생성

```bash
TEST_DIR="$HOME/tokenmon-test"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
git init
echo '{"name":"tokenmon-test","private":true}' > package.json
git add -A && git commit -m "init test project"
echo ""
echo "=== Test directory ready ==="
echo "Path: $TEST_DIR"
```

### Step 3: 사용자에게 안내

다음 메시지를 사용자에게 전달하세요:

> 테스트 환경이 준비되었습니다.
>
> 다음 단계를 순서대로 진행해주세요:
>
> 1. 새 터미널에서 Claude Code 실행:
>    ```
>    cd ~/tokenmon-test && claude
>    ```
>
> 2. 플러그인 설치:
>    ```
>    /plugin install tokenmon@tokenmon
>    ```
>
> 3. 플러그인 로드:
>    ```
>    /reload-plugins
>    ```
>
> 4. 설치 검증:
>    ```
>    /tokenmon:test-install
>    ```
>
> 검증이 끝나면 `rm -rf ~/tokenmon-test`로 정리하세요.
