import assert from 'node:assert/strict';
import {
  computeDesktopDistributionPlanHash,
  defaultSigningPolicy,
  defaultUpdatePolicy,
  validateDesktopDistributionPlan,
  validateUpdatePolicy,
  validateSigningPolicy,
  DISTRIBUTION_REVISION,
} from './src/index.ts';

{
  assert.equal(typeof DISTRIBUTION_REVISION, 'string');
  const up = validateUpdatePolicy({ mode: 'disabled' });
  assert.equal(up.valid, true);
  assert.equal(up.value?.automaticDownload, false);
  assert.equal(validateUpdatePolicy({ mode: 'disabled', automaticDownload: true }).valid, false);
}

{
  assert.equal(validateSigningPolicy({ mode: 'unsigned', password: 'x' }).valid, false);
  assert.equal(validateSigningPolicy({ mode: 'sign-when-configured' }).valid, true);
}

{
  const base = {
    schemaVersion: '1.0.0' as const,
    id: 'dist.dev.1',
    name: 'Dev plan',
    source: {
      commit: 'a'.repeat(40),
      requireCleanTree: true,
      appVersion: '0.1.7',
      packageLockSha256: 'b'.repeat(64),
      buildConfigSha256: 'c'.repeat(64),
    },
    targets: [{ platform: 'windows' as const, arch: 'x64' as const, formats: ['nsis'], required: true }],
    signing: defaultSigningPolicy('unsigned'),
    updatePolicy: defaultUpdatePolicy('disabled'),
    qualificationProfile: 'development' as const,
  };
  const planHash = computeDesktopDistributionPlanHash(base);
  assert.equal(planHash.length, 64);
  const v = validateDesktopDistributionPlan({ ...base, planHash, preparedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(v.valid, true);
  assert.equal(v.value?.planHash, planHash);
  const broken = validateDesktopDistributionPlan({ ...base, planHash: 'd'.repeat(64), preparedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(broken.valid, false);
  // Timestamp must not affect hash
  const h2 = computeDesktopDistributionPlanHash(base);
  assert.equal(h2, planHash);
}

console.log('desktop-distribution-contracts: ok');
