import type {
  ExplainerProductionPolicyV1,
  ProductionArtifactType,
  ProductionDiagnostic,
  ProductionStageId,
} from '../../../explainer-production-contracts/src/index.ts';

export const PRODUCTION_RUN_SCHEMA_VERSION = '1.0.0' as const;

export type ProductionStageStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'awaiting-input'
  | 'awaiting-review'
  | 'awaiting-project-session'
  | 'awaiting-external-operation'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type ProductionStageStateV1 = {
  stageId: ProductionStageId;
  status: ProductionStageStatus;
  attempt: number;
  inputArtifacts: { artifactType: ProductionArtifactType; artifactHash: string }[];
  outputArtifacts: { artifactType: ProductionArtifactType; artifactHash: string }[];
  externalOperation?: {
    type: 'tts' | 'edit-session' | 'production-render';
    id: string;
    status?: string;
  };
  review?: {
    reviewId: string;
    status: 'pending' | 'approved' | 'rejected';
  };
  errors: ProductionDiagnostic[];
  warnings: ProductionDiagnostic[];
  startedAt?: string;
  completedAt?: string;
};

export type ProductionRunStatus =
  | 'active'
  | 'awaiting-input'
  | 'awaiting-review'
  | 'awaiting-external-operation'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'completed';

export type ProductionRunV1 = {
  schemaVersion: typeof PRODUCTION_RUN_SCHEMA_VERSION;
  runId: string;
  requestId: string;
  requestHash: string;
  revision: number;
  status: ProductionRunStatus;
  currentStageId: ProductionStageId;
  project: {
    expectedProjectId?: string;
    boundProjectId?: string;
  };
  policy: ExplainerProductionPolicyV1;
  artifacts: { artifactType: ProductionArtifactType; artifactHash: string }[];
  stages: ProductionStageStateV1[];
  delivery?: {
    bundleId: string;
    manifestHash: string;
    validationStatus: 'valid';
  };
  workflowFingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductionRunWithoutTimestamps = Omit<ProductionRunV1, 'createdAt' | 'updatedAt' | 'workflowFingerprint'> & {
  stages: Array<Omit<ProductionStageStateV1, 'startedAt' | 'completedAt'> & {
    startedAt?: never;
    completedAt?: never;
  }>;
};
