export type QualificationErrorCode =
  | 'QUALIFICATION_VALIDATION_FAILED'
  | 'QUALIFICATION_PLAN_INVALID'
  | 'QUALIFICATION_REQUIRED_FAILED'
  | 'QUALIFICATION_TARGET_SKIPPED'
  | 'QUALIFICATION_FORBIDDEN';

export class QualificationError extends Error {
  readonly code: QualificationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: QualificationErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'QualificationError';
    this.code = code;
    this.details = details;
  }
}

export type QualificationDiagnostic = {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
};

export type ReleaseQualificationTargetV1 = {
  platform: 'macos' | 'windows' | 'linux' | 'web-development';
  arch?: 'x64' | 'arm64';
  artifactId?: string;
  required: boolean;
  signingRequired: boolean;
  notarizationRequired: boolean;
};

export type ReleaseQualificationCheckResultV1 = {
  id: string;
  category:
    | 'source'
    | 'dependencies'
    | 'security'
    | 'build'
    | 'signing'
    | 'installer'
    | 'runtime'
    | 'migration'
    | 'backup-restore'
    | 'production-workflow'
    | 'publishing-workflow'
    | 'documentation'
    | 'update-policy';
  target?: { platform: string; arch?: string };
  status: 'passed' | 'warning' | 'failed' | 'skipped';
  required: boolean;
  summary: string;
  evidence?: {
    command?: string;
    artifactId?: string;
    reportHash?: string;
  };
  errors: QualificationDiagnostic[];
  warnings: QualificationDiagnostic[];
};

export type ReleaseCandidatePlanV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  version: string;
  sourceCommit: string;
  distributionManifestHash: string;
  channel: 'internal' | 'candidate' | 'production';
  targets: ReleaseQualificationTargetV1[];
  requiredChecks: string[];
  optionalChecks: string[];
  previousVersionFixture?: {
    version: string;
    installerArtifactId?: string;
    testDataBundleId?: string;
  };
  planHash: string;
};

export type ReleaseCandidateReportV1 = {
  schemaVersion: '1.0.0';
  candidateId: string;
  planId: string;
  planHash: string;
  version: string;
  sourceCommit: string;
  status: 'qualified' | 'qualified-with-warnings' | 'failed';
  targets: Array<{
    platform: string;
    arch?: string;
    status: string;
    artifactId?: string;
    artifactSha256?: string;
    signingStatus?: string;
  }>;
  checks: ReleaseQualificationCheckResultV1[];
  blockingCheckIds: string[];
  warningCheckIds: string[];
  reportHash: string;
  generatedAt: string;
};

export type ReleaseCandidateManifestV1 = {
  schemaVersion: '1.0.0';
  candidateId: string;
  version: string;
  sourceCommit: string;
  distributionManifestHash: string;
  qualificationReportHash: string;
  channel: 'internal' | 'candidate' | 'production';
  artifacts: Array<{
    platform: string;
    arch: string;
    format: string;
    fileName: string;
    byteLength: number;
    sha256: string;
    signingStatus: string;
  }>;
  updatePolicy: {
    mode: 'disabled' | 'manual-download';
    releaseFeedConfigured: false;
    automaticDownload: false;
    automaticInstall: false;
  };
  qualificationStatus: 'qualified' | 'qualified-with-warnings';
  knownLimitations: string[];
  manifestHash: string;
  createdAt: string;
};

export type BetterChatCutRoadmapClosureReportV1 = {
  schemaVersion: '1.0.0';
  milestones: Array<{
    id: string;
    status: 'complete' | 'incomplete';
    evidence: {
      commit?: string;
      verificationScripts: string[];
      reportHashes?: string[];
    };
  }>;
  globalChecks: Array<{
    id: string;
    status: 'passed' | 'failed';
    message: string;
  }>;
  remainingRequiredMilestones: string[];
  roadmapClosed: boolean;
  reportHash: string;
};
