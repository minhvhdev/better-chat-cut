import type { ProductionDiagnostic, ProductionStageId, ProductionArtifactType } from '../../../explainer-production-contracts/src/index.ts';

export type ProductionNextActionV1 =
  | {
    type: 'put-artifact';
    stageId: ProductionStageId;
    artifactType: ProductionArtifactType;
    requirements: string[];
  }
  | {
    type: 'execute-stage';
    stageId: ProductionStageId;
  }
  | {
    type: 'open-edit-session';
    stageId: ProductionStageId;
    approvalMode: 'manual' | 'auto';
  }
  | {
    type: 'wait-external-operation';
    stageId: ProductionStageId;
    operationType: string;
    operationId: string;
  }
  | {
    type: 'review';
    stageId: ProductionStageId;
    reviewId: string;
  }
  | {
    type: 'resolve-blocker';
    stageId: ProductionStageId;
    blockers: ProductionDiagnostic[];
  }
  | {
    type: 'completed';
    bundleId: string;
  };

export type ProductionRunSummaryV1 = {
  runId: string;
  requestId: string;
  status: string;
  currentStageId: ProductionStageId;
  revision: number;
  workflowFingerprint: string;
  createdAt: string;
  updatedAt: string;
  deliveryBundleId?: string;
};

export type ProductionRunDeliverySummaryV1 = {
  runId: string;
  bundleId: string;
  manifestHash: string;
  artifacts: {
    role: string;
    fileName: string;
    sha256: string;
    downloadUrl: string;
  }[];
  qaStatus: 'passed' | 'passed-with-warnings';
};

export type ProductionRunValidationResultV1 = {
  valid: boolean;
  runId: string;
  revision: number;
  workflowFingerprintValid: boolean;
  artifactChecks: {
    artifactType: ProductionArtifactType;
    artifactHash: string;
    exists: boolean;
    hashValid: boolean;
    schemaValid: boolean;
  }[];
  externalOperationChecks: {
    type: string;
    id: string;
    status: string;
  }[];
  errors: ProductionDiagnostic[];
  warnings: ProductionDiagnostic[];
};

export type MotionAssetAuthoringTaskSetV1 = {
  schemaVersion: '1.0.0';
  tasks: {
    taskId: string;
    requirementId: string;
    creationBrief: unknown;
    status:
      | 'pending'
      | 'source-created'
      | 'built'
      | 'previewed'
      | 'staging'
      | 'published'
      | 'failed';
    assetId?: string;
    assetVersion?: string;
  }[];
};

export type SceneDraftSetArtifactV1 = {
  scenes: {
    storyboardSceneId: string;
    draftId: string;
    draftRevision: number;
    sceneContentHash: string;
    bindingPayloadHash: string;
    preview: {
      stillAvailable: boolean;
      contactSheetAvailable: boolean;
    };
  }[];
};

export type SceneReviewReportV1 = {
  scenes: {
    storyboardSceneId: string;
    draftId: string;
    revision: number;
    sceneContentHash: string;
    validation: {
      valid: boolean;
      errors: unknown[];
      warnings: unknown[];
    };
    previewReferences: string[];
    reviewStatus: 'pending' | 'approved' | 'changes-requested';
  }[];
};
