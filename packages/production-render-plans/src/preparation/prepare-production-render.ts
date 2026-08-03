import type { ProductionRenderRequestV1 } from '../contracts/production-render-request.ts';
import type { ProductionRenderPlanV1 } from '../contracts/production-render-plan.ts';
import type { ProductionPreflightReportV1 } from '../contracts/production-render-diagnostic.ts';
import {
  productionRenderDiagnostic,
  type ProductionRenderDiagnostic,
} from '../contracts/production-render-errors.ts';
import { validateProductionRenderRequest } from '../schema/production-render-validator.ts';
import {
  computeBundleId,
  computeProductionProjectFingerprint,
  computeProductionRenderPlanHash,
  computeProductionRenderRequestHash,
  computeProductionRenderRevision,
  computeProductionTimelineFingerprint,
} from '../schema/production-render-hash.ts';
import { resolveProductionRenderProfile } from '../schema/production-render-profile-resolve.ts';
import { sha256Hex, stableStringify, deepCloneJson } from '../schema/production-render-serialization.ts';
import type { ResolvedProductionSubtitlePolicyV1 } from '../contracts/production-subtitle-policy.ts';
import { DEFAULT_PRODUCTION_DELIVERY_POLICY } from '../contracts/production-delivery-policy.ts';
import { inspectVideoPlanAssembly } from '../../../project-video-assembly/src/inspection/assembly-inspector.ts';
import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
} from '../../../project-scene-bindings/src/contracts/scene-clip-item.ts';
import { parseSceneClipBinding } from '../../../project-scene-bindings/src/schema/scene-clip-props-validator.ts';
import { BETTER_CHAT_CUT_NARRATION_PROPS_KEY } from '../../../project-narration/src/contracts/narration-timeline-metadata.ts';
import { buildSubtitleCues } from '../../../project-narration/src/subtitles/subtitle-cues.ts';
import type { NarrationTimingSnapshotV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import type { ProductionQaPolicyV1 } from '../contracts/production-qa-policy.ts';

export type ProductionTimelineItemLike = {
  id: string;
  kind: string;
  track?: string;
  startFrame: number;
  durationInFrames: number;
  templateId?: string;
  assetId?: string;
  src?: string;
  props?: Record<string, unknown>;
};

export type ProductionTimelineLike = {
  id: string;
  name?: string;
  width: number;
  height: number;
  fps: number;
  fit?: string;
  items: ProductionTimelineItemLike[];
  transitions?: unknown[];
  markers?: unknown[];
  tracks?: Record<string, unknown>;
  captions?: { enabled?: boolean; words?: unknown[] } | null;
};

export type ProductionProjectLike = {
  version?: unknown;
  assets?: Array<{ id: string; src?: string; kind?: string }>;
  mediaFolders?: unknown;
  timelines: ProductionTimelineLike[];
  activeTimelineId: string;
  designStyle?: unknown;
};

export type PrepareProductionRenderInput = {
  project: ProductionProjectLike;
  projectId: string;
  request: ProductionRenderRequestV1 | unknown;
  preparedAt?: string;
};

export type ProductionRenderPreparationResult = {
  valid: boolean;
  plan?: ProductionRenderPlanV1;
  preflight: ProductionPreflightReportV1;
  errors: ProductionRenderDiagnostic[];
  warnings: ProductionRenderDiagnostic[];
};

export function computeTimelineDurationInFrames(timeline: ProductionTimelineLike): number {
  let end = 0;
  for (const item of timeline.items ?? []) {
    const itemEnd = (item.startFrame ?? 0) + (item.durationInFrames ?? 0);
    if (itemEnd > end) end = itemEnd;
  }
  return end;
}

export function prepareProductionRender(input: PrepareProductionRenderInput): ProductionRenderPreparationResult {
  const errors: ProductionRenderDiagnostic[] = [];
  const warnings: ProductionRenderDiagnostic[] = [];
  const validated = validateProductionRenderRequest(input.request);
  errors.push(...validated.errors);
  warnings.push(...validated.warnings);

  const projectFingerprint = computeProductionProjectFingerprint(input.project);
  const timelineId = resolveTimelineId(input.project, validated.normalizedRequest?.source.timelineId);
  const timeline = input.project.timelines.find((t) => t.id === timelineId);

  if (!timeline) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_TIMELINE_NOT_FOUND', `Timeline ${timelineId} not found`, {
      projectId: input.projectId,
      timelineId,
      recovery: 'Pass a valid source.timelineId or use the active timeline',
    }));
  }

  const timelineFingerprint = timeline ? computeProductionTimelineFingerprint(timeline) : '';
  const durationInFrames = timeline ? computeTimelineDurationInFrames(timeline) : 0;

  if (timeline && durationInFrames <= 0) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_TIMELINE_EMPTY', 'Timeline has no renderable duration', {
      timelineId,
      recovery: 'Assemble scenes/narration before production render',
    }));
  }

  let startFrame = 0;
  let endFrame = durationInFrames;
  let videoPlanMeta: ProductionRenderPlanV1['source']['videoPlan'];
  let narrationMeta: ProductionRenderPlanV1['source']['narration'];
  const allowStaging = validated.normalizedRequest?.qa?.allowStagingDependencies === true;

  const deps = inspectDependencies(input.project, timeline, allowStaging);
  errors.push(...deps.errors);
  warnings.push(...deps.warnings);

  if (validated.normalizedRequest && timeline) {
    const range = validated.normalizedRequest.source.range;
    if (range.mode === 'frames') {
      startFrame = range.startFrame;
      endFrame = range.endFrame;
      if (endFrame > durationInFrames) {
        errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_RANGE_INVALID', 'endFrame exceeds timeline duration', {
          path: 'source.range.endFrame',
          details: { endFrame, durationInFrames },
          recovery: 'Do not auto-clamp; choose a range within the timeline',
        }));
      }
    } else if (range.mode === 'video-plan-assembly') {
      const planPayload = findVideoPlanOnTimeline(timeline, range.planId);
      const inspection = inspectVideoPlanAssembly({
        plan: planPayload ?? {
          schemaVersion: '1.0.0',
          id: range.planId,
          name: 'missing',
          output: { width: timeline.width, height: timeline.height, fps: timeline.fps, fit: 'contain' },
          placement: { mode: 'append' },
          scenes: [],
        },
        timeline: {
          id: timeline.id,
          name: timeline.name ?? timeline.id,
          width: timeline.width,
          height: timeline.height,
          fps: timeline.fps,
          fit: timeline.fit as 'contain' | undefined,
          items: timeline.items as never,
          transitions: timeline.transitions as never,
          markers: timeline.markers as never,
          tracks: timeline.tracks as never,
        },
      });
      if (inspection.status !== 'complete' || inspection.planHash !== range.planHash) {
        const code = inspection.status === 'not-assembled' || inspection.foundSceneCount === 0
          ? 'PRODUCTION_RENDER_VIDEO_ASSEMBLY_NOT_FOUND'
          : 'PRODUCTION_RENDER_VIDEO_ASSEMBLY_DRIFTED';
        errors.push(productionRenderDiagnostic('error', code, `VideoPlan assembly not ready (${inspection.status})`, {
          details: { expectedHash: range.planHash, actualHash: inspection.planHash, status: inspection.status },
          recovery: 'Re-assemble the VideoPlan and use the current planHash',
        }));
      } else {
        const clips = timeline.items.filter((item) => {
          const meta = item.props?.__betterChatCutVideoPlan as { planId?: string; planHash?: string } | undefined;
          return meta?.planId === range.planId && meta?.planHash === range.planHash;
        });
        startFrame = Math.min(...clips.map((c) => c.startFrame));
        endFrame = Math.max(...clips.map((c) => c.startFrame + c.durationInFrames));
        videoPlanMeta = {
          planId: inspection.planId,
          planHash: inspection.planHash,
          assemblyId: inspection.assemblyId ?? `assembly.${inspection.planId}`,
          status: 'complete',
        };
      }
    }
  }

  const subtitleResult = resolveSubtitles(validated.normalizedRequest, startFrame, endFrame, timeline, errors);
  if (validated.normalizedRequest) {
    const narr = extractNarrationIdentity(timeline, validated.normalizedRequest);
    if (narr.error) errors.push(narr.error);
    narrationMeta = narr.meta;
  }

  const profileResult = timeline && validated.normalizedRequest
    ? resolveProductionRenderProfile({
      profile: validated.normalizedRequest.profile,
      timelineWidth: timeline.width,
      timelineHeight: timeline.height,
      fps: timeline.fps,
    })
    : { errors: [] as ProductionRenderDiagnostic[] };
  errors.push(...profileResult.errors);

  const blocking = errors.filter((e) => e.severity === 'error');
  const warnOnly = [...warnings, ...errors.filter((e) => e.severity === 'warning')];

  const preflight: ProductionPreflightReportV1 = {
    ready: false,
    project: { projectId: input.projectId, projectFingerprint },
    timeline: {
      timelineId: timelineId ?? '',
      timelineFingerprint,
      width: timeline?.width ?? 0,
      height: timeline?.height ?? 0,
      fps: timeline?.fps ?? 0,
      startFrame,
      endFrame,
      durationInFrames: Math.max(0, endFrame - startFrame),
    },
    videoPlan: {
      required: validated.normalizedRequest?.source.range.mode === 'video-plan-assembly',
      status: videoPlanMeta?.status,
      planId: videoPlanMeta?.planId,
      planHash: videoPlanMeta?.planHash,
    },
    narration: {
      expected: Boolean(narrationMeta) || subtitleResult.policy.source.type === 'narration-timing',
      status: narrationMeta?.status,
      timingHash: narrationMeta?.timingHash,
      audioItems: deps.audioItems,
      captionReady: subtitleResult.sourceReady,
    },
    dependencies: {
      sceneClips: deps.sceneClips,
      readySceneClips: deps.readySceneClips,
      invalidSceneClips: deps.invalidSceneClips,
      mediaAssets: deps.mediaAssets,
      missingMediaAssets: deps.missingMediaAssets,
      runtimeDependencies: deps.runtimeDependencies,
      missingRuntimeDependencies: deps.missingRuntimeDependencies,
      deprecatedDependencies: deps.deprecatedDependencies,
      stagingDependencies: deps.stagingDependencies,
    },
    subtitles: {
      requestedSrt: subtitleResult.policy.includeSrt,
      requestedVtt: subtitleResult.policy.includeVtt,
      sourceReady: subtitleResult.sourceReady,
      cueCount: subtitleResult.policy.cueCount,
      mp4CaptionsVisible: Boolean(timeline?.captions?.enabled ?? timeline?.captions),
    },
    errors: blocking,
    warnings: warnOnly,
  };

  preflight.ready = blocking.length === 0 && Boolean(validated.valid && profileResult.profile && timeline);

  if (!preflight.ready || !validated.normalizedRequest || !profileResult.profile || !timeline) {
    return { valid: false, preflight, errors: blocking, warnings: warnOnly };
  }

  const requestHash = computeProductionRenderRequestHash(validated.normalizedRequest);
  const revision = computeProductionRenderRevision();
  const delivery = {
    ...DEFAULT_PRODUCTION_DELIVERY_POLICY,
    ...validated.normalizedRequest.delivery,
    baseName: validated.normalizedRequest.delivery?.baseName ?? validated.normalizedRequest.id,
  };
  const qa = validated.normalizedRequest.qa as ProductionQaPolicyV1;

  const planWithoutHash = {
    schemaVersion: '1.0.0' as const,
    id: validated.normalizedRequest.id,
    name: validated.normalizedRequest.name,
    ...(validated.normalizedRequest.description ? { description: validated.normalizedRequest.description } : {}),
    requestHash,
    productionRenderRevision: revision,
    source: {
      projectId: input.projectId,
      projectFingerprint,
      timelineId: timeline.id,
      timelineFingerprint,
      range: {
        startFrame,
        endFrame,
        durationInFrames: endFrame - startFrame,
      },
      timeline: {
        width: timeline.width,
        height: timeline.height,
        fps: timeline.fps,
      },
      ...(videoPlanMeta ? { videoPlan: videoPlanMeta } : {}),
      ...(narrationMeta ? { narration: narrationMeta } : {}),
    },
    profile: profileResult.profile,
    subtitles: subtitleResult.policy,
    qa,
    delivery,
    bundleId: '',
  };
  const planHash = computeProductionRenderPlanHash(planWithoutHash);
  const bundleId = computeBundleId(validated.normalizedRequest.id, planHash);
  const plan: ProductionRenderPlanV1 = {
    ...planWithoutHash,
    planHash,
    bundleId,
    preparedAt: input.preparedAt ?? '1970-01-01T00:00:00.000Z',
  };

  return {
    valid: true,
    plan,
    preflight: { ...preflight, ready: true },
    errors: [],
    warnings: warnOnly,
  };
}

