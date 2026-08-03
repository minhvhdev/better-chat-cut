import type { PublishingArtifactType, PublishingStageId } from '../../../publishing-contracts/src/index.ts';
import type { PublishingRunV1 } from '../contracts/publishing-run.ts';
import { getStageState } from './publishing-stage-registry.ts';

/** Invalidate stage and all following stages from the given stage (inclusive of reviews beyond it). */
export function invalidateFromStage(run: PublishingRunV1, fromStageId: PublishingStageId): void {
  const order: PublishingStageId[] = [
    'intake', 'metadata', 'thumbnail', 'package', 'package-review', 'connection-preflight',
    'upload', 'remote-processing', 'remote-assets', 'remote-verification',
    'release-review', 'release', 'post-release-validation', 'completion',
  ];
  const start = order.indexOf(fromStageId);
  if (start < 0) return;
  for (let i = start; i < order.length; i += 1) {
    const stage = getStageState(run, order[i]);
    if (order[i] === fromStageId && stage.status === 'completed') {
      // keep current if just re-entering? No — invalidate status for stages after completed predecessors
    }
    if (i === start) continue;
    if (stage.status === 'pending') continue;
    stage.status = 'pending';
    stage.review = undefined;
    stage.externalOperation = undefined;
    stage.errors = [];
    stage.warnings = [];
    stage.outputArtifacts = [];
  }
}

export const ARTIFACT_DOWNSTREAM: Partial<Record<PublishingArtifactType, PublishingStageId>> = {
  'publishing-metadata': 'package',
  'publishing-compliance': 'package',
  'thumbnail-plan': 'package',
  'thumbnail-artifact': 'package',
  'release-plan': 'package-review',
};
