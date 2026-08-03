import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProductionWorkspaceService } from './src/index.ts';
import { createProductionOrchestrator, createFakeAdapters } from '../explainer-production-runs/src/index.ts';
import {
  createPublishingOrchestrator,
  createFakePublishingAdapter,
  createFakeDeliverySource,
} from '../publishing-operations/src/index.ts';
import { redactString, redactDiagnosticValue } from './src/diagnostics/diagnostic-redaction.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-ws-health-'));
try {
  const productionRoot = join(root, 'production');
  const publishingRoot = join(root, 'publishing');
  const migrationRoot = join(root, 'migrations');
  mkdirSync(productionRoot, { recursive: true });
  mkdirSync(publishingRoot, { recursive: true });

  // corrupt production run fixture
  const corruptDir = join(productionRoot, 'production-run.corrupt');
  mkdirSync(corruptDir, { recursive: true });
  writeFileSync(join(corruptDir, 'run.json'), '{not-json', 'utf8');

  const workspace = createProductionWorkspaceService({
    productionOrchestrator: createProductionOrchestrator({
      root: productionRoot,
      adapters: createFakeAdapters(),
    }),
    publishingOrchestrator: createPublishingOrchestrator({
      root: publishingRoot,
      adapter: createFakePublishingAdapter(),
      deliverySource: createFakeDeliverySource(),
      skipThumbnailRender: true,
    }),
    productionRoot,
    publishingRoot,
    migrationRoot,
    backupRoot: join(root, 'backups'),
  });

  const health = await workspace.getHealth({ mode: 'quick' });
  assert.ok(health.checks.some((c) => c.category === 'storage'));
  assert.ok(health.checks.some((c) => c.category === 'runtime'));
  assert.ok(health.checks.some((c) => c.category === 'data-integrity'));
  assert.ok(health.checks.some((c) => c.category === 'migrations'));

  // overview still loads under degraded mode
  const overview = await workspace.getOverview({ includeHealth: true });
  assert.equal(overview.schemaVersion, '1.0.0');

  // redaction defenses
  const secrets = [
    'Bearer sk-live-abc1234567890token',
    'api_key=supersecretvalue123',
    'Authorization: Bearer oauth-token-xyz',
    'C:\\Users\\Admin\\secrets\\file.txt',
    '/Users/admin/.openchatcut/token',
    '~/Library/Application Support/foo',
    'MCP_TOKEN=secret-mcp-token-value',
    'https://upload.example/?access_token=abc&x=1',
  ];
  for (const s of secrets) {
    const redacted = redactString(s);
    assert.ok(!redacted.includes('sk-live'), s);
    assert.ok(!redacted.includes('supersecret'), s);
    assert.ok(!redacted.includes('Admin'), s);
    assert.ok(!redacted.includes('secret-mcp'), s);
  }
  const nested = redactDiagnosticValue({
    token: 'abc',
    message: 'path C:\\Users\\Admin\\x and Bearer tok',
    path: '/Users/admin/x',
  });
  assert.equal((nested as { token: string }).token, '[REDACTED]');
  assert.equal((nested as { path: string }).path, '[REDACTED]');

  const deep = await workspace.getHealth({ mode: 'deep' });
  assert.equal(deep.mode, 'deep');

  console.log('workspace-health verification passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
