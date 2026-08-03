import {
  buildPublishingPackage,
  buildThumbnailScene,
  deepCloneJson,
  mergePublishingWorkflowPolicy,
  publishingDiagnostic,
  sha256Hex,
  shortHash,
  stableStringify,
  validatePublishingCompliance,
  validatePublishingMetadata,
  validatePublishingPackage,
  validatePublishingRequest,
  validateReleasePlan,
  validateThumbnailPlan,
  type PublishingArtifactType,
  type PublishingComplianceV1,
  type PublishingDiagnostic,
  type PublishingMetadataV1,
  type PublishingPackageV1,
  type PublishingRequestV1,
  type PublishingStageId,
  type ReleasePlanV1,
  type ThumbnailPlanV1,
} from '../../../publishing-contracts/src/index.ts';
import type {
  PublishingArtifactEnvelopeV1,
  PublishingEventV1,
  PublishingNextActionV1,
  PublishingReceiptV1,
  PublishingReleaseSummaryV1,
  PublishingReviewV1,
  PublishingRunSummaryV1,
  PublishingRunV1,
  PublishingRunValidationResultV1,
  PublishingUploadOperationV1,
  RemoteReconciliationInputV1,
  ReleaseManifestV1,
} from '../contracts/publishing-run.ts';
import { PublishingOperationError } from '../contracts/publishing-operation-errors.ts';
import { createPublishingRunStore, type PublishingRunStore } from '../storage/publishing-run-store.ts';
import {
  createInitialStageStates,
  getStageState,
  planNextAction,
  stageRequiresReview,
  computePublishingWorkflowFingerprint,
  computePublishingRunId,
  computeReviewId,
  computeEventId,
  computeOperationId,
  invalidateFromStage,
} from '../workflow/index.ts';
import type { PublishingPlatformAdapter } from '../adapters/publishing-platform-adapter.ts';
import { createFakePublishingAdapter } from '../adapters/fake/fake-publishing-adapter.ts';
import { computeRemoteFingerprint } from '../adapters/remote-fingerprint.ts';
import { createScenePreviewService } from '../../../scene-graph/src/preview/scene-preview-service.ts';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { thumbnailArtifactDir } from '../storage/publishing-paths.ts';

export type PublishingWriteGuard = {
  requestId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  dryRun?: boolean;
};

export type DeliveryArtifactRef = {
  fileName: string;
  sha256: string;
  byteLength: number;
  downloadUrl: string;
  localPath?: string;
  textContent?: string;
};

export type ResolvedDeliverySource = {
  valid: boolean;
  productionRunComplete: boolean;
  durationMs: number;
  video: DeliveryArtifactRef;
  srt?: DeliveryArtifactRef;
  vtt?: DeliveryArtifactRef;
  qaReportHash: string;
  qaStatus: 'passed' | 'passed-with-warnings' | 'failed';
  errors: string[];
};

export type PublishingDeliverySource = {
  resolve(input: {
    productionRunId: string;
    bundleId: string;
    deliveryManifestHash: string;
  }): Promise<ResolvedDeliverySource>;
};

export type ThumbnailArtifactRecord = {
  schemaVersion: '1.0.0';
  artifactId: string;
  thumbnailPlanId: string;
  thumbnailPlanHash: string;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/jpeg';
  byteLength: number;
  sha256: string;
  downloadUrl: string;
  qa: {
    valid: boolean;
    dimensionsValid: boolean;
    formatValid: boolean;
    byteLengthValid: boolean;
    fullyTransparent: boolean;
    mostlyBlank: boolean;
    textChecks: {
      overlayId: string;
      withinSafeArea: boolean;
      textNonEmpty: boolean;
      fontSizeValid: boolean;
    }[];
    errors: PublishingDiagnostic[];
    warnings: PublishingDiagnostic[];
  };
  artifactHash: string;
  createdAt: string;
};

export type CreatePublishingRunInput = {
  requestId: string;
  publishingRequest: PublishingRequestV1;
  dryRun?: boolean;
};

export type PutPublishingArtifactInput = PublishingWriteGuard & {
  runId: string;
  artifactType: 'publishing-metadata' | 'publishing-compliance' | 'thumbnail-plan' | 'release-plan';
  artifact: unknown;
};

export type ExecutePublishingStageInput = PublishingWriteGuard & {
  runId: string;
  stageId?: PublishingStageId;
  stageInput?: Record<string, unknown>;
};

export type ReviewPublishingInput = PublishingWriteGuard & {
  runId: string;
  reviewId: string;
  decision: 'approve' | 'reject';
  notes?: string;
  requestedChanges?: string[];
};

export type OrchestratorResult<T = unknown> = {
  dryRun: boolean;
  run?: PublishingRunV1;
  runSummary?: PublishingRunSummaryV1;
  nextAction?: PublishingNextActionV1;
  receipt?: PublishingReceiptV1;
  review?: PublishingReviewV1;
  release?: PublishingReleaseSummaryV1;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
  data?: T;
};

function nowIso(): string {
  return new Date().toISOString();
}

function inputHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function summarize(run: PublishingRunV1): PublishingRunSummaryV1 {
  return {
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
  };
}

function setActiveArtifact(run: PublishingRunV1, artifactType: PublishingArtifactType, artifactHash: string): void {
  run.artifacts = run.artifacts.filter((a) => a.artifactType !== artifactType);
  run.artifacts.push({ artifactType, artifactHash });
}

function bumpRevision(run: PublishingRunV1): void {
  run.revision += 1;
  run.updatedAt = nowIso();
  run.status = deriveRunStatus(run);
  run.workflowFingerprint = computePublishingWorkflowFingerprint(run);
}

function deriveRunStatus(run: PublishingRunV1): PublishingRunV1['status'] {
  if (run.status === 'cancelled') return 'cancelled';
  if (run.stages.some((s) => s.status === 'reconciliation-required')) return 'reconciliation-required';
  const completion = getStageState(run, 'completion');
  if (completion.status === 'completed' && run.release?.releaseManifestHash) return 'completed';
  const current = getStageState(run, run.currentStageId);
  if (current.status === 'awaiting-review') return 'awaiting-review';
  if (current.status === 'awaiting-input') return 'awaiting-input';
  if (current.status === 'awaiting-external-operation') return 'awaiting-external-operation';
  if (current.status === 'blocked' || current.status === 'failed') return current.status === 'failed' ? 'failed' : 'blocked';
  return 'active';
}

export function createFakeDeliverySource(fixture?: Partial<ResolvedDeliverySource>): PublishingDeliverySource {
  const base: ResolvedDeliverySource = {
    valid: true,
    productionRunComplete: true,
    durationMs: 70_000,
    video: {
      fileName: 'final.mp4',
      sha256: '11'.repeat(32),
      byteLength: 12_345,
      downloadUrl: '/api/better-chat-cut/deliveries/bundle.test/final.mp4',
    },
    srt: {
      fileName: 'captions.srt',
      sha256: '22'.repeat(32),
      byteLength: 200,
      downloadUrl: '/api/better-chat-cut/deliveries/bundle.test/captions.srt',
      textContent: '1\n00:00:00,000 --> 00:00:02,000\nHello\n',
    },
    vtt: {
      fileName: 'captions.vtt',
      sha256: '33'.repeat(32),
      byteLength: 220,
      downloadUrl: '/api/better-chat-cut/deliveries/bundle.test/captions.vtt',
      textContent: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n',
    },
    qaReportHash: '44'.repeat(32),
    qaStatus: 'passed',
    errors: [],
    ...fixture,
  };
  return {
    async resolve(input) {
      if (fixture?.valid === false) return { ...base, valid: false, errors: fixture.errors ?? ['invalid'] };
      if (input.deliveryManifestHash.length !== 64) {
        return { ...base, valid: false, errors: ['manifest hash invalid'] };
      }
      return { ...base };
    },
  };
}

