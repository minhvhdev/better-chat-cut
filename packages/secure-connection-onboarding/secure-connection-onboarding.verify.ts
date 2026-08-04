import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createConnectionOnboardingService,
  createFakeCredentialVault,
  generatePkcePair,
  filterAllowedScopes,
  OnboardingError,
} from './src/index.ts';

const pkce = generatePkcePair();
assert.ok(pkce.verifier.length > 20);
assert.ok(pkce.challenge.length > 20);
assert.equal(filterAllowedScopes(['evil']).length, 0);

const vaultRoot = await mkdtemp(join(tmpdir(), 'bcc-vault-'));
try {
  const vault = createFakeCredentialVault(vaultRoot);
  const svc = createConnectionOnboardingService({ vault, fakeProvider: true });
  const session = await svc.begin('req1', {
    schemaVersion: '1.0.0',
    platform: 'youtube',
    connectionId: 'conn.main',
    requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
  }, { openBrowser: false });
  assert.equal(session.status, 'awaiting-callback');
  assert.ok(session.authorizationUrl);
  assert.doesNotMatch(JSON.stringify(session), /fake-access|code_verifier|verifier/);
  // state must not appear in public session
  const completed = await svc.completeFake(session.sessionId);
  assert.equal(completed.status, 'completed');
  assert.ok(completed.channel?.id);

  const meta = await svc.getConnection('conn.main');
  assert.equal(meta?.status, 'active');

  // Disk must not contain plaintext tokens
  const entries = await readdir(join(vaultRoot, 'entries'));
  for (const f of entries) {
    const raw = await readFile(join(vaultRoot, 'entries', f), 'utf8');
    assert.doesNotMatch(raw, /fake-access\./);
    assert.doesNotMatch(raw, /fake-refresh\./);
  }

  const tokens = await svc.resolveTokensForServer('conn.main');
  assert.ok(tokens?.accessToken.startsWith('fake-access.'));

  // Replay of completed session should fail on completeWithCode if state reused
  await assert.rejects(
    () => svc.completeWithCode(session.sessionId, 'x', 'any'),
    (e: unknown) => e instanceof OnboardingError,
  );

  const dry = await svc.disconnect('conn.main', { dryRun: true });
  assert.equal(dry.dryRun, true);
  const hard = await svc.disconnect('conn.main', { dryRun: false });
  assert.equal(hard.disconnected, true);
  assert.equal(await svc.getConnection('conn.main'), null);
} finally {
  await rm(vaultRoot, { recursive: true, force: true });
}

console.log('secure-connection-onboarding: ok');
