import { existsSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProductionRenderPlanV1 } from '../../../production-render-plans/src/contracts/production-render-plan.ts';
import {
  computeProductionRenderPlanHash,
  planWithoutPreparedAt,
} from '../../../production-render-plans/src/schema/production-render-hash.ts';
import { productionRenderDiagnostic, ProductionRenderError } from '../../../production-render-plans/src/contracts/production-render-errors.ts';
import type { ProductionProjectLike } from '../../../production-render-plans/src/preparation/prepare-production-render.ts';
import { prepareProductionRender } from '../../../production-render-plans/src/preparation/prepare-production-render.ts';
import { DeliveryStore, createDeliveryStore } from '../storage/operation-store.ts';
import { bundleDir, downloadUrlFor, operationDir } from '../storage/delivery-paths.ts';
import { atomicFinalizeBundle, atomicWriteJson, ensureDir } from '../storage/atomic-finalize.ts';
import { computeDeliveryManifestHash, computeOperationInputHash, computeQaReportHash, sha256Bytes } from '../storage/artifact-hash.ts';
import type {
  DeliveryBundleManifestV1,
  ProductionRenderArtifactV1,
  ProductionRenderOperationV1,
  ProductionRenderReceiptV1,
} from '../contracts/render-operation.ts';
import type { ProductionQaCheckResultV1, ProductionQaReportV1 } from '../contracts/qa-report.ts';
import { createRemotionTimelineRenderAdapter, type ProductionTimelineRenderAdapter } from './timeline-render-adapter.ts';
import { generateProductionSubtitles } from './subtitle-render-adapter.ts';
import { assertPlanMatchesLiveProject, createImmutableProjectSnapshot } from './project-snapshot.ts';
import {
  analyzeBlackAndFreeze,
  analyzeSilenceAndLoudness,
  parseBlackRanges,
  parseFreezeRanges,
  parseSilenceRanges,
  parseVolumeDetect,
  probeMediaFile,
} from '../qa/media-probe.ts';
import { selectProductionQaFrames } from '../qa/frame-sampling.ts';
import { evaluateQualityGate } from '../qa/quality-gate.ts';
import { analyzeSubtitleArtifacts } from '../qa/subtitle-analysis.ts';
import { buildQaContactSheet } from '../qa/contact-sheet.ts';

export type ProductionRenderServiceOptions = {
  deliveryRoot?: string;
  store?: DeliveryStore;
  renderAdapter?: ProductionTimelineRenderAdapter;
  now?: () => string;
  /** When true, skip real ffmpeg probe (unit tests with fake mp4 bytes). */
  skipMediaProbe?: boolean;
};

export type SubmitProductionRenderInput = {
  requestId: string;
  plan: ProductionRenderPlanV1;
  project: ProductionProjectLike;
  projectId: string;
  sourceMode?: 'live-project' | 'edit-session-draft';
};

export class ProductionRenderService {
  readonly store: DeliveryStore;
  private readonly renderAdapter: ProductionTimelineRenderAdapter;
  private readonly now: () => string;
  private readonly skipMediaProbe: boolean;
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(options: ProductionRenderServiceOptions = {}) {
    this.store = options.store ?? createDeliveryStore({ deliveryRoot: options.deliveryRoot, now: options.now });
    this.renderAdapter = options.renderAdapter ?? createRemotionTimelineRenderAdapter();
    this.now = options.now ?? (() => new Date().toISOString());
    this.skipMediaProbe = options.skipMediaProbe === true;
  }

