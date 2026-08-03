import type { PublishingStageId } from './publishing-stage-id.ts';
import type { PublishingArtifactType } from './publishing-artifact-type.ts';

export type PublishingDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  publishingRunId?: string;
  stageId?: PublishingStageId;
  artifactType?: PublishingArtifactType;
  artifactHash?: string;
  operationId?: string;
  reviewId?: string;
  platform?: string;
  remoteVideoId?: string;
  /** Logical schema path, never a filesystem path. */
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};