function resolveTimelineId(project: ProductionProjectLike, requested?: string): string {
  if (requested && project.timelines.some((t) => t.id === requested)) return requested;
  return project.activeTimelineId || project.timelines[0]?.id || '';
}

function findVideoPlanOnTimeline(timeline: ProductionTimelineLike, planId: string): unknown | null {
  for (const item of timeline.items) {
    const meta = item.props?.__betterChatCutVideoPlan as { planId?: string; plan?: unknown } | undefined;
    if (meta?.planId === planId && meta.plan) return meta.plan;
  }
  return null;
}

function resolveSubtitles(
  request: ProductionRenderRequestV1 | undefined,
  startFrame: number,
  endFrame: number,
  timeline: ProductionTimelineLike | undefined,
  errors: ProductionRenderDiagnostic[],
): { policy: ResolvedProductionSubtitlePolicyV1; sourceReady: boolean } {
  const base = request?.subtitles ?? {
    includeSrt: true,
    includeVtt: true,
    source: { type: 'none' as const },
    timeOrigin: 'render-range' as const,
    requireCaptionTrackMatch: true,
  };
  let cueCount: number | undefined;
  let sourceReady = base.source.type === 'none';

  if ((base.includeSrt || base.includeVtt) && base.source.type === 'none') {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_CAPTION_SOURCE_INVALID', 'SRT/VTT requested but subtitle source is none', {
      recovery: 'Set subtitles.source to narration-timing or project-caption-track, or disable includeSrt/includeVtt',
    }));
  }

  if (base.source.type === 'narration-timing') {
    const snap = base.source.timingSnapshot as NarrationTimingSnapshotV1;
    const fps = timeline?.fps || 30;
    const startMs = (startFrame / fps) * 1000;
    const endMs = (endFrame / fps) * 1000;
    const cues = buildSubtitleCues({
      words: snap.captionWords ?? [],
      pacing: 'phrase',
    }).filter((c) => c.endMs > startMs && c.startMs < endMs);
    cueCount = cues.length;
    sourceReady = true;
  } else if (base.source.type === 'project-caption-track') {
    const captions = timeline?.captions;
    const hash = sha256Hex(stableStringify(captions ?? null));
    if (hash !== base.source.expectedCaptionsHash) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_CAPTION_SOURCE_INVALID', 'Caption track hash mismatch', {
        recovery: 'Re-read captions and update expectedCaptionsHash',
      }));
      sourceReady = false;
    } else {
      sourceReady = true;
      cueCount = Array.isArray(captions?.words) ? captions!.words!.length : 0;
    }
  }

  return {
    sourceReady,
    policy: {
      includeSrt: base.includeSrt,
      includeVtt: base.includeVtt,
      source: deepCloneJson(base.source),
      timeOrigin: 'render-range',
      requireCaptionTrackMatch: base.requireCaptionTrackMatch !== false,
      sourceHash: sha256Hex(stableStringify(base.source)),
      cueCount,
    },
  };
}

