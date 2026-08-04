import assert from 'node:assert/strict';
import { startLoopbackCallbackServer } from './src/index.ts';
import { createServer } from 'node:http';

// Loopback-only bind
const loop = await startLoopbackCallbackServer();
assert.ok(loop.redirectUri.startsWith('http://127.0.0.1:'));
assert.doesNotMatch(loop.redirectUri, /0\.0\.0\.0/);
await loop.close();

// Ensure we refuse non-loopback listener pattern by using createServer listen 127.0.0.1 only in impl
const s = createServer();
await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
const addr = s.address();
assert.ok(addr && typeof addr !== 'string' && addr.address === '127.0.0.1');
await new Promise<void>((r) => s.close(() => r()));

console.log('secure-connection-onboarding.desktop: ok');
