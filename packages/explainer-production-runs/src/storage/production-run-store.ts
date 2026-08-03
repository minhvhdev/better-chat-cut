import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ProductionArtifactType } from '../../../explainer-production-contracts/src/index.ts';
import { computeProductionArtifactHash, deepCloneJson } from '../../../explainer-production-contracts/src/index.ts';
import type { ProductionArtifactEnvelopeV1 } from '../contracts/production-artifact-envelope.ts';
import type { ProductionRunV1 } from '../contracts/production-run.ts';
import type { ProductionReviewV1 } from '../contracts/production-review.ts';
import type { ProductionRunReceiptV1 } from '../contracts/production-receipt.ts';
import type { ProductionRunEventV1 } from '../contracts/production-event.ts';
import type { ProductionRunSummaryV1 } from '../contracts/production-run-summary.ts';
import { resolveProductionRunRoot } from './production-run-root.ts';
import {
  artifactPath,
  eventsPath,
  receiptPath,
  reviewPath,
  runJsonPath,
  runLockPath,
  runDir,
  assertSafeRunId,
} from './production-run-paths.ts';
import { withProductionRunLock } from './atomic-write.ts';
import { appendJsonl, atomicWriteJson, readJsonIfExists, readJsonlIfExists, writeImmutableJson } from './event-journal.ts';

export type ProductionRunStore = {
  root: string;
  resolveRoot(): string;
  listRuns(options?: { status?: string[]; limit?: number; offset?: number }): ProductionRunSummaryV1[];
  getRun(runId: string): ProductionRunV1 | null;
  getArtifact<T = unknown>(runId: string, artifactType: ProductionArtifactType, hash: string): ProductionArtifactEnvelopeV1<T> | null;
  getActiveArtifactContent<T = unknown>(run: ProductionRunV1, artifactType: ProductionArtifactType): T | null;
  getReceipt(runId: string, requestId: string): ProductionRunReceiptV1 | null;
  getReview(runId: string, reviewId: string): ProductionReviewV1 | null;
  listEvents(runId: string): ProductionRunEventV1[];
  withLock<T>(runId: string, fn: () => Promise<T>): Promise<T>;
  writeRun(run: ProductionRunV1): void;
  writeArtifactEnvelope(runId: string, envelope: ProductionArtifactEnvelopeV1): void;
  writeReceipt(runId: string, receipt: ProductionRunReceiptV1): void;
  writeReview(runId: string, review: ProductionReviewV1): void;
  appendEvent(runId: string, event: ProductionRunEventV1): void;
  computeArtifactHash(artifactType: ProductionArtifactType, content: unknown): string;
};

export function createProductionRunStore(options?: { root?: string }): ProductionRunStore {
  const root = resolveProductionRunRoot(options?.root);

  const store: ProductionRunStore = {
    root,
    resolveRoot: () => root,

    listRuns(options = {}) {
      if (!existsSync(root)) return [];
      const limit = options.limit ?? 20;
      const offset = options.offset ?? 0;
      const statusFilter = options.status ? new Set(options.status) : null;
      const dirs = readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      const summaries: ProductionRunSummaryV1[] = [];
      for (const runId of dirs) {
        try {
          assertSafeRunId(runId);
        } catch {
          continue;
        }
        const run = store.getRun(runId);
        if (!run) continue;
        if (statusFilter && !statusFilter.has(run.status)) continue;
        summaries.push({
          runId: run.runId,
          requestId: run.requestId,
          status: run.status,
          currentStageId: run.currentStageId,
          revision: run.revision,
          workflowFingerprint: run.workflowFingerprint,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          deliveryBundleId: run.delivery?.bundleId,
        });
      }
      // newest first
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return summaries.slice(offset, offset + limit);
    },

    getRun(runId) {
      return readJsonIfExists<ProductionRunV1>(runJsonPath(root, runId));
    },

    getArtifact(runId, artifactType, hash) {
      return readJsonIfExists(artifactPath(root, runId, artifactType, hash));
    },

    getActiveArtifactContent(run, artifactType) {
      const ref = run.artifacts.find((a) => a.artifactType === artifactType);
      if (!ref) return null;
      const envelope = store.getArtifact(run.runId, artifactType, ref.artifactHash);
      return envelope ? deepCloneJson(envelope.content) as never : null;
    },

    getReceipt(runId, requestId) {
      return readJsonIfExists(receiptPath(root, runId, requestId));
    },

    getReview(runId, reviewId) {
      return readJsonIfExists(reviewPath(root, runId, reviewId));
    },

    listEvents(runId) {
      return readJsonlIfExists(eventsPath(root, runId));
    },

    withLock(runId, fn) {
      return withProductionRunLock(runLockPath(root, runId), fn);
    },

    writeRun(run) {
      atomicWriteJson(runJsonPath(root, run.runId), run);
    },

    writeArtifactEnvelope(runId, envelope) {
      writeImmutableJson(artifactPath(root, runId, envelope.artifactType, envelope.artifactHash), envelope);
    },

    writeReceipt(runId, receipt) {
      atomicWriteJson(receiptPath(root, runId, receipt.requestId), receipt);
    },

    writeReview(runId, review) {
      atomicWriteJson(reviewPath(root, runId, review.reviewId), review);
    },

    appendEvent(runId, event) {
      appendJsonl(eventsPath(root, runId), event);
    },

    computeArtifactHash(artifactType, content) {
      return computeProductionArtifactHash({ artifactType, artifact: content });
    },
  };

  // ensure root can be created lazily
  void join(root);
  return store;
}

export function ensureRunDirectory(root: string, runId: string): void {
  const dir = runDir(root, runId);
  if (!existsSync(dir)) {
    // created via atomic writes
  }
}

export function getRunDir(store: ProductionRunStore, runId: string): string {
  return runDir(store.root, runId);
}
