import type { ProductionRenderDiagnostic } from '../../../production-render-plans/src/contracts/production-render-errors.ts';

export type ProductionRenderOperationStatus =
  | 'queued'
  | 'preflight'
  | 'snapshotting'
  | 'rendering-video'
  | 'generating-subtitles'
  | 'running-qa'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ProductionRenderArtifactSummaryV1 = {
  role: 'video' | 'subtitle-srt' | 'subtitle-vtt' | 'qa-report' | 'contact-sheet' | 'manifest';
  relativePath: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  downloadUrl: string;
};

export type ProductionRenderOperationV1 = {
  schemaVersion: '1.0.0';
  operationId: string;
  bundleId: string;
  planHash: string;
  requestId: string;
  inputHash: string;
  status: ProductionRenderOperationStatus;
  progress: {
    phase: string;
    current?: number;
    total?: number;
    percent?: number;
  };
  artifacts: ProductionRenderArtifactSummaryV1[];
  qaStatus?: 'not-run' | 'running' | 'passed' | 'passed-with-warnings' | 'failed';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: ProductionRenderDiagnostic;
  cancelSupported: boolean;
};

export type ProductionRenderReceiptV1 = {
  requestId: string;
  inputHash: string;
  operationId: string;
  bundleId: string;
  planHash: string;
  submittedAt: string;
  completedBundleManifestHash?: string;
};

export type ProductionRenderEventV1 = {
  eventId: string;
  operationId: string;
  bundleId: string;
  eventType:
    | 'render.queued'
    | 'render.preflight-started'
    | 'render.snapshot-created'
    | 'render.video-started'
    | 'render.video-progress'
    | 'render.video-completed'
    | 'render.subtitles-completed'
    | 'render.qa-started'
    | 'render.qa-completed'
    | 'render.finalized'
    | 'render.failed'
    | 'render.cancelled';
  occurredAt: string;
  details?: Record<string, unknown>;
};

export type ProductionRenderArtifactV1 = ProductionRenderArtifactSummaryV1;

export type DeliveryBundleManifestV1 = {
  schemaVersion: '1.0.0';
  bundleId: string;
  renderPlan: {
    id: string;
    planHash: string;
    productionRenderRevision: string;
  };
  source: {
    projectId: string;
    projectFingerprint: string;
    timelineId: string;
    timelineFingerprint: string;
    startFrame: number;
    endFrame: number;
    width: number;
    height: number;
    fps: number;
    videoPlan?: { planId: string; planHash: string; assemblyId: string };
    narration?: { narrationPlanId: string; narrationPlanHash: string; timingHash: string };
  };
  output: {
    profileId: string;
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    videoCodec: string;
    audioCodec?: string;
  };
  qa: {
    status: 'passed' | 'passed-with-warnings';
    reportSha256: string;
  };
  artifacts: ProductionRenderArtifactV1[];
  manifestHash: string;
  createdAt: string;
};

export type DeliveryBundleManifestWithoutHash = Omit<DeliveryBundleManifestV1, 'manifestHash' | 'createdAt'>;