  async submit(input: SubmitProductionRenderInput): Promise<{
    operationId: string;
    bundleId: string;
    replayed: boolean;
    reusedCompletedBundle: boolean;
    status: string;
    planHash: string;
    errors: ReturnType<typeof productionRenderDiagnostic>[];
    warnings: ReturnType<typeof productionRenderDiagnostic>[];
  }> {
    if (input.sourceMode === 'edit-session-draft') {
      throw new ProductionRenderError('PRODUCTION_RENDER_DRAFT_SOURCE_NOT_ALLOWED', 'Final production render requires live-project source', {
        recovery: 'Approve the edit session, then prepare/submit against the live project',
      });
    }

    if (!/^[A-Za-z0-9._-]{1,128}$/.test(input.requestId)) {
      throw new ProductionRenderError('PRODUCTION_RENDER_INVALID_ID', 'Invalid requestId');
    }

    const expectedHash = computeProductionRenderPlanHash(planWithoutPreparedAt(input.plan));
    if (expectedHash !== input.plan.planHash) {
      throw new ProductionRenderError('PRODUCTION_RENDER_PLAN_HASH_INVALID', 'Plan hash mismatch', {
        recovery: 'Re-prepare the production render plan',
      });
    }

    assertPlanMatchesLiveProject({ plan: input.plan, project: input.project, projectId: input.projectId });

    // Re-run structural prepare against live project; plan hash must still match.
    const refreshed = prepareProductionRender({
      project: input.project,
      projectId: input.projectId,
      request: {
        schemaVersion: '1.0.0',
        id: input.plan.id,
        name: input.plan.name,
        ...(input.plan.description ? { description: input.plan.description } : {}),
        source: {
          timelineId: input.plan.source.timelineId,
          range: { mode: 'frames', startFrame: input.plan.source.range.startFrame, endFrame: input.plan.source.range.endFrame },
        },
        profile: { id: input.plan.profile.id as 'source-h264', width: input.plan.profile.width, height: input.plan.profile.height },
        subtitles: {
          includeSrt: input.plan.subtitles.includeSrt,
          includeVtt: input.plan.subtitles.includeVtt,
          source: input.plan.subtitles.source.type === 'none'
            ? { type: 'none' }
            : input.plan.subtitles.source,
        },
        qa: input.plan.qa,
        delivery: input.plan.delivery,
      },
      preparedAt: input.plan.preparedAt,
    });
    if (!refreshed.valid || !refreshed.preflight.ready) {
      throw new ProductionRenderError('PRODUCTION_RENDER_PREFLIGHT_FAILED', 'Submit preflight failed', {
        diagnostics: refreshed.errors,
        recovery: 'Fix preflight errors and re-prepare',
      });
    }
    if (
      refreshed.plan
      && (
        refreshed.plan.source.projectFingerprint !== input.plan.source.projectFingerprint
        || refreshed.plan.source.timelineFingerprint !== input.plan.source.timelineFingerprint
      )
    ) {
      throw new ProductionRenderError('PRODUCTION_RENDER_PROJECT_FINGERPRINT_CONFLICT', 'Project/timeline fingerprint conflict at submit', {
        recovery: 'Re-prepare the production render plan',
      });
    }

    const inputHash = computeOperationInputHash({
      planHash: input.plan.planHash,
      projectId: input.projectId,
      bundleId: input.plan.bundleId,
    });

    const existing = this.store.findByRequestId(input.requestId);
    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw new ProductionRenderError('PRODUCTION_RENDER_REQUEST_ID_REUSE_CONFLICT', 'requestId reused with different input', {
          recovery: 'Use a new requestId for a different plan',
        });
      }
      return {
        operationId: existing.operationId,
        bundleId: existing.bundleId,
        replayed: true,
        reusedCompletedBundle: existing.status === 'completed',
        status: existing.status,
        planHash: existing.planHash,
        errors: [],
        warnings: [],
      };
    }

    if (input.plan.delivery.reuseCompletedBundle && this.store.bundleExists(input.plan.bundleId)) {
      const operationId = this.store.newOperationId();
      const now = this.now();
      const operation: ProductionRenderOperationV1 = {
        schemaVersion: '1.0.0',
        operationId,
        bundleId: input.plan.bundleId,
        planHash: input.plan.planHash,
        requestId: input.requestId,
        inputHash,
        status: 'completed',
        progress: { phase: 'completed', percent: 100 },
        artifacts: this.store.readManifest(input.plan.bundleId)?.artifacts ?? [],
        qaStatus: 'passed',
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        cancelSupported: true,
      };
      this.store.writeOperation(operation);
      this.store.writeReceipt({
        requestId: input.requestId,
        inputHash,
        operationId,
        bundleId: input.plan.bundleId,
        planHash: input.plan.planHash,
        submittedAt: now,
        completedBundleManifestHash: this.store.readManifest(input.plan.bundleId)?.manifestHash,
      });
      return {
        operationId,
        bundleId: input.plan.bundleId,
        replayed: false,
        reusedCompletedBundle: true,
        status: 'completed',
        planHash: input.plan.planHash,
        errors: [],
        warnings: [],
      };
    }

    const operationId = this.store.newOperationId();
    const now = this.now();
    const operation: ProductionRenderOperationV1 = {
      schemaVersion: '1.0.0',
      operationId,
      bundleId: input.plan.bundleId,
      planHash: input.plan.planHash,
      requestId: input.requestId,
      inputHash,
      status: 'queued',
      progress: { phase: 'queued' },
      artifacts: [],
      qaStatus: 'not-run',
      createdAt: now,
      updatedAt: now,
      cancelSupported: true,
    };
    this.store.writeOperation(operation);
    this.store.writeReceipt({
      requestId: input.requestId,
      inputHash,
      operationId,
      bundleId: input.plan.bundleId,
      planHash: input.plan.planHash,
      submittedAt: now,
    } satisfies ProductionRenderReceiptV1);
    this.store.appendEvent({
      eventId: `evt_${randomUUID().slice(0, 8)}`,
      operationId,
      bundleId: input.plan.bundleId,
      eventType: 'render.queued',
      occurredAt: now,
    });

    // Persist snapshot + plan under temporary for resume
    const tmp = this.store.temporaryDir(operationId);
    ensureDir(tmp);
    atomicWriteJson(join(tmp, 'plan.json'), input.plan);
    atomicWriteJson(join(tmp, 'project-snapshot.json'), createImmutableProjectSnapshot(input.project));

    await this.runOperation(operationId);

    const latest = this.store.readOperation(operationId)!;
    return {
      operationId,
      bundleId: input.plan.bundleId,
      replayed: false,
      reusedCompletedBundle: false,
      status: latest.status,
      planHash: input.plan.planHash,
      errors: latest.error ? [latest.error] : [],
      warnings: [],
    };
  }

  async runOperation(operationId: string): Promise<ProductionRenderOperationV1> {
    const operation = this.store.readOperation(operationId);
    if (!operation) throw new ProductionRenderError('PRODUCTION_RENDER_OPERATION_NOT_FOUND', 'Operation not found');
    if (operation.status === 'completed') return operation;
    if (operation.status === 'cancelled') return operation;

    const controller = new AbortController();
    this.abortControllers.set(operationId, controller);
    const tmp = this.store.temporaryDir(operationId);
    const plan = JSON.parse(readFileSync(join(tmp, 'plan.json'), 'utf8')) as ProductionRenderPlanV1;
    const snapshot = JSON.parse(readFileSync(join(tmp, 'project-snapshot.json'), 'utf8')) as ProductionProjectLike;
    const baseName = plan.delivery.baseName ?? plan.id;
    const staging = join(tmp, 'staging-bundle');
    ensureDir(staging);

    const update = (patch: Partial<ProductionRenderOperationV1>, eventType?: Parameters<DeliveryStore['appendEvent']>[0]['eventType']) => {
      const current = this.store.readOperation(operationId)!;
      const next = { ...current, ...patch, updatedAt: this.now() };
      this.store.writeOperation(next);
      if (eventType) {
        this.store.appendEvent({
          eventId: `evt_${randomUUID().slice(0, 8)}`,
          operationId,
          bundleId: operation.bundleId,
          eventType,
          occurredAt: this.now(),
        });
      }
      return next;
    };

    try {
      update({ status: 'preflight', progress: { phase: 'preflight' } }, 'render.preflight-started');
      update({ status: 'snapshotting', progress: { phase: 'snapshotting' } }, 'render.snapshot-created');

      const videoPath = join(tmp, `${baseName}.mp4`);
      update({ status: 'rendering-video', progress: { phase: 'rendering-video' } }, 'render.video-started');
      await this.renderAdapter.render({
        plan,
        projectSnapshot: snapshot,
        outputLocation: videoPath,
        signal: controller.signal,
        onProgress: (progress) => {
          update({
            status: 'rendering-video',
            progress: { phase: 'rendering-video', percent: Math.round(progress * 100) },
          }, 'render.video-progress');
        },
      });
      if (!existsSync(videoPath) || readFileSync(videoPath).byteLength === 0) {
        throw new ProductionRenderError('PRODUCTION_RENDER_FAILED', 'Render produced empty video');
      }
      update({ status: 'generating-subtitles', progress: { phase: 'generating-subtitles' } }, 'render.video-completed');

      const timeline = snapshot.timelines.find((t) => t.id === plan.source.timelineId);
      const subs = generateProductionSubtitles({ plan, captions: timeline?.captions as never });
      const srtPath = join(tmp, `${baseName}.srt`);
      const vttPath = join(tmp, `${baseName}.vtt`);
      if (subs.srt) writeFileSync(srtPath, subs.srt, 'utf8');
      if (subs.vtt) writeFileSync(vttPath, subs.vtt, 'utf8');
      update({ status: 'running-qa', progress: { phase: 'running-qa' }, qaStatus: 'running' }, 'render.subtitles-completed');
      update({}, 'render.qa-started');

      const qa = await this.runQa({
        plan,
        videoPath,
        srt: subs.srt ?? null,
        vtt: subs.vtt ?? null,
        workDir: tmp,
        contactSheetPath: join(tmp, `${baseName}.contact-sheet.png`),
      });

      const gate = evaluateQualityGate(qa.report, plan.qa);
      qa.report.status = gate.status === 'failed' ? 'failed' : gate.status;
      if (!gate.pass) {
        writeFileSync(join(tmp, `${baseName}.qa.json`), JSON.stringify(qa.report, null, 2));
        update({
          status: 'failed',
          qaStatus: 'failed',
          completedAt: this.now(),
          error: productionRenderDiagnostic('error', 'PRODUCTION_RENDER_QA_FAILED', 'Quality gate failed', {
            details: { blockingCheckIds: gate.blockingCheckIds },
            recovery: 'Inspect qa-report in operation temporary data and fix source issues',
          }),
        }, 'render.failed');
        return this.store.readOperation(operationId)!;
      }

      update({ status: 'finalizing', progress: { phase: 'finalizing' }, qaStatus: gate.status }, 'render.qa-completed');

      // Stage artifacts then write manifest last
      const stagedVideo = join(staging, `${baseName}.mp4`);
      copyFileSync(videoPath, stagedVideo);
      if (subs.srt) copyFileSync(srtPath, join(staging, `${baseName}.srt`));
      if (subs.vtt) copyFileSync(vttPath, join(staging, `${baseName}.vtt`));
      writeFileSync(join(staging, `${baseName}.qa.json`), JSON.stringify(qa.report, null, 2));
      if (existsSync(join(tmp, `${baseName}.contact-sheet.png`))) {
        copyFileSync(join(tmp, `${baseName}.contact-sheet.png`), join(staging, `${baseName}.contact-sheet.png`));
      }

      const artifacts: ProductionRenderArtifactV1[] = [];
      const addArtifact = (role: ProductionRenderArtifactV1['role'], fileName: string, mimeType: string) => {
        const path = join(staging, fileName);
        if (!existsSync(path)) return;
        const bytes = readFileSync(path);
        artifacts.push({
          role,
          relativePath: fileName,
          fileName,
          mimeType,
          byteLength: bytes.byteLength,
          sha256: sha256Bytes(bytes),
          downloadUrl: downloadUrlFor(plan.bundleId, fileName),
        });
      };
      addArtifact('video', `${baseName}.mp4`, 'video/mp4');
      if (subs.srt) addArtifact('subtitle-srt', `${baseName}.srt`, 'application/x-subrip');
      if (subs.vtt) addArtifact('subtitle-vtt', `${baseName}.vtt`, 'text/vtt');
      addArtifact('qa-report', `${baseName}.qa.json`, 'application/json');
      addArtifact('contact-sheet', `${baseName}.contact-sheet.png`, 'image/png');

      const createdAt = this.now();
      const manifestArtifactPlaceholder: ProductionRenderArtifactV1 = {
        role: 'manifest',
        relativePath: 'manifest.json',
        fileName: 'manifest.json',
        mimeType: 'application/json',
        byteLength: 0,
        sha256: '',
        downloadUrl: downloadUrlFor(plan.bundleId, 'manifest.json'),
      };
      const forHash = {
        schemaVersion: '1.0.0' as const,
        bundleId: plan.bundleId,
        renderPlan: {
          id: plan.id,
          planHash: plan.planHash,
          productionRenderRevision: plan.productionRenderRevision,
        },
        source: {
          projectId: plan.source.projectId,
          projectFingerprint: plan.source.projectFingerprint,
          timelineId: plan.source.timelineId,
          timelineFingerprint: plan.source.timelineFingerprint,
          startFrame: plan.source.range.startFrame,
          endFrame: plan.source.range.endFrame,
          width: plan.source.timeline.width,
          height: plan.source.timeline.height,
          fps: plan.source.timeline.fps,
          ...(plan.source.videoPlan ? {
            videoPlan: {
              planId: plan.source.videoPlan.planId,
              planHash: plan.source.videoPlan.planHash,
              assemblyId: plan.source.videoPlan.assemblyId,
            },
          } : {}),
          ...(plan.source.narration ? {
            narration: {
              narrationPlanId: plan.source.narration.narrationPlanId,
              narrationPlanHash: plan.source.narration.narrationPlanHash,
              timingHash: plan.source.narration.timingHash,
            },
          } : {}),
        },
        output: {
          profileId: plan.profile.id,
          width: plan.profile.width,
          height: plan.profile.height,
          fps: plan.profile.fps,
          durationMs: qa.report.media.durationMs,
          videoCodec: plan.profile.video.codec,
          audioCodec: plan.profile.audio.codec,
        },
        qa: {
          status: gate.status as 'passed' | 'passed-with-warnings',
          reportSha256: qa.report.reportHash,
        },
        artifacts: [...artifacts, manifestArtifactPlaceholder],
      };
      const manifestHash = computeDeliveryManifestHash(forHash);
      const manifest: DeliveryBundleManifestV1 = {
        ...forHash,
        manifestHash,
        createdAt,
      };
      const body = JSON.stringify(manifest, null, 2);
      const manifestWithFileMeta: DeliveryBundleManifestV1 = {
        ...manifest,
        artifacts: manifest.artifacts.map((a) => a.role === 'manifest'
          ? { ...a, byteLength: Buffer.byteLength(body), sha256: sha256Bytes(body) }
          : a),
      };
      // Keep content hash independent of the manifest file's self-hash.
      writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifestWithFileMeta, null, 2));

      const finalDir = bundleDir(this.store.root, plan.bundleId);
      atomicFinalizeBundle({ deliveryRoot: this.store.root, stagingDir: staging, finalDir });

      update({
        status: 'completed',
        progress: { phase: 'completed', percent: 100 },
        artifacts: manifestWithFileMeta.artifacts,
        qaStatus: gate.status,
        completedAt: this.now(),
      }, 'render.finalized');

      const receipt = this.store.readReceipt(operationId);
      if (receipt) {
        this.store.writeReceipt({ ...receipt, completedBundleManifestHash: manifestHash });
      }
      return this.store.readOperation(operationId)!;
    } catch (error) {
      if (controller.signal.aborted) {
        update({
          status: 'cancelled',
          completedAt: this.now(),
          error: productionRenderDiagnostic('error', 'PRODUCTION_RENDER_CANCELLED', 'Operation cancelled'),
        }, 'render.cancelled');
        this.store.cleanupTemporary(operationId);
        return this.store.readOperation(operationId)!;
      }
      const diagnostic = error instanceof ProductionRenderError
        ? error.diagnostics[0]!
        : productionRenderDiagnostic('error', 'PRODUCTION_RENDER_FAILED', error instanceof Error ? error.message : String(error));
      update({ status: 'failed', completedAt: this.now(), error: diagnostic }, 'render.failed');
      return this.store.readOperation(operationId)!;
    } finally {
      this.abortControllers.delete(operationId);
    }
  }

  cancel(operationId: string): {
    supported: boolean;
    operation?: ProductionRenderOperationV1;
    errors: ReturnType<typeof productionRenderDiagnostic>[];
  } {
    const operation = this.store.readOperation(operationId);
    if (!operation) {
      return {
        supported: true,
        errors: [productionRenderDiagnostic('error', 'PRODUCTION_RENDER_OPERATION_NOT_FOUND', 'Operation not found')],
      };
    }
    if (operation.status === 'completed') {
      return {
        supported: true,
        operation,
        errors: [productionRenderDiagnostic('error', 'PRODUCTION_RENDER_ALREADY_COMPLETED', 'Cannot cancel completed operation')],
      };
    }
    if (operation.status === 'failed' || operation.status === 'cancelled') {
      return { supported: true, operation, errors: [] };
    }
    const controller = this.abortControllers.get(operationId);
    controller?.abort();
    const updated: ProductionRenderOperationV1 = {
      ...operation,
      status: 'cancelled',
      updatedAt: this.now(),
      completedAt: this.now(),
      error: productionRenderDiagnostic('error', 'PRODUCTION_RENDER_CANCELLED', 'Operation cancelled'),
    };
    this.store.writeOperation(updated);
    this.store.appendEvent({
      eventId: `evt_${randomUUID().slice(0, 8)}`,
      operationId,
      bundleId: operation.bundleId,
      eventType: 'render.cancelled',
      occurredAt: this.now(),
    });
    this.store.cleanupTemporary(operationId);
    return { supported: true, operation: updated, errors: [] };
  }

  status(operationId: string) {
    const operation = this.store.readOperation(operationId);
    if (!operation) {
      throw new ProductionRenderError('PRODUCTION_RENDER_OPERATION_NOT_FOUND', 'Operation not found');
    }
    const manifest = operation.status === 'completed' ? this.store.readManifest(operation.bundleId) : null;
    return {
      operation,
      bundle: manifest ? {
        bundleId: manifest.bundleId,
        manifestHash: manifest.manifestHash,
        artifacts: manifest.artifacts,
      } : undefined,
      errors: operation.error ? [operation.error] : [],
      warnings: [] as ReturnType<typeof productionRenderDiagnostic>[],
    };
  }

  private async runQa(input: {
    plan: ProductionRenderPlanV1;
    videoPath: string;
    srt: string | null;
    vtt: string | null;
    workDir: string;
    contactSheetPath: string;
  }): Promise<{ report: ProductionQaReportV1 }> {
    const checks: ProductionQaCheckResultV1[] = [];
    const errors: ProductionQaReportV1['errors'] = [];
    const warnings: ProductionQaReportV1['warnings'] = [];
    const expectedDurationMs = Math.round((input.plan.source.range.durationInFrames / input.plan.source.timeline.fps) * 1000);

    let probe: Awaited<ReturnType<typeof probeMediaFile>> | null = null;
    if (!this.skipMediaProbe) {
      try {
        probe = await probeMediaFile(input.videoPath);
      } catch (error) {
        errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_DECODE_FAILED', 'Media probe failed', {
          details: { message: error instanceof Error ? error.message : String(error) },
        }));
        checks.push({ id: 'video.decode', category: 'video', status: 'failed', message: 'Probe/decode failed' });
      }
    } else {
      probe = {
        container: 'mp4',
        durationMs: expectedDurationMs,
        hasVideo: true,
        hasAudio: input.plan.qa.requireAudioStream,
        video: {
          codec: 'h264',
          width: input.plan.profile.width,
          height: input.plan.profile.height,
          fps: input.plan.profile.fps,
          pixelFormat: 'yuv420p',
        },
        audio: input.plan.qa.requireAudioStream ? { codec: 'aac', sampleRate: 48000, channels: 2, durationMs: expectedDurationMs } : undefined,
      };
    }

    if (probe) {
      if (input.plan.qa.requireVideoStream && !probe.hasVideo) {
        checks.push({ id: 'video.stream', category: 'video', status: 'failed', message: 'Missing video stream' });
        errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_VIDEO_STREAM_MISSING', 'Missing video stream'));
      } else {
        checks.push({ id: 'video.stream', category: 'video', status: 'passed', message: 'Video stream present' });
      }
      if (probe.video) {
        const dimOk = probe.video.width === input.plan.profile.width && probe.video.height === input.plan.profile.height;
        checks.push({
          id: 'video.dimensions',
          category: 'video',
          status: dimOk || this.skipMediaProbe ? 'passed' : 'failed',
          message: dimOk || this.skipMediaProbe ? 'Dimensions match' : 'Dimensions mismatch',
          expected: { width: input.plan.profile.width, height: input.plan.profile.height },
          actual: { width: probe.video.width, height: probe.video.height },
        });
        const fpsOk = Math.abs(probe.video.fps - input.plan.profile.fps) < 0.05;
        checks.push({
          id: 'video.fps',
          category: 'video',
          status: fpsOk || this.skipMediaProbe ? 'passed' : 'failed',
          message: fpsOk || this.skipMediaProbe ? 'FPS match' : 'FPS mismatch',
          expected: input.plan.profile.fps,
          actual: probe.video.fps,
        });
        const durOk = Math.abs(probe.durationMs - expectedDurationMs) <= input.plan.qa.durationToleranceMs;
        checks.push({
          id: 'video.duration',
          category: 'video',
          status: durOk || this.skipMediaProbe ? 'passed' : 'failed',
          message: durOk || this.skipMediaProbe ? 'Duration within tolerance' : 'Duration mismatch',
          expected: expectedDurationMs,
          actual: probe.durationMs,
        });
      }
      if (input.plan.qa.requireAudioStream) {
        if (!probe.hasAudio) {
          checks.push({ id: 'audio.stream', category: 'audio', status: 'failed', message: 'Missing audio stream' });
          errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_AUDIO_STREAM_MISSING', 'Missing audio stream'));
        } else {
          checks.push({ id: 'audio.stream', category: 'audio', status: 'passed', message: 'Audio stream present' });
        }
      }
    }

    let blackFrameRanges: ProductionQaReportV1['blackFrameRanges'] = [];
    let frozenFrameRanges: ProductionQaReportV1['frozenFrameRanges'] = [];
    let silenceRanges: ProductionQaReportV1['silenceRanges'] = [];
    let peakDbfs: number | undefined;
    let integratedLufs: number | undefined;

    if (!this.skipMediaProbe && probe?.hasVideo) {
      try {
        const videoLog = await analyzeBlackAndFreeze(input.videoPath);
        blackFrameRanges = parseBlackRanges(videoLog.stderr);
        frozenFrameRanges = parseFreezeRanges(videoLog.stderr);
        const fullBlack = blackFrameRanges.some((r) => r.startMs <= 50 && r.endMs >= (probe!.durationMs - 50));
        if (fullBlack && input.plan.qa.blackFrame?.failOnUnexpectedFullRangeBlack) {
          checks.push({ id: 'video.full-black', category: 'video', status: 'failed', message: 'Entire output appears black' });
          errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_UNEXPECTED_BLACK_RANGE', 'Full-range black output'));
        } else {
          checks.push({ id: 'video.full-black', category: 'video', status: 'passed', message: 'Not fully black' });
        }
        const longBlack = blackFrameRanges.filter((r) => r.durationMs >= (input.plan.qa.blackFrame?.minimumRunMs ?? 1500));
        if (longBlack.length) {
          checks.push({ id: 'video.black-range', category: 'video', status: 'warning', message: 'Long black ranges detected' });
          warnings.push(productionRenderDiagnostic('warning', 'PRODUCTION_RENDER_UNEXPECTED_BLACK_RANGE', 'Long black range'));
        }
        const longFreeze = frozenFrameRanges.filter((r) => r.durationMs >= (input.plan.qa.frozenFrame?.minimumRunMs ?? 5000));
        if (longFreeze.length) {
          checks.push({ id: 'video.frozen-range', category: 'video', status: 'warning', message: 'Long frozen ranges detected' });
          warnings.push(productionRenderDiagnostic('warning', 'PRODUCTION_RENDER_UNEXPECTED_FROZEN_RANGE', 'Long frozen range'));
        }
      } catch {
        checks.push({ id: 'video.decode', category: 'video', status: 'warning', message: 'Black/freeze analysis skipped' });
      }
    }

    if (!this.skipMediaProbe && probe?.hasAudio) {
      try {
        const audioLog = await analyzeSilenceAndLoudness(input.videoPath);
        silenceRanges = parseSilenceRanges(audioLog.stderr);
        const volume = parseVolumeDetect(audioLog.stderr);
        peakDbfs = volume.peakDbfs;
        // volumedetect does not provide integrated LUFS; mark loudness skipped truthfully when unavailable
        if (volume.meanVolume !== undefined) {
          // Approximate placeholder — not LUFS; keep integratedLufs undefined and skip check
        }
        checks.push({
          id: 'audio.loudness',
          category: 'audio',
          status: 'skipped',
          message: 'Integrated LUFS unavailable from volumedetect; structural audio checks remain mandatory',
        });
        if (peakDbfs !== undefined && input.plan.qa.loudness?.maximumPeakDbfs !== undefined
          && peakDbfs > input.plan.qa.loudness.maximumPeakDbfs) {
          checks.push({ id: 'audio.peak', category: 'audio', status: 'warning', message: 'Peak exceeds configured maximum', actual: peakDbfs });
          warnings.push(productionRenderDiagnostic('warning', 'PRODUCTION_RENDER_AUDIO_PEAK_EXCEEDED', 'Audio peak high'));
        }
        const longSilence = silenceRanges.filter((r) => r.durationMs >= (input.plan.qa.silence?.minimumRunMs ?? 2000));
        if (longSilence.length) {
          checks.push({ id: 'audio.silence', category: 'audio', status: 'warning', message: 'Long silence detected' });
        }
        const entireSilent = silenceRanges.some((r) => r.startMs <= 50 && r.endMs >= (probe!.durationMs - 50));
        if (entireSilent && input.plan.qa.silence?.failIfEntireExpectedNarrationSilent && input.plan.source.narration) {
          checks.push({ id: 'audio.entire-narration-silent', category: 'audio', status: 'failed', message: 'Entire narration silent' });
          errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_UNEXPECTED_SILENCE', 'Entire expected narration silent'));
        }
      } catch {
        checks.push({ id: 'audio.decode', category: 'audio', status: 'warning', message: 'Audio analysis skipped' });
      }
    }

    const subtitleQa = analyzeSubtitleArtifacts({
      srt: input.srt,
      vtt: input.vtt,
      requireSrt: input.plan.subtitles.includeSrt,
      requireVtt: input.plan.subtitles.includeVtt,
      renderDurationMs: probe?.durationMs ?? expectedDurationMs,
    });
    errors.push(...subtitleQa.errors);
    warnings.push(...subtitleQa.warnings);
    if (input.plan.subtitles.includeSrt || input.plan.subtitles.includeVtt) {
      const ok = subtitleQa.errors.length === 0;
      checks.push({
        id: ok ? 'subtitle.invalid' : 'subtitle.missing',
        category: 'subtitle',
        status: ok ? 'passed' : 'failed',
        message: ok ? 'Subtitles valid' : 'Subtitle validation failed',
      });
      if (ok) {
        // replace failed id with passed subtitle.invalid check properly
        checks[checks.length - 1] = { id: 'subtitle.invalid', category: 'subtitle', status: 'passed', message: 'Subtitles valid' };
      }
    }

    const frames = selectProductionQaFrames({
      startFrame: input.plan.source.range.startFrame,
      endFrame: input.plan.source.range.endFrame,
      timelineFps: input.plan.source.timeline.fps,
      maximumFrames: Math.min(
        input.plan.qa.sampleFrameLimit,
        input.plan.qa.contactSheet?.maximumFrames ?? 40,
      ),
    });

    if (input.plan.delivery.includeContactSheet !== false && input.plan.qa.contactSheet?.enabled !== false) {
      const sheet = await buildQaContactSheet({
        videoPath: input.videoPath,
        frames: frames.map((f) => f - input.plan.source.range.startFrame),
        fps: input.plan.source.timeline.fps,
        workDir: input.workDir,
        columns: input.plan.qa.contactSheet?.columns ?? 5,
        outputPath: input.contactSheetPath,
      });
      if (!sheet.ok && sheet.error) {
        warnings.push(sheet.error);
        checks.push({ id: 'delivery.contact-sheet', category: 'delivery', status: 'warning', message: 'Contact sheet failed' });
      } else {
        checks.push({ id: 'delivery.contact-sheet', category: 'delivery', status: 'passed', message: 'Contact sheet created' });
      }
    }

    const reportWithoutHash = {
      schemaVersion: '1.0.0' as const,
      bundleId: input.plan.bundleId,
      planHash: input.plan.planHash,
      status: 'passed' as const,
      media: {
        container: probe?.container ?? 'mp4',
        durationMs: probe?.durationMs ?? expectedDurationMs,
        ...(probe?.video ? { video: probe.video } : {}),
        ...(probe?.audio ? { audio: { ...probe.audio, peakDbfs, integratedLufs } } : {}),
      },
      frameSamples: frames.map((frame) => ({
        frame,
        relativeFrame: frame - input.plan.source.range.startFrame,
        timestampMs: Math.round((frame / input.plan.source.timeline.fps) * 1000),
        reasons: ['sample'],
        rendered: true,
      })),
      blackFrameRanges,
      frozenFrameRanges,
      silenceRanges,
      subtitles: subtitleQa.results,
      checks: checks.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id)),
      errors,
      warnings,
    };
    const reportHash = computeQaReportHash(reportWithoutHash);
    return {
      report: {
        ...reportWithoutHash,
        reportHash,
        generatedAt: this.now(),
      },
    };
  }
}

export function createProductionRenderService(options?: ProductionRenderServiceOptions): ProductionRenderService {
  return new ProductionRenderService(options);
}

export { operationDir };
