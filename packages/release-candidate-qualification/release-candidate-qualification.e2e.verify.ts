import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createQualificationService } from './src/index.ts';

const repoRoot = process.cwd();
const root = await mkdtemp(join(tmpdir(), 'bcc-rc-e2e-'));
try {
  const svc = createQualificationService({ repoRoot, rcRoot: root });
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
  const plan = await svc.preparePlan({
    id: 'rc-e2e',
    name: 'E2E internal',
    version: pkg.version,
    distributionManifestHash: 'e'.repeat(64),
    channel: 'internal',
  });
  const { report, closure } = await svc.validate(plan, { forcePassLocalChecks: true });
  assert.ok(report.checks.some((c) => c.id === 'update-policy' && c.status === 'passed'));
  assert.ok(report.checks.some((c) => c.id === 'desktop-security'));
  assert.ok(Array.isArray(closure.milestones));
  assert.ok(closure.milestones.find((m) => m.id === 'M7B'));
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('release-candidate-qualification.e2e: ok');
