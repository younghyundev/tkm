---
description: "Tokenmon language toggle. Switch between Korean and English. Korean: 언어, 영어, 한국어, 언어 변경, 언어 전환"
---

# Tokenmon Language Toggle

Check the current language and interactively switch between Korean and English.

## Step 1: Read current language

Read the current language setting from config, respecting `CLAUDE_CONFIG_DIR`:

```bash
node -e "
const os = require('os');
const path = require('path');
const fs = require('fs');
const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(claudeDir, 'tokenmon', 'config.json'), 'utf8'));
  console.log(cfg.language ?? 'ko');
} catch { console.log('ko'); }
"
```

## Step 2: Confirm toggle

Use **AskUserQuestion** to show the current language and ask the user whether to switch.

- If current is `ko`: "현재 **한국어** 모드입니다. 영어로 전환할까요?"
- If current is `en`: "Currently in **English** mode. Switch to Korean?"

Options: [Switch] [Keep]

## Step 3a: Switch language

If the user chose **Switch**:

Switch from `ko` to `en`:
```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set language en
```

Switch from `en` to `ko`:
```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set language ko
```

Then show the updated status:
```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

## Step 3b: Keep current language

If the user chose **Keep**, respond with the following message (based on current language) and exit:

- If current is `ko`: "현재 언어(한국어)를 유지합니다."
- If current is `en`: "Keeping current language (English)."
