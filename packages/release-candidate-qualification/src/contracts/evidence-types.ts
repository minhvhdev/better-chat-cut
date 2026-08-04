import type { QualificationDiagnostic } from './qualification-types.ts';

export const CHECK_REGISTRY_REVISION = 'm7b.1.0.0';

export type ReleaseQualificationProfile =
  | 'unit-test'
  | 'internal-development'
  | 'roadmap-closure'
  | 'production-release';

export type QualificationEvidenceProvider =
  | 'local-command'
  | 'service-verification'
  | 'artifact-validation'
  | 'desktop-smoke'
  | 'ci-attestation'
  | 'manual-attestation'
  | 'fake-test';

export type QualificationEvidenceV1 = {
  schemaVersion: '1.0.0';
  evidenceId: string;
  checkId: string;
  provider: QualificationEvidenceProvider;
  source: {
    commit: string;
    appVersion: string;
  };
  target?: {
    platform: string;
    arch?: string;
  };
  execution?: {
    commandId: string;
    exitCode: number;
    startedAt: string;
    completedAt: string;
    stdoutSha256?: string;
    stderrSha256?: string;
  };
  artifacts?: Array<{
    artifactId: string;
    sha256: string;
    manifestHash?: string;
    buildMode?: 'real' | 'stub';
    dryRun?: boolean;
    stub?: boolean;
  }>;
  reports?: Array<{
    reportType: string;
    reportHash: string;
  }>;
  status: 'passed' | 'warning' | 'failed' | 'skipped';
  required: boolean;
  evidenceHash: string;
};

export type QualificationEvidenceManifestV1 = {
  schemaVersion: '1.0.0';
  qualificationRunId: string;
  profile: ReleaseQualificationProfile;
  sourceCommit: string;
  appVersion: string;
  checkRegistryRevision: string;
  evidence: QualificationEvidenceV1[];
  manifestHash: string;
  createdAt: string;
};

export type MilestoneQualificationEvidenceV1 = {
  milestoneId: string;
  status: 'complete' | 'incomplete';
  requiredCheckIds: string[];
  evidenceHashes: string[];
  sourceCommit?: string;
  errors: QualificationDiagnostic[];
  warnings: QualificationDiagnostic[];
};

export type DistributionEvidenceReferenceV1 = {
  distributionId: string;
  distributionManifestHash: string;
  /** operation id in distribution store (opaque to MCP callers). */
  operationId?: string;
};

export type QualificationEvidenceContextV1 = {
  profile: ReleaseQualificationProfile;
  expectedCommit: string;
  expectedAppVersion: string;
  repoRoot: string;
};

export type QualificationEvidenceValidationResultV1 = {
  valid: boolean;
  errors: QualificationDiagnostic[];
  warnings: QualificationDiagnostic[];
};

export type QualificationCommandDefinitionV1 = {
  id: string;
  /** npm script name under package.json scripts, or special git id. */
  npmScript?: string;
  executable?: string;
  args?: string[];
  timeoutMs: number;
  workingDirectory: 'repo-root';
  environmentPolicy: 'sanitized' | 'desktop-build' | 'test-isolated';
  secretRedaction: true;
};

export type QualificationCheckDefinitionV1 = {
  id: string;
  category: string;
  requiredFor: ReleaseQualificationProfile[];
  acceptedEvidenceProviders: QualificationEvidenceProvider[];
  dependencies: string[];
  /** Optional allowlisted command id. */
  commandId?: string;
  /** Built-in non-command check kind. */
  kind?:
    | 'source-commit'
    | 'working-tree-clean'
    | 'app-version'
    | 'package-lock-integrity'
    | 'build-config-integrity'
    | 'command'
    | 'secret-scan'
    | 'distribution-manifest'
    | 'distribution-artifact-hashes'
    | 'required-target-evidence'
    | 'manual-update-policy'
    | 'documentation'
    | 'roadmap-current';
};
