import {
  createNarrationPlanService,
  computeNarrationRuntimeRevision,
  NARRATION_PLAN_SCHEMA_VERSION,
  MAX_NARRATION_SCENES,
  MAX_NARRATION_SEGMENTS,
  MAX_NARRATION_SPEAKERS,
  MAX_NARRATION_PLAN_SERIALIZED_BYTES,
  MAX_TTS_CONCURRENT_REQUESTS,
  NARRATION_TTS_PROVIDERS,
  SCENE_DURATION_POLICIES,
  NarrationError,
  resolveTemporaryTtsTiming,
  buildSceneAudioTimingFromSegments,
  validateNarrationPlan,
} from '../../../packages/narration-plans/src/index.ts';
import {
  createNarrationSynthesisService,
  computeNarrationSynthesisInputHash,
  type NarrationSynthesisService,
} from '../../../packages/narration-audio/src/index.ts';
import { BETTER_CHAT_CUT_NARRATION_PROPS_KEY } from '../../../packages/project-narration/src/index.ts';
import { BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY } from '../../../packages/project-video-assembly/src/contracts/assembly-metadata.ts';
import { BETTER_CHAT_CUT_SCENE_PROPS_KEY } from '../../../packages/project-scene-bindings/src/contracts/scene-clip-item.ts';
import { sha256Hex, stableStringify } from '../../../packages/narration-plans/src/schema/narration-serialization.ts';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeIdempotentOpen = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const writeIdempotent = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const NARRATION_CONTROL_TOOLS = [
  {
    name: 'narration_get_contract',
    description: 'Return Better Chat Cut NarrationPlanV1 contract: schema, TTS dry-run, timing policies, voice-over alignment, captions/SRT/VTT, edit-session workflow, limits. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['summary', 'full'] },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'narration_plan_validate',
    description: 'Validate and normalize a NarrationPlanV1 with embedded VideoPlanV1. Read-only; does not call TTS or mutate projects.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        narrationPlan: {},
        includeNormalizedPlan: { type: 'boolean' },
      },
      required: ['narrationPlan'],
    },
    annotations: readOnly,
  },
  {
    name: 'narration_tts_prepare',
    description: 'Prepare temporary TTS for NarrationPlan segments. dryRun=true by default (no provider calls). Apply submits synthesis via allowlisted providers/generation jobs. Never pass API keys.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        narrationPlan: { type: 'object' },
        sceneEntryIds: { type: 'array', items: { type: 'string' } },
        segmentIds: { type: 'array', items: { type: 'string' } },
        dryRun: { type: 'boolean' },
        forceRegenerate: { type: 'boolean' },
      },
      required: ['requestId', 'narrationPlan'],
    },
    annotations: writeIdempotentOpen,
  },
  {
    name: 'narration_tts_status',
    description: 'Query temporary TTS preparation status for a narration plan hash. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        narrationPlanId: { type: 'string' },
        narrationPlanHash: { type: 'string' },
      },
      required: ['narrationPlanId', 'narrationPlanHash'],
    },
    annotations: readOnly,
  },
  {
    name: 'narration_timing_resolve',
    description: 'Resolve NarrationTimingSnapshotV1 from completed temporary TTS artifacts. Does not call providers or mutate projects.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        narrationPlan: { type: 'object' },
      },
      required: ['narrationPlan'],
    },
    annotations: readOnly,
  },
] as const;

