import type { NarrationPlanV1 } from '../../../narration-plans/src/contracts/narration-plan.ts';
import { validateNarrationPlan } from '../../../narration-plans/src/schema/narration-validator.ts';
import { MAX_TTS_CONCURRENT_REQUESTS } from '../../../narration-plans/src/contracts/narration-policy.ts';
import { narrationDiagnostic, NarrationError, type NarrationDiagnostic } from '../contracts/narration-audio-errors.ts';
import type { NarrationAudioArtifactV1, NarrationAudioArtifactSummaryV1 } from '../contracts/synthesis-artifact.ts';
import type { NarrationSynthesisOperationV1 } from '../contracts/synthesis-operation.ts';
import type { NarrationSynthesisRequestV1 } from '../contracts/synthesis-request.ts';
import {
  audioContentHashFromBytes,
  computeArtifactHash,
  computeNarrationSynthesisInputHash,
  computeTimingDataHash,
  parseProviderSubtitleTiming,
  summarizeArtifact,
  toProviderVoiceRequest,
  type NarrationTtsProviderFn,
} from '../providers/index.ts';
import {
  assertPathInsideRoot,
  atomicWriteJson,
  mediaSrcForHash,
  readJsonIfExists,
  resolveNarrationRoot,
  segmentArtifactPath,
  segmentOperationPath,
} from '../storage/index.ts';
import { encodeToneWav, probeWavDurationMs } from './audio-duration.ts';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';

export type PrepareNarrationTtsInput = {
  requestId: string;
  narrationPlan: NarrationPlanV1 | unknown;
  sceneEntryIds?: string[];
  segmentIds?: string[];
  dryRun?: boolean;
  forceRegenerate?: boolean;
};

export type NarrationTtsPreparationResult = {
  narrationPlanId: string;
  narrationPlanHash: string;
  dryRun: boolean;
  segments: {
    segmentId: string;
    sceneEntryId: string;
    synthesisInputHash: string;
    status: 'cache-hit' | 'would-synthesize' | 'submitted' | 'failed' | 'skipped';
    operationId?: string;
    artifact?: NarrationAudioArtifactSummaryV1;
    providerConfigured: boolean;
    error?: NarrationDiagnostic;
  }[];
  submittedCount: number;
  cacheHitCount: number;
  errors: NarrationDiagnostic[];
  warnings: NarrationDiagnostic[];
};

export type GetNarrationTtsStatusInput = {
  narrationPlanId: string;
  narrationPlanHash: string;
};

export type NarrationTtsStatusResult = {
  narrationPlanId: string;
  narrationPlanHash: string;
  status: 'not-started' | 'running' | 'partially-complete' | 'complete' | 'failed';
  segments: {
    segmentId: string;
    sceneEntryId: string;
    status: 'cached' | 'queued' | 'running' | 'succeeded' | 'failed';
    operationId?: string;
    synthesisInputHash: string;
    artifact?: NarrationAudioArtifactSummaryV1;
    error?: NarrationDiagnostic;
  }[];
  errors: NarrationDiagnostic[];
  warnings: NarrationDiagnostic[];
};

export type NarrationSynthesisServiceOptions = {
  narrationRoot?: string;
  /** Injected provider — default tests must inject a fake. */
  provider?: NarrationTtsProviderFn;
  /** Optional credential presence check (never returns secrets). */
  isProviderConfigured?: (provider: string) => boolean;
  now?: () => string;
};

function defaultFakeProvider(): NarrationTtsProviderFn {
  return async (request) => {
    const text = String(request.text ?? '');
    const durationMs = Math.max(400, Math.min(8000, 80 * Math.max(1, [...text].length)));
    const audio = encodeToneWav(durationMs);
    return {
      audio,
      durationMs,
      codec: 'wav',
      sampleRate: 24000,
      subtitle: undefined,
    };
  };
}

export class NarrationSynthesisService {
  private readonly root: string;
  private readonly provider: NarrationTtsProviderFn;
  private readonly isProviderConfigured: (provider: string) => boolean;
  private readonly now: () => string;
  private readonly audioBytes = new Map<string, Buffer>();
  private readonly requestReceipts = new Map<string, { inputFingerprint: string; result: NarrationTtsPreparationResult }>();

