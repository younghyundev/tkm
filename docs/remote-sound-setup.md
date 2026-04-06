# Tokenmon Remote Sound Setup

Play tokenmon sounds (cries + SFX) on your local machine when running on a remote server.

## Prerequisites

- **peon-ping relay** running on your local machine (`localhost:19998`)
- **SSH reverse tunnel** forwarding port 19998 from remote to local
- Both already working (verify: `curl http://localhost:19998/health` returns `OK`)

## Step 1: Mirror sound files to local

On your **local** machine, copy the tokenmon sound files from the remote:

```bash
# Using the provided sync script:
./scripts/sync-sounds-to-local.sh <SSH_HOST> ~/.claude/plugins/marketplaces/tkm

# Or manually:
rsync -az <SSH_HOST>:~/.claude/plugins/marketplaces/tkm/cries/ \
  ~/.claude/plugins/marketplaces/tkm/cries/
rsync -az <SSH_HOST>:~/.claude/plugins/marketplaces/tkm/sfx/ \
  ~/.claude/plugins/marketplaces/tkm/sfx/
```

## Step 2: Create symlink in peon-ping directory

The relay only serves files under its `PEON_DIR` (`~/.claude/hooks/peon-ping`).
Create a symlink so the relay can find tokenmon sounds:

```bash
ln -sfn ~/.claude/plugins/marketplaces/tkm \
  ~/.claude/hooks/peon-ping/tkm-sounds
```

Verify the symlink:

```bash
ls ~/.claude/hooks/peon-ping/tkm-sounds/cries/
# Should list .ogg/.wav/.mp3 files
```

## Step 3: Configure tokenmon on the remote

Edit tokenmon config on the **remote** machine (`~/.claude/tokenmon/<gen>/config.json`):

```json
{
  "relay_audio": true,
  "relay_host": "localhost",
  "relay_sound_root": "tkm-sounds"
}
```

- `relay_audio`: enables relay mode (sends HTTP requests instead of local playback)
- `relay_host`: relay server address (localhost via SSH tunnel)
- `relay_sound_root`: symlink name inside peon-ping's PEON_DIR
- Port uses existing `peon_ping_port` (default: 19998)

## Step 4: Verify

### 1. Relay health (from remote)

```bash
curl http://localhost:19998/health
# Expected: OK
```

### 2. Direct sound test (from remote)

```bash
# Pick any cry file ID that exists locally
curl -H "X-Volume: 0.5" \
  "http://localhost:19998/play?file=tkm-sounds%2Fcries%2F25.ogg"
# Expected: sound plays on local machine
```

### 3. Tokenmon functional test

Trigger any tokenmon event on the remote (e.g., start a Claude Code session).
You should hear the sound on your local speakers.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No sound, no error | `curl localhost:19998/health` — relay running? |
| 403 Forbidden | Symlink missing or broken — verify `ls -la ~/.claude/hooks/peon-ping/tkm-sounds` on local |
| 404 Not Found | Sound file missing locally — re-run sync script |
| Sound plays locally but not via remote | SSH tunnel down — verify `ssh -R 19998:localhost:19998` |
| Wrong volume | Set `volume` in tokenmon config (0.0-1.0) |