export const NARRATION_PROJECT_TOOLS = [
  {
    name: 'narration_voiceover_align',
    description: 'Align a project voice-over media/item transcript to NarrationPlan segments. Requires editSessionId. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        narrationPlan: { type: 'object' },
        voiceoverSource: { type: 'object' },
        mode: { type: 'string', enum: ['transcript', 'manual'] },
        overrides: { type: 'array' },
      },
      required: ['editSessionId', 'narrationPlan', 'voiceoverSource'],
    },
    annotations: readOnly,
  },
  {
    name: 'narration_preview_timeline',
    description: 'Preview narration audio/caption/visual retime apply on the edit-session draft. Requires editSessionId. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        timingSnapshot: { type: 'object' },
        audioTrack: { type: 'string' },
        captionTrack: { type: 'string' },
        timingConflictPolicy: { type: 'string', enum: ['require-clear', 'ripple-after-assembly'] },
        replaceTemporaryTts: { type: 'boolean' },
      },
      required: ['editSessionId', 'timingSnapshot'],
    },
    annotations: readOnly,
  },
  {
    name: 'narration_apply_timeline',
    description: 'Apply narration audio, captions, and visual retiming as one atomic edit-session batch. Requires editSessionId + requestId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        timingSnapshot: { type: 'object' },
        audioTrack: { type: 'string' },
        captionTrack: { type: 'string' },
        timingConflictPolicy: { type: 'string', enum: ['require-clear', 'ripple-after-assembly'] },
        replaceTemporaryTts: { type: 'boolean' },
      },
      required: ['editSessionId', 'requestId', 'timingSnapshot'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'narration_validate_timeline',
    description: 'Inspect narration timeline completeness/drift and optional render readiness. Requires editSessionId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        timingSnapshot: { type: 'object' },
        mode: { type: 'string', enum: ['metadata-only', 'sample-frames'] },
      },
      required: ['editSessionId', 'timingSnapshot'],
    },
    annotations: readOnly,
  },
  {
    name: 'narration_export_subtitles',
    description: 'Export SRT/WebVTT from a narration timing snapshot (timeline or narration-assembly origin). Requires editSessionId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        timingSnapshot: { type: 'object' },
        formats: { type: 'array', items: { type: 'string', enum: ['srt', 'vtt'] } },
        timeOrigin: { type: 'string', enum: ['timeline', 'narration-assembly'] },
      },
      required: ['editSessionId', 'timingSnapshot'],
    },
    annotations: readOnly,
  },
] as const;

export const NARRATION_TOOLS = [...NARRATION_CONTROL_TOOLS, ...NARRATION_PROJECT_TOOLS] as const;

const planService = createNarrationPlanService();
let synthesisService: NarrationSynthesisService | null = null;

export function getNarrationSynthesisService(): NarrationSynthesisService {
  if (!synthesisService) {
    synthesisService = createNarrationSynthesisService({
      // Default: fake provider so control-tool verifies never hit external APIs.
      // Production callers can inject a real adapter via createNarrationSynthesisService.
    });
  }
  return synthesisService;
}

export function setNarrationSynthesisServiceForTests(service: NarrationSynthesisService | null): void {
  synthesisService = service;
}

function getContract(format: 'summary' | 'full' = 'summary') {
  const summary = {
    schemaVersion: NARRATION_PLAN_SCHEMA_VERSION,
    narrationRuntimeRevision: computeNarrationRuntimeRevision(),
    reservedScenePropsKey: BETTER_CHAT_CUT_SCENE_PROPS_KEY,
    reservedVideoPlanPropsKey: BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY,
    reservedNarrationPropsKey: BETTER_CHAT_CUT_NARRATION_PROPS_KEY,
    projectSchemaChanged: false,
    providers: NARRATION_TTS_PROVIDERS,
    sceneDurationPolicies: SCENE_DURATION_POLICIES,
    controlTools: NARRATION_CONTROL_TOOLS.map((t) => t.name),
    projectTools: NARRATION_PROJECT_TOOLS.map((t) => t.name),
    limits: {
      maxScenes: MAX_NARRATION_SCENES,
      maxSegments: MAX_NARRATION_SEGMENTS,
      maxSpeakers: MAX_NARRATION_SPEAKERS,
      maxSerializedBytes: MAX_NARRATION_PLAN_SERIALIZED_BYTES,
      maxConcurrentTts: MAX_TTS_CONCURRENT_REQUESTS,
    },
    secretsPolicy: 'Never pass API keys in NarrationPlan, MCP payloads, receipts, or project docs. Credentials resolve from environment/config only.',
  };
  if (format === 'summary') return summary;
  return {
    ...summary,
    workflow: [
      'video_plan_validate + video_plan_assemble',
      'build NarrationPlanV1 with embedded VideoPlan',
      'narration_plan_validate',
      'narration_tts_prepare dryRun=true',
      'narration_tts_prepare dryRun=false',
      'narration_tts_status',
      'narration_timing_resolve',
      'target_project + begin_edit_session',
      'narration_preview_timeline',
      'narration_apply_timeline',
      'narration_validate_timeline',
      'narration_export_subtitles',
      'optional narration_voiceover_align + replaceTemporaryTts',
      'review_edit_session',
    ],
    limitations: [
      'No AI script/research/storyboard generation',
      'No new ASR/TTS providers',
      'No production MP4 export bundle (M5C)',
      'No music/SFX/ducking/mastering',
      'Default unit tests use fake TTS provider',
    ],
  };
}