  constructor(options: NarrationSynthesisServiceOptions = {}) {
    this.root = resolveNarrationRoot(options.narrationRoot);
    this.provider = options.provider ?? defaultFakeProvider();
    this.isProviderConfigured = options.isProviderConfigured ?? (() => true);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  getAudioBytes(contentHash: string): Buffer | undefined {
    return this.audioBytes.get(contentHash);
  }

  listArtifacts(planHash: string): NarrationAudioArtifactV1[] {
    // Best-effort scan via known segment operation folders is avoided; callers pass segment ids.
    void planHash;
    return [];
  }

  loadArtifact(planHash: string, segmentId: string, synthesisInputHash: string): NarrationAudioArtifactV1 | null {
    const path = segmentArtifactPath(this.root, planHash, segmentId, synthesisInputHash);
    assertPathInsideRoot(this.root, path);
    const artifact = readJsonIfExists<NarrationAudioArtifactV1>(path);
    if (artifact) {
      const wavPath = join(dirname(path), 'audio.wav');
      if (existsSync(wavPath)) {
        this.audioBytes.set(artifact.audioContentHash, readFileSync(wavPath));
      }
    }
    return artifact;
  }

  async prepare(input: PrepareNarrationTtsInput): Promise<NarrationTtsPreparationResult> {
    const dryRun = input.dryRun !== false;
    const forceRegenerate = input.forceRegenerate === true;
    const errors: NarrationDiagnostic[] = [];
    const warnings: NarrationDiagnostic[] = [];

    if (!/^[A-Za-z0-9._-]{1,128}$/.test(input.requestId)) {
      throw new NarrationError('NARRATION_REQUEST_ID_REUSE_CONFLICT', 'Invalid requestId');
    }

    const validated = validateNarrationPlan(input.narrationPlan);
    errors.push(...validated.errors);
    warnings.push(...validated.warnings);
    if (!validated.valid || !validated.normalizedPlan || !validated.narrationPlanHash) {
      return {
        narrationPlanId: typeof (input.narrationPlan as { id?: string })?.id === 'string'
          ? (input.narrationPlan as { id: string }).id
          : 'invalid',
        narrationPlanHash: validated.narrationPlanHash ?? '',
        dryRun,
        segments: [],
        submittedCount: 0,
        cacheHitCount: 0,
        errors,
        warnings,
      };
    }

    const plan = validated.normalizedPlan;
    const planHash = validated.narrationPlanHash;
    const fingerprint = `${planHash}:${dryRun}:${forceRegenerate}:${(input.segmentIds ?? []).join(',')}:${(input.sceneEntryIds ?? []).join(',')}`;
    const prior = this.requestReceipts.get(input.requestId);
    if (prior && prior.inputFingerprint !== fingerprint) {
      throw new NarrationError('NARRATION_REQUEST_ID_REUSE_CONFLICT', 'requestId reused with different input', {
        recovery: 'Use a new requestId for a different prepare input',
      });
    }
    if (prior && prior.inputFingerprint === fingerprint) {
      return prior.result;
    }

    const selectedScenes = plan.scenes.filter((s) =>
      !input.sceneEntryIds?.length || input.sceneEntryIds.includes(s.sceneEntryId));

    type WorkItem = {
      sceneEntryId: string;
      segmentId: string;
      request: NarrationSynthesisRequestV1;
      speakerId: string;
    };
    const work: WorkItem[] = [];

    for (const scene of selectedScenes) {
      const segments = scene.segments;
      segments.forEach((seg, index) => {
        if (input.segmentIds?.length && !input.segmentIds.includes(seg.id)) return;
        const speaker = plan.speakers.find((sp) => sp.id === (seg.speakerId ?? plan.defaults?.speakerId))
          ?? plan.speakers[0]!;
        const voice = speaker.temporaryVoice;
        const previousText = index > 0 ? segments[index - 1]!.text : undefined;
        const nextText = index < segments.length - 1 ? segments[index + 1]!.text : undefined;
        const synthesisInputHash = computeNarrationSynthesisInputHash({
          text: seg.text,
          provider: voice.provider,
          voiceId: voice.voiceId,
          modelId: voice.modelId,
          speed: voice.speed,
          pitch: voice.pitch,
          volume: voice.volume,
          emotion: voice.emotion,
          emotionScale: voice.emotionScale,
          languageCode: voice.languageCode ?? plan.language,
          languageBoost: voice.languageBoost,
          outputFormat: voice.outputFormat,
          sampleRate: voice.sampleRate,
          subtitleTiming: voice.subtitleTiming,
          pronunciationHints: seg.pronunciationHints,
          previousText,
          nextText,
        });
        work.push({
          sceneEntryId: scene.sceneEntryId,
          segmentId: seg.id,
          speakerId: speaker.id,
          request: {
            requestId: input.requestId,
            narrationPlanId: plan.id,
            narrationPlanHash: planHash,
            sceneEntryId: scene.sceneEntryId,
            segmentId: seg.id,
            text: seg.text,
            provider: voice.provider,
            voiceId: voice.voiceId,
            modelId: voice.modelId,
            speed: voice.speed,
            pitch: voice.pitch,
            volume: voice.volume,
            emotion: voice.emotion,
            emotionScale: voice.emotionScale,
            languageCode: voice.languageCode ?? plan.language,
            languageBoost: voice.languageBoost,
            outputFormat: voice.outputFormat,
            sampleRate: voice.sampleRate,
            subtitleTiming: voice.subtitleTiming,
            pronunciationHints: seg.pronunciationHints,
            previousText,
            nextText,
            synthesisInputHash,
          },
        });
      });
    }

    const segmentResults: NarrationTtsPreparationResult['segments'] = [];
    let submittedCount = 0;
    let cacheHitCount = 0;
    const pending: WorkItem[] = [];

    for (const item of work) {
      const existing = forceRegenerate
        ? null
        : this.loadArtifact(planHash, item.segmentId, item.request.synthesisInputHash);
      const configured = this.isProviderConfigured(item.request.provider);
      if (existing) {
        cacheHitCount += 1;
        segmentResults.push({
          segmentId: item.segmentId,
          sceneEntryId: item.sceneEntryId,
          synthesisInputHash: item.request.synthesisInputHash,
          status: 'cache-hit',
          artifact: summarizeArtifact(existing),
          providerConfigured: configured,
        });
        continue;
      }
      if (dryRun) {
        segmentResults.push({
          segmentId: item.segmentId,
          sceneEntryId: item.sceneEntryId,
          synthesisInputHash: item.request.synthesisInputHash,
          status: 'would-synthesize',
          providerConfigured: configured,
          ...(configured ? {} : {
            error: narrationDiagnostic('error', 'NARRATION_TTS_FAILED', `Provider ${item.request.provider} is not configured`, {
              segmentId: item.segmentId,
              recovery: 'Set provider credentials in environment/config (never in NarrationPlan)',
            }),
          }),
        });
        continue;
      }
      if (!configured) {
        segmentResults.push({
          segmentId: item.segmentId,
          sceneEntryId: item.sceneEntryId,
          synthesisInputHash: item.request.synthesisInputHash,
          status: 'failed',
          providerConfigured: false,
          error: narrationDiagnostic('error', 'NARRATION_TTS_FAILED', `Provider ${item.request.provider} is not configured`, {
            segmentId: item.segmentId,
          }),
        });
        continue;
      }
      pending.push(item);
    }

    // Concurrency-limited synthesis
    for (let i = 0; i < pending.length; i += MAX_TTS_CONCURRENT_REQUESTS) {
      const batch = pending.slice(i, i + MAX_TTS_CONCURRENT_REQUESTS);
      const settled = await Promise.all(batch.map(async (item) => {
        const operationId = `op_${item.request.synthesisInputHash.slice(0, 12)}_${item.segmentId}`;
        const opPath = segmentOperationPath(this.root, planHash, item.segmentId, input.requestId);
        assertPathInsideRoot(this.root, opPath);
        const operation: NarrationSynthesisOperationV1 = {
          operationId,
          requestId: input.requestId,
          narrationPlanId: plan.id,
          narrationPlanHash: planHash,
          segmentId: item.segmentId,
          sceneEntryId: item.sceneEntryId,
          synthesisInputHash: item.request.synthesisInputHash,
          status: 'running',
          createdAt: this.now(),
          updatedAt: this.now(),
        };
        atomicWriteJson(opPath, operation);
        try {
          const providerRequest = toProviderVoiceRequest(item.request);
          const result = await this.provider(providerRequest);
          const audio = Buffer.from(result.audio);
          if (audio.byteLength === 0) {
            throw new Error('Empty audio');
          }
          const durationMs = result.durationMs && result.durationMs > 0
            ? Math.floor(result.durationMs)
            : probeWavDurationMs(audio);
          if (!durationMs || durationMs <= 0) {
            throw new Error('Invalid audio duration');
          }
          const audioContentHash = audioContentHashFromBytes(audio);
          const timing = parseProviderSubtitleTiming({
            raw: result.subtitle,
            text: item.request.text,
            durationMs,
            language: plan.language,
            requested: item.request.subtitleTiming,
          });
          const artifactId = `artifact_${audioContentHash.slice(0, 16)}`;
          const artifact: NarrationAudioArtifactV1 = {
            schemaVersion: '1.0.0',
            artifactId,
            narrationPlanId: plan.id,
            narrationPlanHash: planHash,
            sceneEntryId: item.sceneEntryId,
            segmentId: item.segmentId,
            synthesisInputHash: item.request.synthesisInputHash,
            provider: item.request.provider,
            voiceId: item.request.voiceId,
            modelId: item.request.modelId,
            mediaSrc: mediaSrcForHash(audioContentHash),
            codec: result.codec ?? 'wav',
            sampleRate: result.sampleRate ?? 24000,
            durationMs,
            audioContentHash,
            sourceRevision: audioContentHash.slice(0, 16),
            wordTiming: timing,
            artifactHash: computeArtifactHash({
              synthesisInputHash: item.request.synthesisInputHash,
              audioContentHash,
              durationMs,
              codec: result.codec ?? 'wav',
              sampleRate: result.sampleRate ?? 24000,
              timingDataHash: computeTimingDataHash(timing.words),
              provider: item.request.provider,
              voiceId: item.request.voiceId,
              modelId: item.request.modelId,
            }),
            createdAt: this.now(),
          };
          const artPath = segmentArtifactPath(this.root, planHash, item.segmentId, item.request.synthesisInputHash);
          assertPathInsideRoot(this.root, artPath);
          // Immutable: never overwrite existing artifact.json
          if (!existsSync(artPath)) {
            atomicWriteJson(artPath, artifact);
            mkdirSync(dirname(artPath), { recursive: true });
            writeFileSync(join(dirname(artPath), 'audio.wav'), audio);
          } else if (forceRegenerate) {
            // Write under a distinct hash path only — already keyed by synthesisInputHash;
            // force regenerate with same input keeps original and records new bytes beside if hash differs.
            const altPath = segmentArtifactPath(
              this.root,
              planHash,
              item.segmentId,
              `${item.request.synthesisInputHash}_${audioContentHash.slice(0, 8)}`,
            );
            if (!existsSync(altPath)) {
              atomicWriteJson(altPath, artifact);
              writeFileSync(join(dirname(altPath), 'audio.wav'), audio);
            }
          }
          this.audioBytes.set(audioContentHash, audio);
          operation.status = 'succeeded';
          operation.artifactId = artifact.artifactId;
          operation.updatedAt = this.now();
          atomicWriteJson(opPath, operation);
          return {
            segmentId: item.segmentId,
            sceneEntryId: item.sceneEntryId,
            synthesisInputHash: item.request.synthesisInputHash,
            status: 'submitted' as const,
            operationId,
            artifact: summarizeArtifact(artifact),
            providerConfigured: true,
          };
        } catch (error) {
          operation.status = 'failed';
          operation.errorCode = 'NARRATION_TTS_FAILED';
          operation.errorMessage = error instanceof Error ? error.message : String(error);
          operation.updatedAt = this.now();
          atomicWriteJson(opPath, operation);
          return {
            segmentId: item.segmentId,
            sceneEntryId: item.sceneEntryId,
            synthesisInputHash: item.request.synthesisInputHash,
            status: 'failed' as const,
            operationId,
            providerConfigured: true,
            error: narrationDiagnostic('error', 'NARRATION_TTS_FAILED', operation.errorMessage, {
              segmentId: item.segmentId,
            }),
          };
        }
      }));
      submittedCount += settled.filter((s) => s.status === 'submitted').length;
      segmentResults.push(...settled);
    }

    const result: NarrationTtsPreparationResult = {
      narrationPlanId: plan.id,
      narrationPlanHash: planHash,
      dryRun,
      segments: segmentResults,
      submittedCount,
      cacheHitCount,
      errors,
      warnings,
    };
    this.requestReceipts.set(input.requestId, { inputFingerprint: fingerprint, result });
    return result;
  }

  async getStatus(input: GetNarrationTtsStatusInput): Promise<NarrationTtsStatusResult> {
    // Status is reconstructed from prepare receipts / artifacts for the plan hash.
    const matching = [...this.requestReceipts.values()]
      .map((r) => r.result)
      .filter((r) => r.narrationPlanId === input.narrationPlanId && r.narrationPlanHash === input.narrationPlanHash);
    const latest = matching[matching.length - 1];
    if (!latest) {
      return {
        narrationPlanId: input.narrationPlanId,
        narrationPlanHash: input.narrationPlanHash,
        status: 'not-started',
        segments: [],
        errors: [],
        warnings: [],
      };
    }
    const segments = latest.segments.map((s) => ({
      segmentId: s.segmentId,
      sceneEntryId: s.sceneEntryId,
      status: (s.status === 'cache-hit' ? 'cached'
        : s.status === 'submitted' ? 'succeeded'
          : s.status === 'failed' ? 'failed'
            : s.status === 'would-synthesize' ? 'queued'
              : 'running') as NarrationTtsStatusResult['segments'][number]['status'],
      operationId: s.operationId,
      synthesisInputHash: s.synthesisInputHash,
      artifact: s.artifact,
      error: s.error,
    }));
    const failed = segments.some((s) => s.status === 'failed');
    const allDone = segments.every((s) => s.status === 'cached' || s.status === 'succeeded');
    const anyRunning = segments.some((s) => s.status === 'queued' || s.status === 'running');
    let status: NarrationTtsStatusResult['status'] = 'not-started';
    if (failed && !allDone) status = 'failed';
    else if (allDone) status = 'complete';
    else if (anyRunning) status = 'running';
    else status = 'partially-complete';
    return {
      narrationPlanId: input.narrationPlanId,
      narrationPlanHash: input.narrationPlanHash,
      status,
      segments,
      errors: latest.errors,
      warnings: latest.warnings,
    };
  }

  collectCompletedArtifacts(plan: NarrationPlanV1, planHash: string): Map<string, NarrationAudioArtifactV1> {
    const map = new Map<string, NarrationAudioArtifactV1>();
    for (const scene of plan.scenes) {
      scene.segments.forEach((seg, index) => {
        const speaker = plan.speakers.find((sp) => sp.id === (seg.speakerId ?? plan.defaults?.speakerId))
          ?? plan.speakers[0]!;
        const voice = speaker.temporaryVoice;
        const previousText = index > 0 ? scene.segments[index - 1]!.text : undefined;
        const nextText = index < scene.segments.length - 1 ? scene.segments[index + 1]!.text : undefined;
        const synthesisInputHash = computeNarrationSynthesisInputHash({
          text: seg.text,
          provider: voice.provider,
          voiceId: voice.voiceId,
          modelId: voice.modelId,
          speed: voice.speed,
          pitch: voice.pitch,
          volume: voice.volume,
          emotion: voice.emotion,
          emotionScale: voice.emotionScale,
          languageCode: voice.languageCode ?? plan.language,
          languageBoost: voice.languageBoost,
          outputFormat: voice.outputFormat,
          sampleRate: voice.sampleRate,
          subtitleTiming: voice.subtitleTiming,
          pronunciationHints: seg.pronunciationHints,
          previousText,
          nextText,
        });
        const art = this.loadArtifact(planHash, seg.id, synthesisInputHash);
        if (art) map.set(seg.id, art);
      });
    }
    return map;
  }
}

export function createNarrationSynthesisService(options?: NarrationSynthesisServiceOptions): NarrationSynthesisService {
  return new NarrationSynthesisService(options);
}