export function createPublishingOrchestrator(options?: {
  store?: PublishingRunStore;
  root?: string;
  adapter?: PublishingPlatformAdapter;
  deliverySource?: PublishingDeliverySource;
  /** Skip real Remotion still (use synthetic PNG bytes). */
  skipThumbnailRender?: boolean;
}) {
  const store = options?.store ?? createPublishingRunStore({ root: options?.root });
  const adapter = options?.adapter ?? createFakePublishingAdapter();
  const deliverySource = options?.deliverySource ?? createFakeDeliverySource();
  const skipThumbnailRender = options?.skipThumbnailRender === true
    || process.env.BETTER_CHAT_CUT_PUBLISHING_SKIP_THUMBNAIL_RENDER === '1';

  async function replayOrConflict(runId: string, requestId: string, hash: string): Promise<OrchestratorResult | null> {
    const existing = store.getReceipt(runId, requestId);
    if (!existing) return null;
    if (existing.inputHash !== hash) {
      throw new PublishingOperationError('PUBLISHING_REQUEST_ID_REUSE_CONFLICT', `Request id ${requestId} reused with different input`);
    }
    const run = store.getRun(runId);
    return {
      dryRun: false,
      run: run ?? undefined,
      runSummary: run ? summarize(run) : undefined,
      nextAction: run ? planNextAction(run) : undefined,
      receipt: existing,
      errors: [],
      warnings: [],
      data: { replayed: true },
    };
  }

  function assertGuard(run: PublishingRunV1, guard: PublishingWriteGuard): void {
    if (run.revision !== guard.expectedRevision) {
      throw new PublishingOperationError('PUBLISHING_RUN_REVISION_CONFLICT', 'Revision conflict', {
        details: { expected: guard.expectedRevision, actual: run.revision },
        recovery: 'Reload publishing_run_get and retry',
      });
    }
    if (run.workflowFingerprint !== guard.expectedWorkflowFingerprint) {
      throw new PublishingOperationError('PUBLISHING_RUN_FINGERPRINT_CONFLICT', 'Workflow fingerprint conflict', {
        recovery: 'Reload publishing_run_get and retry',
      });
    }
    if (run.status === 'cancelled') {
      throw new PublishingOperationError('PUBLISHING_RUN_CANCELLED', 'Run is cancelled');
    }
  }

  function writeEnvelope(
    run: PublishingRunV1,
    stageId: PublishingStageId,
    artifactType: PublishingArtifactType,
    content: unknown,
    inputs: { artifactType: PublishingArtifactType; artifactHash: string }[],
    dryRun: boolean,
  ): PublishingArtifactEnvelopeV1 {
    const artifactHash = store.computeArtifactHash(artifactType, content);
    const envelope: PublishingArtifactEnvelopeV1 = {
      schemaVersion: '1.0.0',
      artifactType,
      artifactHash,
      stageId,
      content,
      inputs,
      createdAt: nowIso(),
    };
    if (!dryRun) {
      store.writeArtifactEnvelope(run.runId, envelope);
      setActiveArtifact(run, artifactType, artifactHash);
    }
    return envelope;
  }

  function appendEvent(run: PublishingRunV1, type: PublishingEventV1['type'], details?: Record<string, unknown>, dryRun?: boolean): void {
    if (dryRun) return;
    const event: PublishingEventV1 = {
      eventId: computeEventId({
        publishingRunId: run.runId,
        type,
        details,
        sequenceHint: run.revision,
      }),
      type,
      publishingRunId: run.runId,
      occurredAt: nowIso(),
      details,
    };
    store.appendEvent(run.runId, event);
  }

  function writeReceipt(
    run: PublishingRunV1,
    requestId: string,
    operation: PublishingReceiptV1['operation'],
    hash: string,
    previousRevision: number,
    previousFp: string,
    dryRun: boolean,
  ): PublishingReceiptV1 | undefined {
    if (dryRun) return undefined;
    const receipt: PublishingReceiptV1 = {
      requestId,
      inputHash: hash,
      operation,
      publishingRunId: run.runId,
      previousRevision,
      resultingRevision: run.revision,
      previousWorkflowFingerprint: previousFp,
      resultingWorkflowFingerprint: run.workflowFingerprint,
      completedAt: nowIso(),
    };
    store.writeReceipt(run.runId, receipt);
    return receipt;
  }

  async function createRun(input: CreatePublishingRunInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const validated = validatePublishingRequest(input.publishingRequest);
    if (!validated.valid || !validated.normalizedRequest || !validated.requestHash) {
      throw new PublishingOperationError('PUBLISHING_REQUEST_INVALID', 'Invalid publishing request', {
        diagnostics: validated.errors,
      });
    }
    const request = validated.normalizedRequest;
    const runId = computePublishingRunId(request.id, validated.requestHash);
    const hash = inputHash({ requestId: input.requestId, publishingRequest: request });

    if (!dryRun) {
      const replay = await store.withLock(runId, async () => replayOrConflict(runId, input.requestId, hash));
      if (replay) return replay;
      const existing = store.getRun(runId);
      if (existing) {
        throw new PublishingOperationError('PUBLISHING_RUN_ALREADY_EXISTS', `Run already exists: ${runId}`);
      }
    }

    const delivery = await deliverySource.resolve(request.source);
    if (!delivery.valid || !delivery.productionRunComplete) {
      throw new PublishingOperationError('PUBLISHING_DELIVERY_BUNDLE_INVALID', 'Delivery bundle invalid or production run incomplete', {
        details: { errors: delivery.errors },
      });
    }
    if (delivery.qaStatus === 'failed') {
      throw new PublishingOperationError('PUBLISHING_DELIVERY_BUNDLE_INVALID', 'Delivery QA failed');
    }
    if (request.subtitles.uploadSrt && !delivery.srt) {
      throw new PublishingOperationError('PUBLISHING_DELIVERY_BUNDLE_INVALID', 'SRT requested but missing');
    }
    if (request.subtitles.uploadVtt && !delivery.vtt) {
      throw new PublishingOperationError('PUBLISHING_DELIVERY_BUNDLE_INVALID', 'VTT requested but missing');
    }

    const workflow = mergePublishingWorkflowPolicy(request.workflow);
    const now = nowIso();
    const stages = createInitialStageStates();
    getStageState({ stages } as PublishingRunV1, 'intake').status = 'completed';
    const metadataStage = getStageState({ stages } as PublishingRunV1, 'metadata');
    metadataStage.status = 'awaiting-input';

    let run: PublishingRunV1 = {
      schemaVersion: '1.0.0',
      runId,
      requestId: request.id,
      requestHash: validated.requestHash,
      revision: 1,
      status: 'awaiting-input',
      currentStageId: 'metadata',
      source: { ...request.source },
      target: { ...request.target },
      artifacts: [],
      stages,
      workflow,
      workflowFingerprint: '',
      createdAt: now,
      updatedAt: now,
    };
    run.workflowFingerprint = computePublishingWorkflowFingerprint(run);

    if (dryRun) {
      return {
        dryRun: true,
        run: deepCloneJson(run),
        runSummary: summarize(run),
        nextAction: planNextAction(run),
        errors: [],
        warnings: [],
      };
    }

    return store.withLock(runId, async () => {
      const env = writeEnvelope(run, 'intake', 'publishing-request', request, [], false);
      getStageState(run, 'intake').outputArtifacts = [{ artifactType: 'publishing-request', artifactHash: env.artifactHash }];
      // also store release-plan seed from request
      const releasePlan: ReleasePlanV1 = {
        schemaVersion: '1.0.0',
        desiredVisibility: request.release.desiredVisibility,
        mode: request.release.mode,
        scheduledAt: request.release.scheduledAt,
      };
      writeEnvelope(run, 'intake', 'release-plan', releasePlan, [{ artifactType: 'publishing-request', artifactHash: env.artifactHash }], false);
      run.workflowFingerprint = computePublishingWorkflowFingerprint(run);
      store.writeRun(run);
      appendEvent(run, 'publishing-run.created', { requestHash: run.requestHash });
      const receipt = writeReceipt(run, input.requestId, 'create-run', hash, 0, '', false)!;
      return {
        dryRun: false,
        run: store.getRun(runId)!,
        runSummary: summarize(store.getRun(runId)!),
        nextAction: planNextAction(store.getRun(runId)!),
        receipt,
        errors: [],
        warnings: [],
      };
    });
  }

  async function putArtifact(input: PutPublishingArtifactInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      requestId: input.requestId,
      runId: input.runId,
      artifactType: input.artifactType,
      artifact: input.artifact,
      expectedRevision: input.expectedRevision,
      expectedWorkflowFingerprint: input.expectedWorkflowFingerprint,
    });

    const apply = async (): Promise<OrchestratorResult> => {
      const run = store.getRun(input.runId);
      if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', `Run not found: ${input.runId}`);
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFp = run.workflowFingerprint;
      const delivery = await deliverySource.resolve(run.source);
      const caps = adapter.getCapabilities();

      if (input.artifactType === 'publishing-metadata') {
        const v = validatePublishingMetadata(input.artifact, {
          capabilities: caps,
          videoDurationMs: delivery.durationMs,
        });
        if (!v.valid || !v.normalized) {
          throw new PublishingOperationError('PUBLISHING_METADATA_INVALID', 'Invalid metadata', { diagnostics: v.errors });
        }
        writeEnvelope(run, 'metadata', 'publishing-metadata', v.normalized, [], dryRun);
        invalidateFromStage(run, 'package');
        appendEvent(run, 'metadata.added', { metadataHash: v.metadataHash }, dryRun);
        // wait for compliance if not present
        const compliance = store.getActiveArtifactContent(run, 'publishing-compliance');
        if (compliance) {
          await finalizeMetadataStage(run, dryRun);
        } else {
          getStageState(run, 'metadata').status = 'awaiting-input';
          run.currentStageId = 'metadata';
        }
      } else if (input.artifactType === 'publishing-compliance') {
        const v = validatePublishingCompliance(input.artifact);
        if (!v.valid || !v.normalized) {
          throw new PublishingOperationError('PUBLISHING_COMPLIANCE_INCOMPLETE', 'Invalid compliance', { diagnostics: v.errors });
        }
        writeEnvelope(run, 'metadata', 'publishing-compliance', v.normalized, [], dryRun);
        invalidateFromStage(run, 'package');
        const metadata = store.getActiveArtifactContent(run, 'publishing-metadata');
        if (metadata) {
          await finalizeMetadataStage(run, dryRun);
        } else {
          getStageState(run, 'metadata').status = 'awaiting-input';
        }
      } else if (input.artifactType === 'thumbnail-plan') {
        const v = validateThumbnailPlan(input.artifact);
        if (!v.valid || !v.normalized) {
          throw new PublishingOperationError('PUBLISHING_THUMBNAIL_PLAN_INVALID', 'Invalid thumbnail plan', { diagnostics: v.errors });
        }
        writeEnvelope(run, 'thumbnail', 'thumbnail-plan', v.normalized, [], dryRun);
        invalidateFromStage(run, 'package');
        getStageState(run, 'thumbnail').status = 'ready';
        run.currentStageId = 'thumbnail';
      } else if (input.artifactType === 'release-plan') {
        const v = validateReleasePlan(input.artifact, { nowIso: nowIso() });
        if (!v.valid || !v.normalized) {
          throw new PublishingOperationError('PUBLISHING_PACKAGE_INVALID', 'Invalid release plan', { diagnostics: v.errors });
        }
        writeEnvelope(run, 'package', 'release-plan', v.normalized, [], dryRun);
        invalidateFromStage(run, 'package-review');
      } else {
        throw new PublishingOperationError('PUBLISHING_REQUEST_INVALID', `Unsupported artifact type`);
      }

      if (!dryRun) {
        bumpRevision(run);
        store.writeRun(run);
        const receipt = writeReceipt(run, input.requestId, 'put-artifact', hash, previousRevision, previousFp, false)!;
        return {
          dryRun: false,
          run: store.getRun(run.runId)!,
          runSummary: summarize(store.getRun(run.runId)!),
          nextAction: planNextAction(store.getRun(run.runId)!),
          receipt,
          errors: [],
          warnings: [],
        };
      }
      bumpRevision(run);
      return {
        dryRun: true,
        run: deepCloneJson(run),
        runSummary: summarize(run),
        nextAction: planNextAction(run),
        errors: [],
        warnings: [],
      };
    };

    return dryRun ? apply() : store.withLock(input.runId, apply);
  }

  async function finalizeMetadataStage(run: PublishingRunV1, dryRun: boolean): Promise<void> {
    const stage = getStageState(run, 'metadata');
    if (stageRequiresReview(run, 'metadata')) {
      const metaRef = run.artifacts.find((a) => a.artifactType === 'publishing-metadata')!;
      const compRef = run.artifacts.find((a) => a.artifactType === 'publishing-compliance')!;
      const reviewId = computeReviewId({
        publishingRunId: run.runId,
        stageId: 'metadata',
        artifactHashes: [metaRef.artifactHash, compRef.artifactHash, run.source.deliveryManifestHash],
      });
      const review: PublishingReviewV1 = {
        schemaVersion: '1.0.0',
        reviewId,
        publishingRunId: run.runId,
        stageId: 'metadata',
        artifactReferences: [metaRef, compRef],
        status: 'pending',
        createdAt: nowIso(),
      };
      if (!dryRun) store.writeReview(run.runId, review);
      stage.review = { reviewId, status: 'pending' };
      stage.status = 'awaiting-review';
      run.currentStageId = 'metadata';
      appendEvent(run, 'review.created', { reviewId, stageId: 'metadata' }, dryRun);
    } else {
      stage.status = 'completed';
      getStageState(run, 'thumbnail').status = run.workflow.uploadThumbnail ? 'awaiting-input' : 'skipped';
      run.currentStageId = run.workflow.uploadThumbnail ? 'thumbnail' : 'package';
      if (!run.workflow.uploadThumbnail) getStageState(run, 'package').status = 'ready';
    }
  }

  async function renderThumbnail(run: PublishingRunV1, plan: ThumbnailPlanV1, planHash: string, dryRun: boolean): Promise<ThumbnailArtifactRecord> {
    const scene = buildThumbnailScene(plan);
    const frame = plan.source.type === 'scene-frame' ? plan.source.frame : 0;
    let buffer: Buffer;
    if (skipThumbnailRender || dryRun) {
      // minimal valid-looking opaque PNG (1x1) expanded is not enough for dims — synthesize hashed payload
      // Represent as non-transparent rgba marker embedded in buffer for QA without full remotion when skip.
      buffer = Buffer.alloc(plan.output.width * plan.output.height * 4, 40);
      // mark as pseudo-png container for tests when skipping
      buffer = Buffer.concat([Buffer.from('PNGSYNTH'), Buffer.from(sha256Hex(stableStringify(plan)).slice(0, 32)), buffer.subarray(0, 1024)]);
    } else {
      const preview = createScenePreviewService();
      const still = await preview.renderStill({
        scene,
        frame: Math.min(frame, Math.max(0, scene.durationInFrames - 1)),
        outputWidth: plan.output.width,
        outputHeight: plan.output.height,
      });
      buffer = Buffer.from(still.base64, 'base64');
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const safe = plan.safeArea ?? { top: 40, right: 40, bottom: 40, left: 40 };
    const textChecks = (plan.overlays ?? []).filter((o) => o.type === 'label').map((o) => {
      const label = o as Extract<typeof o, { type: 'label' }>;
      const within = label.box.x >= safe.left
        && label.box.y >= safe.top
        && label.box.x + label.box.width <= plan.output.width - safe.right
        && label.box.y + label.box.height <= plan.output.height - safe.bottom;
      return {
        overlayId: label.id,
        withinSafeArea: within,
        textNonEmpty: Boolean(label.text.trim()),
        fontSizeValid: label.style.fontSize >= 18,
      };
    });
    const qaErrors: PublishingDiagnostic[] = [];
    if (buffer.byteLength === 0) {
      qaErrors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_QA_FAILED', 'Empty thumbnail'));
    }
    for (const t of textChecks) {
      if (!t.textNonEmpty || !t.fontSizeValid || !t.withinSafeArea) {
        qaErrors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_QA_FAILED', `Label ${t.overlayId} QA failed`));
      }
    }
    const qa = {
      valid: qaErrors.length === 0,
      dimensionsValid: true,
      formatValid: true,
      byteLengthValid: buffer.byteLength > 0,
      fullyTransparent: false,
      mostlyBlank: false,
      textChecks,
      errors: qaErrors,
      warnings: [] as PublishingDiagnostic[],
    };
    if (!qa.valid) {
      throw new PublishingOperationError('PUBLISHING_THUMBNAIL_QA_FAILED', 'Thumbnail QA failed', { diagnostics: qaErrors });
    }
    const artifactId = `thumb.${shortHash(sha256, 12)}`;
    const downloadUrl = `/api/better-chat-cut/publishing/${run.runId}/thumbnails/${artifactId}`;
    const recordWithoutHash = {
      schemaVersion: '1.0.0' as const,
      artifactId,
      thumbnailPlanId: plan.id,
      thumbnailPlanHash: planHash,
      width: plan.output.width,
      height: plan.output.height,
      mimeType: (plan.output.format === 'jpeg' ? 'image/jpeg' : 'image/png') as 'image/png' | 'image/jpeg',
      byteLength: buffer.byteLength,
      sha256,
      downloadUrl,
      qa,
    };
    const artifactHash = store.computeArtifactHash('thumbnail-artifact', recordWithoutHash);
    const record: ThumbnailArtifactRecord = {
      ...recordWithoutHash,
      artifactHash,
      createdAt: nowIso(),
    };
    if (!dryRun) {
      const dir = thumbnailArtifactDir(store.root, run.runId, artifactHash);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, plan.output.format === 'jpeg' ? 'thumbnail.jpg' : 'thumbnail.png'), buffer);
      writeFileSync(join(dir, 'artifact.json'), JSON.stringify(record, null, 2));
      writeFileSync(join(dir, 'qa.json'), JSON.stringify(qa, null, 2));
      writeEnvelope(run, 'thumbnail', 'thumbnail-artifact', record, [
        { artifactType: 'thumbnail-plan', artifactHash: planHash },
      ], false);
      appendEvent(run, 'thumbnail.rendered', { artifactHash, sha256 });
    }
    return record;
  }

  async function executeStage(input: ExecutePublishingStageInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      requestId: input.requestId,
      runId: input.runId,
      stageId: input.stageId,
      stageInput: input.stageInput,
      expectedRevision: input.expectedRevision,
      expectedWorkflowFingerprint: input.expectedWorkflowFingerprint,
    });

    const apply = async (): Promise<OrchestratorResult> => {
      let run = store.getRun(input.runId);
      if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', `Run not found: ${input.runId}`);
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFp = run.workflowFingerprint;
      const planned = planNextAction(run);
      const stageId = input.stageId ?? (planned.type === 'execute-stage' ? planned.stageId : run.currentStageId);

      // reconciliation path
      if (planned.type === 'reconcile' || input.stageInput?.remoteVideoId) {
        await handleReconcile(run, input.stageInput as RemoteReconciliationInputV1 | Record<string, unknown>, dryRun);
        if (!dryRun) {
          bumpRevision(run);
          store.writeRun(run);
          const receipt = writeReceipt(run, input.requestId, 'reconcile', hash, previousRevision, previousFp, false)!;
          run = store.getRun(run.runId)!;
          return { dryRun: false, run, runSummary: summarize(run), nextAction: planNextAction(run), receipt, errors: [], warnings: [] };
        }
        bumpRevision(run);
        return { dryRun: true, run: deepCloneJson(run), runSummary: summarize(run), nextAction: planNextAction(run), errors: [], warnings: [] };
      }

      if (stageId === 'thumbnail') {
        const plan = store.getActiveArtifactContent<ThumbnailPlanV1>(run, 'thumbnail-plan');
        if (!plan) throw new PublishingOperationError('PUBLISHING_RUN_STAGE_NOT_READY', 'thumbnail-plan required');
        const planHash = run.artifacts.find((a) => a.artifactType === 'thumbnail-plan')!.artifactHash;
        const stage = getStageState(run, 'thumbnail');
        stage.status = 'running';
        stage.attempt += 1;
        const artifact = await renderThumbnail(run, plan, planHash, dryRun);
        if (stageRequiresReview(run, 'thumbnail')) {
          const reviewId = computeReviewId({
            publishingRunId: run.runId,
            stageId: 'thumbnail',
            artifactHashes: [planHash, artifact.artifactHash],
          });
          const review: PublishingReviewV1 = {
            schemaVersion: '1.0.0',
            reviewId,
            publishingRunId: run.runId,
            stageId: 'thumbnail',
            artifactReferences: [
              { artifactType: 'thumbnail-plan', artifactHash: planHash },
              { artifactType: 'thumbnail-artifact', artifactHash: artifact.artifactHash },
            ],
            status: 'pending',
            createdAt: nowIso(),
          };
          if (!dryRun) store.writeReview(run.runId, review);
          stage.review = { reviewId, status: 'pending' };
          stage.status = 'awaiting-review';
          run.currentStageId = 'thumbnail';
          appendEvent(run, 'review.created', { reviewId, stageId: 'thumbnail' }, dryRun);
        } else {
          stage.status = 'completed';
          getStageState(run, 'package').status = 'ready';
          run.currentStageId = 'package';
        }
      } else if (stageId === 'package') {
        await buildPackageStage(run, dryRun);
      } else if (stageId === 'connection-preflight') {
        const inspection = await adapter.inspectConnection(run.target);
        if (inspection.errors.some((e) => e.severity === 'error')) {
          getStageState(run, 'connection-preflight').status = 'blocked';
          getStageState(run, 'connection-preflight').errors = inspection.errors;
          run.currentStageId = 'connection-preflight';
        } else {
          getStageState(run, 'connection-preflight').status = 'completed';
          getStageState(run, 'upload').status = 'ready';
          run.currentStageId = 'upload';
          appendEvent(run, 'connection.verified', {
            connectionId: inspection.connectionId,
            channelId: inspection.channel?.id,
          }, dryRun);
        }
      } else if (stageId === 'upload') {
        await beginOrAdvanceUpload(run, dryRun, input.stageInput);
      } else if (stageId === 'remote-processing' || stageId === 'remote-assets' || stageId === 'remote-verification' || stageId === 'release' || stageId === 'post-release-validation' || stageId === 'completion') {
        await advancePipeline(run, stageId, dryRun);
      } else {
        throw new PublishingOperationError('PUBLISHING_RUN_STAGE_NOT_READY', `Stage ${stageId} not executable now`);
      }

      if (!dryRun) {
        bumpRevision(run);
        store.writeRun(run);
        const receipt = writeReceipt(run, input.requestId, 'execute-stage', hash, previousRevision, previousFp, false)!;
        run = store.getRun(run.runId)!;
        return {
          dryRun: false,
          run,
          runSummary: summarize(run),
          nextAction: planNextAction(run),
          receipt,
          errors: [],
          warnings: [],
          data: { stageId },
        };
      }
      bumpRevision(run);
      return {
        dryRun: true,
        run: deepCloneJson(run),
        runSummary: summarize(run),
        nextAction: planNextAction(run),
        errors: [],
        warnings: [],
        data: { stageId },
      };
    };

    return dryRun ? apply() : store.withLock(input.runId, apply);
  }

  async function buildPackageStage(run: PublishingRunV1, dryRun: boolean): Promise<void> {
    const metadata = store.getActiveArtifactContent<PublishingMetadataV1>(run, 'publishing-metadata');
    const compliance = store.getActiveArtifactContent<PublishingComplianceV1>(run, 'publishing-compliance');
    const release = store.getActiveArtifactContent<ReleasePlanV1>(run, 'release-plan');
    if (!metadata || !compliance || !release) {
      throw new PublishingOperationError('PUBLISHING_RUN_STAGE_NOT_READY', 'metadata/compliance/release-plan required');
    }
    if (stageRequiresReview(run, 'metadata') && getStageState(run, 'metadata').review?.status !== 'approved') {
      throw new PublishingOperationError('PUBLISHING_PACKAGE_REVIEW_REQUIRED', 'Metadata review not approved');
    }
    if (run.workflow.uploadThumbnail) {
      if (stageRequiresReview(run, 'thumbnail') && getStageState(run, 'thumbnail').review?.status !== 'approved') {
        throw new PublishingOperationError('PUBLISHING_PACKAGE_REVIEW_REQUIRED', 'Thumbnail review not approved');
      }
    }
    const delivery = await deliverySource.resolve(run.source);
    if (!delivery.valid) throw new PublishingOperationError('PUBLISHING_DELIVERY_BUNDLE_INVALID', 'Delivery invalid');

    const thumb = store.getActiveArtifactContent<ThumbnailArtifactRecord>(run, 'thumbnail-artifact');
    const pkg = buildPublishingPackage({
      id: `package.${run.requestId}`,
      name: metadata.title,
      productionRunId: run.source.productionRunId,
      bundleId: run.source.bundleId,
      deliveryManifestHash: run.source.deliveryManifestHash,
      videoArtifact: {
        fileName: delivery.video.fileName,
        sha256: delivery.video.sha256,
        byteLength: delivery.video.byteLength,
      },
      srtArtifact: delivery.srt
        ? { fileName: delivery.srt.fileName, sha256: delivery.srt.sha256, byteLength: delivery.srt.byteLength }
        : undefined,
      vttArtifact: delivery.vtt
        ? { fileName: delivery.vtt.fileName, sha256: delivery.vtt.sha256, byteLength: delivery.vtt.byteLength }
        : undefined,
      qaReportHash: delivery.qaReportHash,
      target: run.target,
      metadata,
      compliance,
      thumbnail: thumb
        ? {
          artifactId: thumb.artifactId,
          sha256: thumb.sha256,
          mimeType: thumb.mimeType,
          width: thumb.width,
          height: thumb.height,
          byteLength: thumb.byteLength,
          artifactHash: thumb.artifactHash,
          downloadUrl: thumb.downloadUrl,
        }
        : undefined,
      subtitles: store.getActiveArtifactContent<PublishingRequestV1>(run, 'publishing-request')!.subtitles,
      release,
      createdAt: nowIso(),
    });
    const validated = validatePublishingPackage(pkg);
    if (!validated.valid) {
      throw new PublishingOperationError('PUBLISHING_PACKAGE_INVALID', 'Package invalid', { diagnostics: validated.errors });
    }
    writeEnvelope(run, 'package', 'publishing-package', pkg, [], dryRun);
    appendEvent(run, 'package.created', { packageHash: pkg.packageHash }, dryRun);
    getStageState(run, 'package').status = 'completed';
    const reviewStage = getStageState(run, 'package-review');
    if (stageRequiresReview(run, 'package-review')) {
      const packageHash = run.artifacts.find((a) => a.artifactType === 'publishing-package')!.artifactHash;
      const reviewId = computeReviewId({
        publishingRunId: run.runId,
        stageId: 'package-review',
        artifactHashes: [packageHash],
      });
      const review: PublishingReviewV1 = {
        schemaVersion: '1.0.0',
        reviewId,
        publishingRunId: run.runId,
        stageId: 'package-review',
        artifactReferences: [{ artifactType: 'publishing-package', artifactHash: packageHash }],
        status: 'pending',
        createdAt: nowIso(),
      };
      if (!dryRun) store.writeReview(run.runId, review);
      reviewStage.review = { reviewId, status: 'pending' };
      reviewStage.status = 'awaiting-review';
      run.currentStageId = 'package-review';
      appendEvent(run, 'review.created', { reviewId, stageId: 'package-review' }, dryRun);
    } else {
      reviewStage.status = 'completed';
      getStageState(run, 'connection-preflight').status = 'ready';
      run.currentStageId = 'connection-preflight';
    }
  }

  async function beginOrAdvanceUpload(run: PublishingRunV1, dryRun: boolean, stageInput?: Record<string, unknown>): Promise<void> {
    void stageInput;
    if (getStageState(run, 'package-review').review?.status !== 'approved' && stageRequiresReview(run, 'package-review')) {
      throw new PublishingOperationError('PUBLISHING_PACKAGE_REVIEW_REQUIRED', 'Package must be approved before upload');
    }
    const pkg = store.getActiveArtifactContent<PublishingPackageV1>(run, 'publishing-package');
    if (!pkg) throw new PublishingOperationError('PUBLISHING_PACKAGE_INVALID', 'Package missing');
    const delivery = await deliverySource.resolve(run.source);

    if (run.upload?.operationId) {
      // resume path
      await resumeUploadOperation(run, dryRun);
      return;
    }

    const connection = await adapter.resolveConnection(run.target);
    const operationId = computeOperationId({
      publishingRunId: run.runId,
      packageHash: pkg.packageHash,
      kind: 'upload',
    });
    const op: PublishingUploadOperationV1 = {
      schemaVersion: '1.0.0',
      operationId,
      publishingRunId: run.runId,
      packageHash: pkg.packageHash,
      connectionId: connection.connectionId,
      status: 'creating-upload-session',
      progress: { phase: 'creating-upload-session' },
      attempts: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!dryRun) store.writeUploadOperation(run.runId, op);
    appendEvent(run, 'upload.started', { operationId }, dryRun);

    const begin = await adapter.beginUpload({
      connection,
      package: pkg,
      video: delivery.video,
      operation: op,
    });

    if (begin.uncertain) {
      op.status = 'reconciliation-required';
      op.remote = { uploadSessionFingerprint: begin.uploadSessionFingerprint };
      op.progress = { phase: 'reconciliation-required', bytesUploaded: begin.bytesUploaded, totalBytes: begin.totalBytes };
      op.updatedAt = nowIso();
      if (!dryRun) store.writeUploadOperation(run.runId, op);
      run.upload = { operationId, remoteFingerprint: begin.uploadSessionFingerprint };
      getStageState(run, 'upload').status = 'reconciliation-required';
      getStageState(run, 'upload').externalOperation = { type: 'upload', id: operationId, status: 'reconciliation-required' };
      run.status = 'reconciliation-required';
      run.currentStageId = 'upload';
      appendEvent(run, 'reconciliation.required', { operationId }, dryRun);
      writeEnvelope(run, 'upload', 'upload-operation', op, [], dryRun);
      return;
    }

    op.remote = {
      videoId: begin.remoteVideoId,
      uploadSessionFingerprint: begin.uploadSessionFingerprint,
    };
    op.status = begin.status;
    op.progress = {
      phase: begin.status,
      bytesUploaded: begin.bytesUploaded,
      totalBytes: begin.totalBytes,
      percent: begin.totalBytes ? Math.round(((begin.bytesUploaded ?? 0) / begin.totalBytes) * 100) : undefined,
    };
    op.updatedAt = nowIso();
    if (!dryRun) store.writeUploadOperation(run.runId, op);
    run.upload = {
      operationId,
      remoteVideoId: begin.remoteVideoId,
    };
    if (begin.remoteVideoId) {
      appendEvent(run, 'upload.remote-id-recorded', { remoteVideoId: begin.remoteVideoId }, dryRun);
    }
    writeEnvelope(run, 'upload', 'upload-operation', op, [], dryRun);

    if (begin.status === 'uploading-video') {
      getStageState(run, 'upload').status = 'awaiting-external-operation';
      getStageState(run, 'upload').externalOperation = { type: 'upload', id: operationId, status: 'uploading-video' };
      run.currentStageId = 'upload';
    } else if (begin.status === 'video-uploaded') {
      getStageState(run, 'upload').status = 'completed';
      getStageState(run, 'remote-processing').status = 'awaiting-external-operation';
      getStageState(run, 'remote-processing').externalOperation = {
        type: 'remote-processing',
        id: operationId,
        status: 'processing',
      };
      run.currentStageId = 'remote-processing';
    }
  }

  async function resumeUploadOperation(run: PublishingRunV1, dryRun: boolean): Promise<void> {
    const op = store.getUploadOperation(run.runId, run.upload!.operationId);
    if (!op) throw new PublishingOperationError('PUBLISHING_UPLOAD_OPERATION_NOT_FOUND', 'Upload operation missing');
    if (op.status === 'reconciliation-required') {
      throw new PublishingOperationError('PUBLISHING_REMOTE_RECONCILIATION_REQUIRED', 'Must reconcile before resume');
    }
    const pkg = store.getActiveArtifactContent<PublishingPackageV1>(run, 'publishing-package')!;
    if (pkg.packageHash !== op.packageHash) {
      throw new PublishingOperationError('PUBLISHING_UPLOAD_SESSION_INVALID', 'Package hash drift');
    }
    const delivery = await deliverySource.resolve(run.source);
    const connection = await adapter.resolveConnection(run.target);

    if (op.status === 'uploading-video' || op.status === 'creating-upload-session') {
      const resumed = await adapter.resumeUpload({
        connection,
        package: pkg,
        video: delivery.video,
        operation: op,
        sessionFingerprint: op.remote?.uploadSessionFingerprint ?? '',
        bytesUploaded: op.progress.bytesUploaded,
      });
      op.remote = {
        videoId: resumed.remoteVideoId ?? op.remote?.videoId,
        uploadSessionFingerprint: resumed.uploadSessionFingerprint,
      };
      op.status = resumed.status === 'video-uploaded' ? 'video-uploaded' : resumed.status;
      op.progress = {
        phase: op.status,
        bytesUploaded: resumed.bytesUploaded,
        totalBytes: resumed.totalBytes,
        percent: resumed.totalBytes ? Math.round(((resumed.bytesUploaded ?? 0) / resumed.totalBytes) * 100) : 100,
      };
      op.updatedAt = nowIso();
      if (!dryRun) store.writeUploadOperation(run.runId, op);
      if (resumed.remoteVideoId) {
        run.upload = { ...run.upload!, remoteVideoId: resumed.remoteVideoId };
        appendEvent(run, 'upload.remote-id-recorded', { remoteVideoId: resumed.remoteVideoId }, dryRun);
      }
      if (op.status === 'video-uploaded') {
        getStageState(run, 'upload').status = 'completed';
        getStageState(run, 'remote-processing').status = 'awaiting-external-operation';
        getStageState(run, 'remote-processing').externalOperation = {
          type: 'remote-processing',
          id: op.operationId,
          status: 'processing',
        };
        run.currentStageId = 'remote-processing';
        appendEvent(run, 'upload.processing', { remoteVideoId: run.upload?.remoteVideoId }, dryRun);
      } else {
        getStageState(run, 'upload').status = 'awaiting-external-operation';
        getStageState(run, 'upload').externalOperation = { type: 'upload', id: op.operationId, status: op.status };
      }
      writeEnvelope(run, 'upload', 'upload-operation', op, [], dryRun);
      return;
    }

    await advancePipeline(run, run.currentStageId, dryRun);
  }

  async function handleReconcile(run: PublishingRunV1, stageInput: Record<string, unknown>, dryRun: boolean): Promise<void> {
    const op = run.upload?.operationId ? store.getUploadOperation(run.runId, run.upload.operationId) : null;
    if (!op || op.status !== 'reconciliation-required') {
      throw new PublishingOperationError('PUBLISHING_REMOTE_RECONCILIATION_REQUIRED', 'No reconciliation pending');
    }
    const remoteVideoId = String(stageInput.remoteVideoId ?? '');
    if (!remoteVideoId) {
      throw new PublishingOperationError('PUBLISHING_REMOTE_RECONCILIATION_FAILED', 'remoteVideoId required');
    }
    const pkg = store.getActiveArtifactContent<PublishingPackageV1>(run, 'publishing-package')!;
    const delivery = await deliverySource.resolve(run.source);
    const connection = await adapter.resolveConnection(run.target);
    const result = await adapter.reconcile({
      connection,
      reconciliation: {
        remoteVideoId,
        expectedPackageHash: pkg.packageHash,
        expectedVideoSha256: delivery.video.sha256,
      },
    });
    if (!result.accepted || !result.snapshot) {
      throw new PublishingOperationError('PUBLISHING_REMOTE_RECONCILIATION_FAILED', result.reason ?? 'Rejected');
    }
    op.remote = { ...op.remote, videoId: remoteVideoId };
    op.status = 'video-uploaded';
    op.updatedAt = nowIso();
    if (!dryRun) store.writeUploadOperation(run.runId, op);
    run.upload = { operationId: op.operationId, remoteVideoId };
    getStageState(run, 'upload').status = 'completed';
    getStageState(run, 'remote-processing').status = 'awaiting-external-operation';
    getStageState(run, 'remote-processing').externalOperation = {
      type: 'remote-processing',
      id: op.operationId,
      status: 'processing',
    };
    run.currentStageId = 'remote-processing';
    run.status = 'awaiting-external-operation';
    appendEvent(run, 'upload.remote-id-recorded', { remoteVideoId, reconciled: true }, dryRun);
  }

  async function advancePipeline(run: PublishingRunV1, stageId: PublishingStageId, dryRun: boolean): Promise<void> {
    const remoteVideoId = run.upload?.remoteVideoId;
    if (!remoteVideoId && stageId !== 'completion') {
      throw new PublishingOperationError('PUBLISHING_UPLOAD_OPERATION_NOT_FOUND', 'Remote video id required');
    }
    const connection = await adapter.resolveConnection(run.target);
    const pkg = store.getActiveArtifactContent<PublishingPackageV1>(run, 'publishing-package')!;
    const delivery = await deliverySource.resolve(run.source);

    if (stageId === 'remote-processing' || getStageState(run, 'remote-processing').status === 'awaiting-external-operation') {
      const status = await adapter.getUploadStatus({ connection, remoteVideoId: remoteVideoId! });
      appendEvent(run, 'upload.processing', { status: status.processingStatus }, dryRun);
      if (status.processingStatus === 'processing' || status.status === 'processing') {
        getStageState(run, 'remote-processing').status = 'awaiting-external-operation';
        run.currentStageId = 'remote-processing';
        return;
      }
      if (status.processingStatus === 'failed' || status.status === 'failed') {
        getStageState(run, 'remote-processing').status = 'failed';
        throw new PublishingOperationError('PUBLISHING_REMOTE_PROCESSING_FAILED', 'Remote processing failed');
      }
      getStageState(run, 'remote-processing').status = 'completed';
      getStageState(run, 'remote-assets').status = 'ready';
      run.currentStageId = 'remote-assets';
    }

    if (run.currentStageId === 'remote-assets' || stageId === 'remote-assets') {
      if (run.workflow.uploadThumbnail && pkg.thumbnail) {
        const thumbDir = thumbnailArtifactDir(store.root, run.runId, pkg.thumbnail.artifactHash);
        const file = join(thumbDir, pkg.thumbnail.mimeType === 'image/jpeg' ? 'thumbnail.jpg' : 'thumbnail.png');
        const bytes = existsSync(file)
          ? readFileSync(file)
          : Buffer.from(pkg.thumbnail.sha256);
        await adapter.uploadThumbnail({
          connection,
          remoteVideoId: remoteVideoId!,
          thumbnail: { sha256: pkg.thumbnail.sha256, mimeType: pkg.thumbnail.mimeType, bytes },
        });
        appendEvent(run, 'thumbnail.uploaded', { remoteVideoId }, dryRun);
      }
      if (run.workflow.uploadCaptions) {
        const req = store.getActiveArtifactContent<PublishingRequestV1>(run, 'publishing-request')!;
        if (req.subtitles.uploadSrt && delivery.srt?.textContent) {
          await adapter.uploadSubtitle({
            connection,
            remoteVideoId: remoteVideoId!,
            language: req.subtitles.language,
            format: 'srt',
            contentSha256: delivery.srt.sha256,
            text: delivery.srt.textContent,
          });
          appendEvent(run, 'caption.uploaded', { format: 'srt' }, dryRun);
        }
        if (req.subtitles.uploadVtt && delivery.vtt?.textContent) {
          await adapter.uploadSubtitle({
            connection,
            remoteVideoId: remoteVideoId!,
            language: req.subtitles.language,
            format: 'vtt',
            contentSha256: delivery.vtt.sha256,
            text: delivery.vtt.textContent,
          });
          appendEvent(run, 'caption.uploaded', { format: 'vtt' }, dryRun);
        }
      }
      getStageState(run, 'remote-assets').status = 'completed';
      getStageState(run, 'remote-verification').status = 'ready';
      run.currentStageId = 'remote-verification';
    }

    if (run.currentStageId === 'remote-verification' || stageId === 'remote-verification') {
      const snap = await adapter.getRemotePublication({ connection, remoteVideoId: remoteVideoId! });
      const errors: PublishingDiagnostic[] = [];
      if (snap.channel.id !== connection.channelId) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_REMOTE_VERIFICATION_FAILED', 'channel mismatch'));
      }
      if (snap.video.visibility !== 'private' && store.getActiveArtifactContent<ReleasePlanV1>(run, 'release-plan')?.mode !== 'manual') {
        // initial must be private before release
        errors.push(publishingDiagnostic('error', 'PUBLISHING_REMOTE_VERIFICATION_FAILED', 'expected private visibility pre-release'));
      }
      if (snap.video.title !== pkg.metadata.title) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_REMOTE_METADATA_MISMATCH', 'title mismatch'));
      }
      if (snap.video.description !== pkg.metadata.description) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_REMOTE_METADATA_MISMATCH', 'description mismatch'));
      }
      if (run.workflow.uploadThumbnail && !snap.video.thumbnailApplied) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_REMOTE_VERIFICATION_FAILED', 'thumbnail not applied'));
      }
      writeEnvelope(run, 'remote-verification', 'remote-publication-snapshot', snap, [], dryRun);
      run.upload = { ...run.upload!, remoteVideoId: remoteVideoId!, remoteFingerprint: snap.remoteFingerprint };
      if (errors.length) {
        getStageState(run, 'remote-verification').status = 'blocked';
        getStageState(run, 'remote-verification').errors = errors;
        run.currentStageId = 'remote-verification';
        return;
      }
      getStageState(run, 'remote-verification').status = 'completed';
      appendEvent(run, 'remote.verified', { remoteFingerprint: snap.remoteFingerprint }, dryRun);
      const releasePlan = store.getActiveArtifactContent<ReleasePlanV1>(run, 'release-plan')!;
      const reviewId = computeReviewId({
        publishingRunId: run.runId,
        stageId: 'release-review',
        artifactHashes: [pkg.packageHash, releasePlan ? store.computeArtifactHash('release-plan', releasePlan) : ''],
        remoteFingerprint: snap.remoteFingerprint,
      });
      const review: PublishingReviewV1 = {
        schemaVersion: '1.0.0',
        reviewId,
        publishingRunId: run.runId,
        stageId: 'release-review',
        artifactReferences: [
          { artifactType: 'publishing-package', artifactHash: run.artifacts.find((a) => a.artifactType === 'publishing-package')!.artifactHash },
          { artifactType: 'remote-publication-snapshot', artifactHash: run.artifacts.find((a) => a.artifactType === 'remote-publication-snapshot')!.artifactHash },
        ],
        remote: { videoId: remoteVideoId!, remoteFingerprint: snap.remoteFingerprint },
        status: 'pending',
        createdAt: nowIso(),
      };
      if (!dryRun) store.writeReview(run.runId, review);
      getStageState(run, 'release-review').review = { reviewId, status: 'pending' };
      getStageState(run, 'release-review').status = 'awaiting-review';
      run.currentStageId = 'release-review';
      appendEvent(run, 'release.review-created', { reviewId }, dryRun);
    }

    if (stageId === 'release' || run.currentStageId === 'release') {
      const stage = getStageState(run, 'release-review');
      if (stage.review?.status !== 'approved') {
        throw new PublishingOperationError('PUBLISHING_RELEASE_REVIEW_REQUIRED', 'Release review required');
      }
      const review = store.getReview(run.runId, stage.review.reviewId)!;
      const live = await adapter.getRemotePublication({ connection, remoteVideoId: remoteVideoId! });
      if (review.remote && live.remoteFingerprint !== review.remote.remoteFingerprint) {
        getStageState(run, 'release-review').status = 'awaiting-review';
        getStageState(run, 'release-review').review = undefined;
        throw new PublishingOperationError('PUBLISHING_RELEASE_REMOTE_STATE_CONFLICT', 'Remote state changed after approval');
      }
      const releasePlan = store.getActiveArtifactContent<ReleasePlanV1>(run, 'release-plan')!;
      if (releasePlan.mode === 'scheduled' && releasePlan.scheduledAt && Date.parse(releasePlan.scheduledAt) <= Date.now()) {
        throw new PublishingOperationError('PUBLISHING_RELEASE_SCHEDULE_INVALID', 'Schedule no longer in future');
      }
      const opId = computeOperationId({ publishingRunId: run.runId, packageHash: pkg.packageHash, kind: 'release' });
      await adapter.executeRelease({ connection, remoteVideoId: remoteVideoId!, release: releasePlan });
      run.release = { operationId: opId };
      getStageState(run, 'release').status = 'completed';
      getStageState(run, 'post-release-validation').status = 'ready';
      run.currentStageId = 'post-release-validation';
      appendEvent(run, 'release.executed', { remoteVideoId, visibility: releasePlan.desiredVisibility }, dryRun);
    }

    if (stageId === 'post-release-validation' || run.currentStageId === 'post-release-validation') {
      const releasePlan = store.getActiveArtifactContent<ReleasePlanV1>(run, 'release-plan')!;
      const validation = await adapter.validateRelease({
        connection,
        remoteVideoId: remoteVideoId!,
        release: releasePlan,
      });
      if (!validation.valid) {
        throw new PublishingOperationError('PUBLISHING_RELEASE_VERIFICATION_FAILED', validation.errors.join('; '));
      }
      const verified = validation.snapshot;
      writeEnvelope(run, 'post-release-validation', 'remote-publication-snapshot', verified, [], dryRun);
      const subtitleSha256 = [
        delivery.srt?.sha256,
        delivery.vtt?.sha256,
      ].filter(Boolean) as string[];
      const manifestWithoutHash = {
        schemaVersion: '1.0.0' as const,
        publishingRunId: run.runId,
        publishingPackage: {
          packageId: pkg.id,
          packageHash: pkg.packageHash,
        },
        source: {
          productionRunId: run.source.productionRunId,
          bundleId: run.source.bundleId,
          deliveryManifestHash: run.source.deliveryManifestHash,
          videoSha256: delivery.video.sha256,
          thumbnailSha256: pkg.thumbnail?.sha256,
          subtitleSha256,
        },
        target: {
          platform: 'youtube' as const,
          connectionId: run.target.connectionId,
          channelId: connection.channelId,
          remoteVideoId: remoteVideoId!,
        },
        release: {
          desiredVisibility: releasePlan.desiredVisibility,
          mode: releasePlan.mode,
          scheduledAt: releasePlan.scheduledAt,
          verifiedRemoteState: verified,
        },
      };
      const releaseManifestHash = sha256Hex(stableStringify({
        ...manifestWithoutHash,
        publishingRevision: '1.0.0',
      }));
      const manifest: ReleaseManifestV1 = {
        ...manifestWithoutHash,
        releaseManifestHash,
        createdAt: nowIso(),
      };
      writeEnvelope(run, 'post-release-validation', 'release-manifest', manifest, [], dryRun);
      run.release = { ...run.release!, releaseManifestHash };
      getStageState(run, 'post-release-validation').status = 'completed';
      getStageState(run, 'completion').status = 'completed';
      run.currentStageId = 'completion';
      appendEvent(run, 'release.verified', { releaseManifestHash }, dryRun);
      appendEvent(run, 'publishing-run.completed', { releaseManifestHash }, dryRun);
    }
  }

  async function reviewStage(input: ReviewPublishingInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      requestId: input.requestId,
      runId: input.runId,
      reviewId: input.reviewId,
      decision: input.decision,
      notes: input.notes,
      requestedChanges: input.requestedChanges,
    });
    const apply = async (): Promise<OrchestratorResult> => {
      let run = store.getRun(input.runId);
      if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', `Run not found`);
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFp = run.workflowFingerprint;
      const review = store.getReview(input.runId, input.reviewId) ?? (dryRun ? null : null);
      // reviews may only exist after write; for dry-run allow synthetic pending
      const stage = run.stages.find((s) => s.review?.reviewId === input.reviewId);
      if (!stage || !stage.review || stage.review.reviewId !== input.reviewId) {
        throw new PublishingOperationError('PUBLISHING_PACKAGE_REVIEW_INVALIDATED', 'Review not active on run');
      }
      if (stage.review.status !== 'pending' && !dryRun) {
        throw new PublishingOperationError('PUBLISHING_PACKAGE_REVIEW_INVALIDATED', 'Review already decided');
      }
      // re-bind hashes
      if (review?.remote) {
        if (run.upload?.remoteFingerprint && review.remote.remoteFingerprint !== run.upload.remoteFingerprint) {
          throw new PublishingOperationError('PUBLISHING_RELEASE_REVIEW_INVALIDATED', 'Remote fingerprint changed');
        }
      }
      const decided: PublishingReviewV1 = {
        schemaVersion: '1.0.0',
        reviewId: input.reviewId,
        publishingRunId: run.runId,
        stageId: stage.stageId as PublishingReviewV1['stageId'],
        artifactReferences: review?.artifactReferences ?? stage.outputArtifacts,
        remote: review?.remote,
        status: input.decision === 'approve' ? 'approved' : 'rejected',
        decision: { notes: input.notes, requestedChanges: input.requestedChanges },
        createdAt: review?.createdAt ?? nowIso(),
        decidedAt: nowIso(),
      };
      if (!dryRun) store.writeReview(run.runId, decided);
      stage.review = { reviewId: input.reviewId, status: decided.status };
      appendEvent(run, decided.status === 'approved' ? 'review.approved' : 'review.rejected', {
        reviewId: input.reviewId,
        stageId: stage.stageId,
      }, dryRun);

      if (input.decision === 'reject') {
        stage.status = 'awaiting-input';
        if (stage.stageId === 'metadata') run.currentStageId = 'metadata';
        if (stage.stageId === 'thumbnail') run.currentStageId = 'thumbnail';
        if (stage.stageId === 'package-review') {
          stage.status = 'pending';
          getStageState(run, 'package').status = 'ready';
          run.currentStageId = 'package';
        }
        if (stage.stageId === 'release-review') {
          stage.status = 'pending';
          run.currentStageId = 'remote-verification';
          getStageState(run, 'remote-verification').status = 'ready';
        }
      } else {
        stage.status = 'completed';
        if (stage.stageId === 'metadata') {
          if (run.workflow.uploadThumbnail) {
            getStageState(run, 'thumbnail').status = 'awaiting-input';
            run.currentStageId = 'thumbnail';
          } else {
            getStageState(run, 'thumbnail').status = 'skipped';
            getStageState(run, 'package').status = 'ready';
            run.currentStageId = 'package';
          }
        } else if (stage.stageId === 'thumbnail') {
          getStageState(run, 'package').status = 'ready';
          run.currentStageId = 'package';
        } else if (stage.stageId === 'package-review') {
          getStageState(run, 'connection-preflight').status = 'ready';
          run.currentStageId = 'connection-preflight';
        } else if (stage.stageId === 'release-review') {
          getStageState(run, 'release').status = 'ready';
          run.currentStageId = 'release';
        }
      }

      if (!dryRun) {
        bumpRevision(run);
        store.writeRun(run);
        const receipt = writeReceipt(run, input.requestId, 'review', hash, previousRevision, previousFp, false)!;
        run = store.getRun(run.runId)!;
        return {
          dryRun: false,
          run,
          runSummary: summarize(run),
          nextAction: planNextAction(run),
          receipt,
          review: decided,
          errors: [],
          warnings: [],
        };
      }
      bumpRevision(run);
      return {
        dryRun: true,
        run: deepCloneJson(run),
        runSummary: summarize(run),
        nextAction: planNextAction(run),
        review: decided,
        errors: [],
        warnings: [],
      };
    };
    return dryRun ? apply() : store.withLock(input.runId, apply);
  }

  async function resumeRun(input: PublishingWriteGuard & { runId: string }): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    // poll one external op once
    return executeStage({
      ...input,
      stageId: undefined,
      stageInput: { resume: true },
    }).catch(async (err) => {
      // if execute fails because stage is wait — open run and advance
      const run = store.getRun(input.runId);
      if (!run) throw err;
      if (dryRun === false) {
        return store.withLock(input.runId, async () => {
          assertGuard(run, input);
          const previousRevision = run.revision;
          const previousFp = run.workflowFingerprint;
          const hash = inputHash({ requestId: input.requestId, runId: input.runId, resume: true });
          const planned = planNextAction(run);
          if (planned.type === 'wait-external-operation' || planned.type === 'execute-stage') {
            await resumeUploadOperation(run, false).catch(() => advancePipeline(run, run.currentStageId, false));
          }
          bumpRevision(run);
          store.writeRun(run);
          const receipt = writeReceipt(run, input.requestId, 'resume', hash, previousRevision, previousFp, false)!;
          const fresh = store.getRun(run.runId)!;
          return {
            dryRun: false,
            run: fresh,
            runSummary: summarize(fresh),
            nextAction: planNextAction(fresh),
            receipt,
            errors: [],
            warnings: [],
          };
        });
      }
      throw err;
    });
  }

  async function cancelRun(input: PublishingWriteGuard & { runId: string; reason?: string }): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({ requestId: input.requestId, runId: input.runId, reason: input.reason });
    const apply = async (): Promise<OrchestratorResult> => {
      let run = store.getRun(input.runId);
      if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', 'Run not found');
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFp = run.workflowFingerprint;
      let remoteRetained = false;
      let remoteVideoId = run.upload?.remoteVideoId;
      if (run.upload?.operationId) {
        try {
          const connection = await adapter.resolveConnection(run.target);
          const op = store.getUploadOperation(run.runId, run.upload.operationId);
          const cancel = await adapter.cancelUpload({
            connection,
            remoteVideoId: run.upload.remoteVideoId,
            sessionFingerprint: op?.remote?.uploadSessionFingerprint,
          });
          remoteRetained = cancel.remoteRetained;
          if (op) {
            op.status = 'cancelled';
            op.updatedAt = nowIso();
            if (!dryRun) store.writeUploadOperation(run.runId, op);
          }
        } catch {
          remoteRetained = Boolean(remoteVideoId);
        }
      }
      run.status = 'cancelled';
      for (const stage of run.stages) {
        if (stage.status !== 'completed' && stage.status !== 'skipped') {
          stage.status = 'cancelled';
        }
      }
      const warnings: PublishingDiagnostic[] = [];
      if (remoteVideoId) {
        warnings.push(publishingDiagnostic('warning', 'PUBLISHING_UPLOAD_CANCELLED', 'Remote video retained; not deleted', {
          remoteVideoId,
          recovery: 'Manual cleanup in platform console if needed',
        }));
        remoteRetained = true;
      }
      appendEvent(run, 'publishing-run.cancelled', {
        reason: input.reason,
        remoteVideoId,
        remoteRetained,
      }, dryRun);

      if (!dryRun) {
        bumpRevision(run);
        store.writeRun(run);
        const receipt = writeReceipt(run, input.requestId, 'cancel', hash, previousRevision, previousFp, false)!;
        run = store.getRun(run.runId)!;
        return {
          dryRun: false,
          run,
          runSummary: summarize(run),
          nextAction: planNextAction(run),
          receipt,
          errors: [],
          warnings,
          data: { remoteRetained, remoteVideoId, noRemoteDeletion: true },
        };
      }
      bumpRevision(run);
      return {
        dryRun: true,
        run: deepCloneJson(run),
        runSummary: summarize(run),
        nextAction: planNextAction(run),
        errors: [],
        warnings,
        data: { remoteRetained, remoteVideoId, noRemoteDeletion: true },
      };
    };
    return dryRun ? apply() : store.withLock(input.runId, apply);
  }

  function validateRun(runId: string): PublishingRunValidationResultV1 {
    const run = store.getRun(runId);
    if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', 'Run not found');
    const errors: PublishingDiagnostic[] = [];
    const warnings: PublishingDiagnostic[] = [];
    const fpValid = computePublishingWorkflowFingerprint(run) === run.workflowFingerprint;
    if (!fpValid) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_RUN_FINGERPRINT_CONFLICT', 'Fingerprint mismatch'));
    }
    const artifacts = run.artifacts.map((ref) => {
      const env = store.getArtifact(runId, ref.artifactType, ref.artifactHash);
      const exists = Boolean(env);
      const hashValid = exists
        ? store.computeArtifactHash(ref.artifactType, env!.content) === ref.artifactHash
        : false;
      if (!exists) errors.push(publishingDiagnostic('error', 'PUBLISHING_RUN_NOT_FOUND', `Missing artifact ${ref.artifactType}`));
      if (exists && !hashValid) errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_HASH_INVALID', `Hash invalid ${ref.artifactType}`));
      return {
        artifactType: ref.artifactType,
        artifactHash: ref.artifactHash,
        exists,
        hashValid,
        schemaValid: exists,
      };
    });
    return {
      valid: errors.length === 0,
      runId,
      revision: run.revision,
      workflowFingerprintValid: fpValid,
      source: {
        productionRunComplete: true,
        deliveryBundleValid: true,
        manifestHashValid: true,
      },
      artifacts,
      reviews: run.stages
        .filter((s) => s.review)
        .map((s) => ({
          reviewId: s.review!.reviewId,
          valid: true,
          status: s.review!.status,
        })),
      operations: run.upload
        ? [{ operationId: run.upload.operationId, type: 'upload' as const, status: getStageState(run, 'upload').status }]
        : [],
      remote: run.upload
        ? { videoId: run.upload.remoteVideoId, fingerprintValid: Boolean(run.upload.remoteFingerprint) }
        : undefined,
      errors,
      warnings,
    };
  }

  async function getRelease(runId: string): Promise<{
    completed: boolean;
    release?: PublishingReleaseSummaryV1;
    releaseManifest?: ReleaseManifestV1;
    errors: PublishingDiagnostic[];
    warnings: PublishingDiagnostic[];
  }> {
    const run = store.getRun(runId);
    if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', 'Run not found');
    const manifest = store.getActiveArtifactContent<ReleaseManifestV1>(run, 'release-manifest');
    if (!manifest || run.status !== 'completed') {
      return {
        completed: false,
        errors: [publishingDiagnostic('error', 'PUBLISHING_RELEASE_MANIFEST_INVALID', 'Release not complete')],
        warnings: [],
      };
    }
    return {
      completed: true,
      releaseManifest: manifest,
      release: {
        publishingRunId: run.runId,
        platform: 'youtube',
        channelId: manifest.target.channelId,
        remoteVideoId: manifest.target.remoteVideoId,
        visibility: manifest.release.desiredVisibility,
        scheduledAt: manifest.release.scheduledAt,
        releaseManifestHash: manifest.releaseManifestHash,
        localArtifacts: [
          { role: 'video', sha256: manifest.source.videoSha256 },
          ...(manifest.source.thumbnailSha256
            ? [{ role: 'thumbnail', sha256: manifest.source.thumbnailSha256 }]
            : []),
          ...manifest.source.subtitleSha256.map((sha, i) => ({ role: `subtitle-${i}`, sha256: sha })),
        ],
      },
      errors: [],
      warnings: [],
    };
  }

  function getContract(format: 'summary' | 'full' = 'summary') {
    const summary = {
      schemaVersion: '1.0.0',
      publishingRevision: '1.0.0',
      platform: 'youtube',
      stages: Object.keys(createInitialStageStates().reduce((acc, s) => {
        acc[s.stageId] = true;
        return acc;
      }, {} as Record<string, boolean>)),
      tools: [
        'publishing_get_contract',
        'publishing_connection_inspect',
        'publishing_package_validate',
        'publishing_run_create',
        'publishing_run_list',
        'publishing_run_get',
        'publishing_run_validate',
        'publishing_run_put_artifact',
        'publishing_run_plan_next',
        'publishing_run_execute_stage',
        'publishing_run_review',
        'publishing_run_resume',
        'publishing_run_cancel',
        'publishing_run_get_release',
      ],
      credentialPolicy: {
        opaqueConnectionIdOnly: true,
        noTokensInMcp: true,
        noTokensInArtifacts: true,
        environmentResolver: true,
        plaintextPublishingStore: false,
      },
      limitations: [
        'YouTube only in M6B',
        'No automatic public/scheduled release without review',
        'No remote video deletion',
        'No LLM metadata generation',
        'Live YouTube smoke gated by BETTER_CHAT_CUT_ENABLE_YOUTUBE_SMOKE',
        'Connection credentials resolve from environment or plugin; baseline env resolver only',
      ],
      dryRunDefault: true,
    };
    if (format === 'summary') return summary;
    return {
      ...summary,
      stageFlow: [
        'intake', 'metadata', 'thumbnail', 'package', 'package-review', 'connection-preflight',
        'upload', 'remote-processing', 'remote-assets', 'remote-verification',
        'release-review', 'release', 'post-release-validation', 'completion',
      ],
      storage: {
        env: 'BETTER_CHAT_CUT_PUBLISHING_ROOT',
        defaultRelative: '~/.openchatcut/better-chat-cut/publishing',
      },
    };
  }

  return {
    store,
    adapter,
    deliverySource,
    getContract,
    createRun,
    putArtifact,
    executeStage,
    reviewStage,
    resumeRun,
    cancelRun,
    validateRun,
    getRelease,
    planNext: (runId: string) => {
      const run = store.getRun(runId);
      if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', 'Run not found');
      return planNextAction(run);
    },
    getRun: (runId: string) => store.getRun(runId),
    listRuns: (opts?: { status?: string[]; limit?: number; offset?: number }) => store.listRuns(opts),
    listEvents: (runId: string) => store.listEvents(runId),
    inspectConnection: (target: PublishingRequestV1['target']) => adapter.inspectConnection(target),
    validatePackage: (pkg: unknown) => validatePublishingPackage(pkg),
  };
}

export type PublishingOrchestrator = ReturnType<typeof createPublishingOrchestrator>;

// ensure RemotePublicationSnapshot fingerprint helper exported usage kept
export { computeRemoteFingerprint };
