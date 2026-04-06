---
description: "Configure tokenmon remote sound relay. Detects SSH/Docker environment, confirms with user, and enables relay audio. Use to set up, change, or disable relay. Korean: 릴레이, 원격 소리, 원격 사운드, relay setup, relay 설정"
---

Set up or modify tokenmon remote sound relay configuration.

## Step 0: Resolve Plugin Root

```bash
export CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/marketplaces/tkm 2>/dev/null || ls -d ~/.claude/plugins/cache/tkm/tkm/*/ 2>/dev/null | sort -V | tail -1)}"
echo "CLAUDE_PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT}" && test -n "${CLAUDE_PLUGIN_ROOT}" && test -f "${CLAUDE_PLUGIN_ROOT}/package.json" && echo "OK" || echo "FAIL"
```

- `OK` → proceed to Step 1.
- `FAIL` → inform the user: tokenmon is not installed. Install first via `/plugin install tkm@tkm`.

## Step 1: Detect Environment

Run the following to detect the current environment:

```bash
node -e "
const fs = require('fs');
const env = {
  ssh: !!(process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY),
  docker: fs.existsSync('/.dockerenv') || (fs.existsSync('/proc/1/cgroup') && fs.readFileSync('/proc/1/cgroup','utf8').includes('docker')),
  wsl: false,
  remote_container: !!process.env.REMOTE_CONTAINERS,
};
try { env.wsl = /microsoft/i.test(fs.readFileSync('/proc/version','utf8')); } catch {}
env.is_remote = env.ssh || env.docker || env.remote_container;
env.is_local_wsl = env.wsl && !env.ssh;
console.log(JSON.stringify(env));
"
```

Parse the JSON output.

## Step 2: Read Current Config

```bash
TSX="${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh"
"${TSX}" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config-dump 2>/dev/null || node -e "
const fs = require('fs');
const home = process.env.HOME || require('os').homedir();
const gcPath = home + '/.claude/tokenmon/global-config.json';
const gc = JSON.parse(fs.readFileSync(gcPath, 'utf8'));
const gen = gc.active_generation || 'gen4';
const cfgPath = home + '/.claude/tokenmon/' + gen + '/config.json';
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
console.log(JSON.stringify({
  relay_audio: cfg.relay_audio || false,
  relay_host: cfg.relay_host || 'localhost',
  relay_sound_root: cfg.relay_sound_root || '',
  peon_ping_port: cfg.peon_ping_port || 19998,
}));
"
```

## Step 3: Present Status and Ask User

Based on the detected environment and current config, present the situation to the user using `AskUserQuestion`.

**If remote environment detected (SSH or Docker) AND relay_audio is currently false:**

> I detected you're running in a **remote environment** ({ssh/docker/remote_container}).
> Tokenmon sounds won't play here because there's no audio output.
>
> I can enable **relay mode** to route sounds to your local machine via the peon-ping relay (localhost:{port}).
>
> Current config:
> - relay_audio: {value}
> - relay_host: {value}
> - relay_sound_root: {value}

Options:
1. **Enable relay (Recommended)** — Set relay_audio=true with default settings (localhost, tkm-sounds)
2. **Enable with custom settings** — I'll ask for relay_host and relay_sound_root
3. **Disable relay** — Turn off relay_audio (use local playback)
4. **Skip** — Don't change anything

**If local environment (WSL, not SSH):**

> You're running **locally** on WSL. Tokenmon can play sounds directly.
> Relay mode is typically for remote environments.
>
> Current relay config: relay_audio={value}

Options:
1. **Keep local playback (Recommended)** — No changes needed
2. **Enable relay anyway** — Route sounds through peon-ping relay
3. **Run local setup** — Set up this machine to receive relay sounds from a remote

**If relay_audio is already enabled:**

> Relay mode is **currently active**.
>
> Current config:
> - relay_audio: true
> - relay_host: {relay_host}
> - relay_sound_root: {relay_sound_root}
> - port: {peon_ping_port}

Options:
1. **Keep current settings** — No changes
2. **Change settings** — I'll ask for new values
3. **Disable relay** — Switch back to local playback
4. **Test relay** — Verify the relay connection is working

## Step 4: Apply Changes

Based on the user's choice:

**Enable relay (default settings):**

```bash
TSX="${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh"
"${TSX}" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set relay_audio true
"${TSX}" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set relay_sound_root tkm-sounds
```

**Enable with custom settings:**

Ask the user for:
- `relay_host` (default: localhost) — "What host is the relay running on?"
- `relay_sound_root` (default: tkm-sounds) — "What's the symlink name in the peon-ping directory?"

Then apply each with `config set`.

**Disable relay:**

```bash
TSX="${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh"
"${TSX}" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set relay_audio false
```

## Step 5: Verify (if relay enabled)

```bash
curl -sf --max-time 2 http://localhost:19998/health 2>/dev/null && echo "RELAY_OK" || echo "RELAY_FAIL"
```

- `RELAY_OK` → Tell the user: "Relay is reachable. Sounds will play on your local machine."
- `RELAY_FAIL` → Tell the user: "Relay is not reachable from this environment. Check that:
  1. peon-ping relay is running on your local machine (`peon relay --daemon`)
  2. SSH reverse tunnel is active (`ssh -R 19998:localhost:19998 <host>`)
  3. The symlink exists on local: `ls ~/.claude/hooks/peon-ping/tkm-sounds`

  For one-click local setup, run on your LOCAL machine:
  `./scripts/setup-relay-local.sh <REMOTE_HOST>`"

## Step 6: Test Sound (optional, if relay is reachable)

Ask the user if they want to hear a test sound:

```bash
curl -sf --max-time 3 -H "X-Volume: 0.5" "http://localhost:19998/play?file=tkm-sounds%2Fsfx%2Fgacha.wav" 2>/dev/null && echo "SOUND_OK" || echo "SOUND_FAIL"
```

- `SOUND_OK` → "Did you hear a sound on your local machine?"
- `SOUND_FAIL` → "Sound test failed. The symlink or sound files may be missing on the local side."

## Summary

After all steps, show a summary:

```
Relay Configuration:
  relay_audio:      {true/false}
  relay_host:       {value}
  relay_sound_root: {value}
  port:             {peon_ping_port}
  relay status:     {OK/unreachable}

To change later:
  /tkm:relay-setup          — Re-run this wizard
  tokenmon config set ...   — Set individual values
```