function extractNarrationIdentity(timeline: ProductionTimelineLike | undefined, request: ProductionRenderRequestV1): {
  meta?: ProductionRenderPlanV1['source']['narration'];
  error?: ProductionRenderDiagnostic;
} {
  if (request.subtitles?.source.type !== 'narration-timing') return {};
  const snap = request.subtitles.source.timingSnapshot;
  if (!timeline) return {};
  const items = timeline.items.filter((item) => {
    const meta = item.props?.[BETTER_CHAT_CUT_NARRATION_PROPS_KEY] as
      | { narrationPlanId?: string; timingHash?: string }
      | undefined;
    return meta?.narrationPlanId === snap.narrationPlanId;
  });
  if (!items.length) {
    return {
      error: productionRenderDiagnostic('error', 'PRODUCTION_RENDER_NARRATION_NOT_FOUND', 'Narration timing not applied on timeline', {
        recovery: 'Apply narration_apply_timeline before production render',
      }),
    };
  }
  const matching = items.filter((item) => {
    const meta = item.props?.[BETTER_CHAT_CUT_NARRATION_PROPS_KEY] as { timingHash?: string } | undefined;
    return meta?.timingHash === snap.timingHash;
  });
  if (!matching.length) {
    return {
      error: productionRenderDiagnostic('error', 'PRODUCTION_RENDER_NARRATION_DRIFTED', 'Narration timing hash drifted', {
        recovery: 'Re-apply narration with the current timing snapshot',
      }),
    };
  }
  return {
    meta: {
      narrationPlanId: snap.narrationPlanId,
      narrationPlanHash: snap.narrationPlanHash,
      timingHash: snap.timingHash,
      status: 'complete',
    },
  };
}

