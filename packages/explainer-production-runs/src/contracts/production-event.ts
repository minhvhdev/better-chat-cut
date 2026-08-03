import type { ProductionStageId } from '../../../explainer-production-contracts/src/index.ts';

export type ProductionRunEventType =
  | 'run.created'
  | 'artifact.added'
  | 'stage.ready'
  | 'stage.started'
  | 'stage.awaiting-input'
  | 'stage.awaiting-review'
  | 'stage.awaiting-project-session'
  | 'stage.awaiting-external-operation'
  | 'stage.completed'
  | 'stage.failed'
  | 'stage.invalidated'
  | 'review.approved'
  | 'review.rejected'
  | 'run.resumed'
  | 'run.cancelled'
  | 'run.completed';

export type ProductionRunEventV1 = {
  eventId: string;
  runId: string;
  requestId?: string;
  eventType: ProductionRunEventType;
  stageId?: ProductionStageId;
  previousRevision?: number;
  nextRevision: number;
  occurredAt: string;
  details?: Record<string, unknown>;
};
