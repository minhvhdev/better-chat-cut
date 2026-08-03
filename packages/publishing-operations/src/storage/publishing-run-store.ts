import { existsSync, readdirSync } from 'node:fs';
import {
  computePublishingArtifactHash,
  deepCloneJson,
  type PublishingArtifactType,
} from '../../../publishing-contracts/src/index.ts';
import type {
  PublishingArtifactEnvelopeV1,
  PublishingEventV1,
  PublishingReceiptV1,
  PublishingReviewV1,
  PublishingRunSummaryV1,
  PublishingRunV1,
  PublishingUploadOperationV1,
} from '../contracts/publishing-run.ts';
import { resolvePublishingRoot } from './publishing-root.ts';
import {
  artifactPath,
  assertSafeRunId,
  eventsPath,
  receiptPath,
  reviewPath,
  runJsonPath,
  runLockPath,
  uploadOpPath,
} from './publishing-paths.ts';
import { withPublishingRunLock } from './atomic-write.ts';
import { appendJsonl, atomicWriteJson, readJsonIfExists, readJsonlIfExists, writeImmutableJson } from './event-journal.ts';

export type PublishingRunStore = {
  root: string;
  resolveRoot(): string;
  listRuns(options?: { status?: string[]; limit?: number; offset?: number }): PublishingRunSummaryV1[];
  getRun(runId: string): PublishingRunV1 | null;
  getArtifact<T = unknown>(runId: string, artifactType: PublishingArtifactType, hash: string): PublishingArtifactEnvelopeV1<T> | null;
  getActiveArtifactContent<T = unknown>(run: PublishingRunV1, artifactType: PublishingArtifactType): T | null;
  getReceipt(runId: string, requestId: string): PublishingReceiptV1 | null;
  getReview(runId: string, reviewId: string): PublishingReviewV1 | null;
  getUploadOperation(runId: string, operationId: string): PublishingUploadOperationV1 | null;
  listEvents(runId: string): PublishingEventV1[];
  withLock<T>(runId: string, fn: () => Promise<T>): Promise<T>;
  writeRun(run: PublishingRunV1): void;
  writeArtifactEnvelope(runId: string, envelope: PublishingArtifactEnvelopeV1): void;
  writeReceipt(runId: string, receipt: PublishingReceiptV1): void;
  writeReview(runId: string, review: PublishingReviewV1): void;
  writeUploadOperation(runId: string, op: PublishingUploadOperationV1): void;
  appendEvent(runId: string, event: PublishingEventV1): void;
  computeArtifactHash(artifactType: PublishingArtifactType, content: unknown): string;
};

export function createPublishingRunStore(options?: { root?: string }): PublishingRunStore {
  const root = resolvePublishingRoot(options?.root);

  const store: PublishingRunStore = {
    root,
    resolveRoot: () => root,

    listRuns(options = {}) {
      const runsRoot = `${root}/runs`;
      if (!existsSync(runsRoot)) return [];
      const limit = options.limit ?? 20;
      const offset = options.offset ?? 0;
      const statusFilter = options.status ? new Set(options.status) : null;
      const dirs = readdirSync(runsRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      const summaries: PublishingRunSummaryV1[] = [];
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
          remoteVideoId: run.upload?.remoteVideoId,
          releaseManifestHash: run.release?.releaseManifestHash,
        });
      }
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return summaries.slice(offset, offset + limit);
    },

    getRun(runId) {
      return readJsonIfExists<PublishingRunV1>(runJsonPath(root, runId));
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

    getUploadOperation(runId, operationId) {
      return readJsonIfExists(uploadOpPath(root, runId, operationId));
    },

    listEvents(runId) {
      return readJsonlIfExists(eventsPath(root, runId));
    },

    withLock(runId, fn) {
      return withPublishingRunLock(runLockPath(root, runId), fn);
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

    writeUploadOperation(runId, op) {
      atomicWriteJson(uploadOpPath(root, runId, op.operationId), op);
    },

    appendEvent(runId, event) {
      appendJsonl(eventsPath(root, runId), event);
    },

    computeArtifactHash(artifactType, content) {
      return computePublishingArtifactHash({ artifactType, artifact: content });
    },
  };

  return store;
}
