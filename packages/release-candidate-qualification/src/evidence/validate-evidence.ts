import type {
  QualificationEvidenceContextV1,
  QualificationEvidenceV1,
  QualificationEvidenceValidationResultV1,
  ReleaseQualificationProfile,
} from '../contracts/evidence-types.ts';
import { hashEvidenceBody } from './hash.ts';

const CLOSED_PROVIDERS: Record<ReleaseQualificationProfile, QualificationEvidenceV1['provider'][]> = {
  'unit-test': [
    'fake-test',
    'local-command',
    'service-verification',
    'artifact-validation',
    'desktop-smoke',
    'ci-attestation',
    'manual-attestation',
  ],
  'internal-development': [
    'local-command',
    'service-verification',
    'artifact-validation',
    'desktop-smoke',
    'manual-attestation',
  ],
  'roadmap-closure': [
    'local-command',
    'service-verification',
    'artifact-validation',
    'desktop-smoke',
    'ci-attestation',
  ],
  'production-release': [
    'local-command',
    'service-verification',
    'artifact-validation',
    'desktop-smoke',
    'ci-attestation',
  ],
};

export function validateQualificationEvidence(
  evidence: QualificationEvidenceV1,
  context: QualificationEvidenceContextV1,
): QualificationEvidenceValidationResultV1 {
  const errors: QualificationEvidenceValidationResultV1['errors'] = [];
  const warnings: QualificationEvidenceValidationResultV1['warnings'] = [];

  if (evidence.schemaVersion !== '1.0.0') {
    errors.push({ severity: 'error', code: 'EVIDENCE_SCHEMA', message: 'schemaVersion must be 1.0.0' });
  }
  const recomputed = hashEvidenceBody(evidence as unknown as Record<string, unknown>);
  if (evidence.evidenceHash !== recomputed) {
    errors.push({ severity: 'error', code: 'EVIDENCE_HASH', message: 'evidenceHash mismatch' });
  }
  if (evidence.source.commit !== context.expectedCommit) {
    errors.push({
      severity: 'error',
      code: 'EVIDENCE_COMMIT',
      message: 'Evidence source.commit does not match expected commit',
    });
  }
  if (evidence.source.appVersion !== context.expectedAppVersion) {
    errors.push({
      severity: 'error',
      code: 'EVIDENCE_VERSION',
      message: 'Evidence source.appVersion does not match package version',
    });
  }
  const allowed = CLOSED_PROVIDERS[context.profile] ?? [];
  if (!allowed.includes(evidence.provider)) {
    errors.push({
      severity: 'error',
      code: 'EVIDENCE_PROVIDER',
      message: `Provider ${evidence.provider} not allowed for profile ${context.profile}`,
    });
  }
  if (context.profile === 'roadmap-closure' || context.profile === 'production-release') {
    if (evidence.provider === 'fake-test') {
      errors.push({
        severity: 'error',
        code: 'EVIDENCE_FAKE',
        message: 'fake-test evidence rejected for closure/production profiles',
      });
    }
    for (const a of evidence.artifacts ?? []) {
      if (a.stub === true || a.dryRun === true || a.buildMode === 'stub') {
        errors.push({
          severity: 'error',
          code: 'EVIDENCE_STUB',
          message: 'Stub/dry-run artifacts rejected for closure/production profiles',
        });
      }
    }
  }
  if (evidence.execution && evidence.execution.exitCode !== 0 && evidence.status === 'passed') {
    errors.push({
      severity: 'error',
      code: 'EVIDENCE_EXIT',
      message: 'Exit code non-zero cannot claim passed',
    });
  }
  if (evidence.status === 'skipped' && evidence.required) {
    errors.push({
      severity: 'error',
      code: 'EVIDENCE_SKIP',
      message: 'Required check cannot be skipped',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function providersAllowedForProfile(profile: ReleaseQualificationProfile): QualificationEvidenceV1['provider'][] {
  return CLOSED_PROVIDERS[profile];
}
