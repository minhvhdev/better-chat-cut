import type { ProductionRunV1 } from '../contracts/production-run.ts';
import type { ProductionArtifactLineageV1 } from '../contracts/production-artifact-envelope.ts';
import type { ProductionRunStore } from '../storage/production-run-store.ts';
import { planNextAction } from '../workflow/stage-planner.ts';

export function inspectRun(run: ProductionRunV1) {
  return {
    runId: run.runId,
    status: run.status,
    currentStageId: run.currentStageId,
    revision: run.revision,
    workflowFingerprint: run.workflowFingerprint,
    nextAction: planNextAction(run),
    stages: run.stages.map((s) => ({
      stageId: s.stageId,
      status: s.status,
      attempt: s.attempt,
      review: s.review,
      externalOperation: s.externalOperation,
      errorCodes: s.errors.map((e) => e.code),
    })),
    artifactCount: run.artifacts.length,
    delivery: run.delivery,
  };
}

export function buildArtifactLineage(
  store: ProductionRunStore,
  run: ProductionRunV1,
): ProductionArtifactLineageV1[] {
  const byHash = new Map<string, ProductionArtifactLineageV1>();
  for (const ref of run.artifacts) {
    const env = store.getArtifact(run.runId, ref.artifactType, ref.artifactHash);
    const node: ProductionArtifactLineageV1 = {
      artifactType: ref.artifactType,
      artifactHash: ref.artifactHash,
      inputs: env?.inputs ?? [],
      downstream: [],
    };
    byHash.set(ref.artifactHash, node);
  }
  for (const node of byHash.values()) {
    for (const input of node.inputs) {
      const parent = byHash.get(input.artifactHash);
      if (parent) {
        parent.downstream.push({
          artifactType: node.artifactType,
          artifactHash: node.artifactHash,
        });
      }
    }
  }
  return [...byHash.values()];
}