function inspectDependencies(
  project: ProductionProjectLike,
  timeline: ProductionTimelineLike | undefined,
  allowStaging: boolean,
) {
  const errors: ProductionRenderDiagnostic[] = [];
  const warnings: ProductionRenderDiagnostic[] = [];
  let sceneClips = 0;
  let readySceneClips = 0;
  let invalidSceneClips = 0;
  let runtimeDependencies = 0;
  let missingRuntimeDependencies = 0;
  let deprecatedDependencies = 0;
  let stagingDependencies = 0;
  let audioItems = 0;
  const assetIds = new Set((project.assets ?? []).map((a) => a.id));
  let missingMediaAssets = 0;

  for (const item of timeline?.items ?? []) {
    if (item.kind === 'audio') audioItems += 1;
    if (item.assetId && !assetIds.has(item.assetId) && !item.src) {
      missingMediaAssets += 1;
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_MEDIA_MISSING', `Missing media asset ${item.assetId}`, {
        recovery: 'Restore the media asset before production render',
      }));
    }

    const isScene = item.kind === 'motion-graphic'
      && item.templateId === BETTER_CHAT_CUT_SCENE_TEMPLATE_ID
      && item.props
      && BETTER_CHAT_CUT_SCENE_PROPS_KEY in item.props;
    if (!isScene) continue;

    sceneClips += 1;
    const parsed = parseSceneClipBinding(item as never);
    if (!parsed.binding || parsed.errors.length) {
      invalidSceneClips += 1;
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SCENE_CLIP_NOT_READY', `Scene clip ${item.id} binding invalid`, {
        recovery: 'Re-bind or sync the scene clip',
      }));
      continue;
    }
    readySceneClips += 1;
    for (const dep of parsed.binding.dependencies.assets) {
      runtimeDependencies += 1;
      if (dep.status === 'staging') {
        stagingDependencies += 1;
        if (!allowStaging) {
          errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_STAGING_DEPENDENCY_NOT_ALLOWED', `Staging dependency ${dep.id} not allowed`, {
            recovery: 'Publish the runtime or set qa.allowStagingDependencies=true',
          }));
        } else {
          warnings.push(productionRenderDiagnostic('warning', 'PRODUCTION_RENDER_STAGING_DEPENDENCY_NOT_ALLOWED', `Staging dependency ${dep.id} allowed explicitly`));
        }
      } else if (dep.status === 'deprecated') {
        deprecatedDependencies += 1;
        warnings.push(productionRenderDiagnostic('warning', 'PRODUCTION_RENDER_RUNTIME_MISSING', `Deprecated dependency ${dep.id}`, {
          recovery: 'Migrate to a published non-deprecated asset version',
        }));
      }
    }
  }

  return {
    sceneClips,
    readySceneClips,
    invalidSceneClips,
    mediaAssets: project.assets?.length ?? 0,
    missingMediaAssets,
    runtimeDependencies,
    missingRuntimeDependencies,
    deprecatedDependencies,
    stagingDependencies,
    audioItems,
    errors,
    warnings,
  };
}

export function createProductionRenderPreparationService() {
  return { prepare: prepareProductionRender };
}
