import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'http';
import { getDefaultConfig } from '../src/core/config.js';
import { relaySound, type RelayConfig } from '../src/audio/play-cry.js';

describe('relay config defaults', () => {
  it('default config has relay_audio disabled', () => {
    const config = getDefaultConfig();
    assert.equal(config.relay_audio, false);
  });

  it('default config has relay_host as localhost', () => {
    const config = getDefaultConfig();
    assert.equal(config.relay_host, 'localhost');
  });

  it('default config has empty relay_sound_root', () => {
    const config = getDefaultConfig();
    assert.equal(config.relay_sound_root, '');
  });

  it('relay fields are independent from peon_ping_integration', () => {
    const config = getDefaultConfig();
    assert.equal(config.peon_ping_integration, false);
    assert.equal(config.relay_audio, false);
  });
});

describe('relaySound() via test server', () => {
  let server: http.Server;
  let serverPort: number;
  let lastRequest: { url: string; headers: http.IncomingHttpHeaders } | null;

  beforeEach(async () => {
    lastRequest = null;
    server = http.createServer((req, res) => {
      lastRequest = { url: req.url ?? '', headers: req.headers };
      res.writeHead(200);
      res.end('OK');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('sends request to /play?file= endpoint', async () => {
    const relay: RelayConfig = { host: '127.0.0.1', port: serverPort, soundRoot: 'tkm-sounds' };
    relaySound('/some/path/cries/25.ogg', 0.5, relay);
    // Wait for the async HTTP request to arrive
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(lastRequest, 'server should have received a request');
    assert.ok(lastRequest.url.startsWith('/play?file='), `URL should start with /play?file=, got: ${lastRequest.url}`);
  });

  it('sends X-Volume header with the volume value', async () => {
    const relay: RelayConfig = { host: '127.0.0.1', port: serverPort, soundRoot: 'tkm-sounds' };
    relaySound('/some/path/test.ogg', 0.7, relay);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(lastRequest, 'server should have received a request');
    assert.equal(lastRequest.headers['x-volume'], '0.7');
  });

  it('URL-encodes the file path in query string', async () => {
    const relay: RelayConfig = { host: '127.0.0.1', port: serverPort, soundRoot: 'tkm-sounds' };
    relaySound('/some/path/file with spaces.ogg', 0.5, relay);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(lastRequest, 'server should have received a request');
    // encodeURIComponent encodes spaces as %20
    assert.ok(lastRequest.url.includes('%20'), `URL should contain encoded space, got: ${lastRequest.url}`);
  });

  it('includes soundRoot prefix in the path', async () => {
    const relay: RelayConfig = { host: '127.0.0.1', port: serverPort, soundRoot: 'tkm-sounds' };
    relaySound('/some/path/test.ogg', 0.5, relay);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(lastRequest, 'server should have received a request');
    const decoded = decodeURIComponent(lastRequest.url);
    assert.ok(decoded.includes('tkm-sounds'), `decoded URL should contain tkm-sounds, got: ${decoded}`);
  });

  it('handles empty soundRoot', async () => {
    const relay: RelayConfig = { host: '127.0.0.1', port: serverPort, soundRoot: '' };
    relaySound('/some/path/test.ogg', 0.5, relay);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(lastRequest, 'server should have received a request');
    const decoded = decodeURIComponent(lastRequest.url);
    assert.ok(!decoded.includes('tkm-sounds'), `URL should not contain tkm-sounds with empty soundRoot`);
    assert.ok(decoded.includes('test.ogg'), `URL should contain filename`);
  });
});