export async function runNarrationControlTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'narration_get_contract') {
    return getContract(args.format === 'full' ? 'full' : 'summary');
  }
  if (name === 'narration_plan_validate') {
    const result = planService.validate(args.narrationPlan);
    return {
      valid: result.valid,
      narrationPlanId: result.normalizedPlan?.id,
      narrationPlanHash: result.narrationPlanHash,
      narrationRuntimeRevision: result.narrationRuntimeRevision,
      ...(args.includeNormalizedPlan === true ? { normalizedPlan: result.normalizedPlan } : {}),
      errors: result.errors,
      warnings: result.warnings,
    };
  }
  if (name === 'narration_tts_prepare') {
    const service = getNarrationSynthesisService();
    return service.prepare({
      requestId: String(args.requestId ?? ''),
      narrationPlan: args.narrationPlan,
      sceneEntryIds: Array.isArray(args.sceneEntryIds) ? args.sceneEntryIds.map(String) : undefined,
      segmentIds: Array.isArray(args.segmentIds) ? args.segmentIds.map(String) : undefined,
      dryRun: args.dryRun !== false,
      forceRegenerate: args.forceRegenerate === true,
    });
  }
  if (name === 'narration_tts_status') {
    const service = getNarrationSynthesisService();
    return service.getStatus({
      narrationPlanId: String(args.narrationPlanId ?? ''),
      narrationPlanHash: String(args.narrationPlanHash ?? ''),
    });
  }
  if (name === 'narration_timing_resolve') {
    const validated = validateNarrationPlan(args.narrationPlan);
    if (!validated.valid || !validated.normalizedPlan || !validated.narrationPlanHash) {
      return {
        timingSnapshot: null,
        missingSegmentIds: [],
        errors: validated.errors,
        warnings: validated.warnings,
      };
    }
    const service = getNarrationSynthesisService();
    const artifacts = service.collectCompletedArtifacts(validated.normalizedPlan, validated.narrationPlanHash);
    const segmentMap = new Map(
      [...artifacts.entries()].map(([segmentId, art]) => [segmentId, {
        durationMs: art.durationMs,
        words: art.wordTiming.words,
        timingQuality: art.wordTiming.quality,
        audioArtifactId: art.artifactId,
      }]),
    );
    const sceneAudios = buildSceneAudioTimingFromSegments({
      narrationPlan: validated.normalizedPlan,
      segmentArtifacts: segmentMap,
    });
    const manifestHash = sha256Hex(stableStringify([...artifacts.values()].map((a) => a.artifactHash).sort()));
    return resolveTemporaryTtsTiming({
      narrationPlan: validated.normalizedPlan,
      sceneAudios,
      synthesisManifestHash: manifestHash,
    });
  }
  throw new NarrationError('NARRATION_SCHEMA_UNSUPPORTED', `Unknown narration control tool ${name}`);
}

export function isNarrationProjectTool(name: string): boolean {
  return NARRATION_PROJECT_TOOLS.some((tool) => tool.name === name);
}

export { NarrationError, computeNarrationSynthesisInputHash };
