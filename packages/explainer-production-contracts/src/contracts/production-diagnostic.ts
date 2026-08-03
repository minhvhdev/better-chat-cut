import type { ProductionStageId } from './production-stage-id.ts';
import type { ProductionArtifactType } from './production-artifact-type.ts';

export type ProductionDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  runId?: string;
  stageId?: ProductionStageId;
  artifactType?: ProductionArtifactType;
  artifactHash?: string;
  operationId?: string;
  reviewId?: string;
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};
