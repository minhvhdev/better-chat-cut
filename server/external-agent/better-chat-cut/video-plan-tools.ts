import {
  createVideoPlanService,
  computeVideoPlanRuntimeRevision,
  VIDEO_PLAN_SCHEMA_VERSION,
  MAX_VIDEO_PLAN_SCENES,
  MAX_VIDEO_PLAN_DURATION_FRAMES,
  MAX_GAP_AFTER_FRAMES,
  MAX_TRANSITION_DURATION_FRAMES,
  MAX_RENDER_VALIDATION_SAMPLE_FRAMES,
  MAX_VIDEO_PLAN_SERIALIZED_BYTES,
  VIDEO_PLAN_VISUAL_TRANSITION_TYPES,
  VideoPlanError,
} from '../../../packages/video-plans/src/index.ts';
import { BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY } from '../../../packages/project-video-assembly/src/contracts/assembly-metadata.ts';
import { BETTER_CHAT_CUT_SCENE_PROPS_KEY } from '../../../packages/project-scene-bindings/src/contracts/scene-clip-item.ts';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeIdempotent = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const VIDEO_PLAN_CONTROL_TOOLS = [
  {
    name: 'video_plan_get_contract',
    description: 'Return Better Chat Cut VideoPlanV1 contract: schema, schedule, transitions, markers, assembly/edit-session workflow, limits. Read-only.',
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
    name: 'video_plan_validate',
    description: 'Validate and optionally schedule a VideoPlanV1 with embedded SceneClipBindingV1 snapshots. Read-only; does not read projects or scene drafts.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plan: {},
        includeNormalizedPlan: { type: 'boolean' },
        includeSchedule: { type: 'boolean' },
      },
      required: ['plan'],
    },
    annotations: readOnly,
  },
] as const;

export const VIDEO_PLAN_PROJECT_TOOLS = [
  {
    name: 'video_plan_preview_assembly',
    description: 'Preview VideoPlan assembly on the active edit-session timeline. Requires editSessionId. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        plan: { type: 'object' },
      },
      required: ['editSessionId', 'plan'],
    },
    annotations: readOnly,
  },
  {
    name: 'video_plan_assemble',
    description: 'Assemble VideoPlan into the edit-session proposal draft as one atomic undoable batch. Requires editSessionId + requestId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        plan: { type: 'object' },
      },
      required: ['editSessionId', 'requestId', 'plan'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'video_plan_inspect_assembly',
    description: 'Inspect VideoPlan assembly completeness/drift on the edit-session draft. Requires editSessionId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        plan: { type: 'object' },
      },
      required: ['editSessionId', 'plan'],
    },
    annotations: readOnly,
  },
  {
    name: 'video_plan_validate_render',
    description: 'Validate render readiness / sample TimelineComposition frames for an assembled VideoPlan on the edit-session draft. Requires editSessionId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        editSessionId: { type: 'string', minLength: 1 },
        plan: { type: 'object' },
        mode: { type: 'string', enum: ['metadata-only', 'sample-frames'] },
        columns: { type: 'number', minimum: 1, maximum: 8 },
        includeTransitionSamples: { type: 'boolean' },
      },
      required: ['editSessionId', 'plan'],
    },
    annotations: readOnly,
  },
] as const;

export const VIDEO_PLAN_TOOLS = [...VIDEO_PLAN_CONTROL_TOOLS, ...VIDEO_PLAN_PROJECT_TOOLS] as const;

function getContract(format: 'summary' | 'full' = 'summary') {
  const summary = {
    schemaVersion: VIDEO_PLAN_SCHEMA_VERSION,
    videoPlanRuntimeRevision: computeVideoPlanRuntimeRevision(),
    reservedScenePropsKey: BETTER_CHAT_CUT_SCENE_PROPS_KEY,
    reservedVideoPlanPropsKey: BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY,
    bindingMode: 'embedded-SceneClipBindingV1-snapshot',
    projectSchemaChanged: false,
    controlTools: VIDEO_PLAN_CONTROL_TOOLS.map((tool) => tool.name),
    projectTools: VIDEO_PLAN_PROJECT_TOOLS.map((tool) => tool.name),
    limits: {
      maxScenes: MAX_VIDEO_PLAN_SCENES,
      maxDurationFrames: MAX_VIDEO_PLAN_DURATION_FRAMES,
      maxGapAfterFrames: MAX_GAP_AFTER_FRAMES,
      maxTransitionDurationFrames: MAX_TRANSITION_DURATION_FRAMES,
      maxSampleFrames: MAX_RENDER_VALIDATION_SAMPLE_FRAMES,
      maxSerializedBytes: MAX_VIDEO_PLAN_SERIALIZED_BYTES,
    },
  };
  if (format === 'summary') return summary;
  return {
    ...summary,
    transitionTypes: VIDEO_PLAN_VISUAL_TRANSITION_TYPES,
    placementModes: ['append', 'at-frame'],
    collisionPolicies: ['require-clear', 'ripple'],
    markerModes: ['none', 'boundary', 'range', 'both'],
    durationModes: ['match-scene', 'timeline-frames'],
    workflow: [
      'scene_draft_get_binding_payload for each scene',
      'build VideoPlanV1',
      'video_plan_validate',
      'target_project',
      'begin_edit_session',
      'video_plan_preview_assembly',
      'video_plan_assemble',
      'video_plan_inspect_assembly',
      'video_plan_validate_render',
      'review_edit_session',
      'get_edit_session until applied/rejected/discarded',
    ],
    examplePlan: {
      schemaVersion: '1.0.0',
      id: 'video-plan.example-three-scene',
      name: 'Example three-scene plan',
      output: { width: 1920, height: 1080, fps: 30, fit: 'contain' },
      placement: { mode: 'append', collisionPolicy: 'require-clear' },
      markers: { mode: 'boundary', defaultColor: 'blue', notePrefix: 'BCC Scene' },
      scenes: [
        { id: 'intro', binding: '<SceneClipBindingV1>', transitionToNext: { mode: 'timeline-transition', type: 'cross-dissolve', durationInFrames: 15 } },
        { id: 'body', binding: '<SceneClipBindingV1>', duration: { mode: 'timeline-frames', timelineFrames: 90 }, transitionToNext: { mode: 'cut' } },
        { id: 'outro', binding: '<SceneClipBindingV1>' },
      ],
    },
    limitations: [
      'No narration/TTS/voice-over/captions/audio planning (M5B+)',
      'No VideoPlan persistence store or auto-repair sync',
      'No export job submission from MCP tools',
      'Active timeline only',
      'No custom-shader or audio-cross-fade transitions',
    ],
  };
}

const service = createVideoPlanService();

export async function runVideoPlanControlTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'video_plan_get_contract') {
    return getContract(args.format === 'full' ? 'full' : 'summary');
  }
  if (name === 'video_plan_validate') {
    const result = service.validate(args.plan);
    const includeNormalizedPlan = args.includeNormalizedPlan === true;
    const includeSchedule = args.includeSchedule !== false;
    return {
      valid: result.valid,
      planId: result.normalizedPlan?.id,
      planHash: result.planHash,
      videoPlanRuntimeRevision: result.videoPlanRuntimeRevision,
      ...(includeNormalizedPlan ? { normalizedPlan: result.normalizedPlan } : {}),
      ...(includeSchedule ? { schedule: result.schedule } : {}),
      errors: result.errors,
      warnings: result.warnings,
    };
  }
  throw new VideoPlanError('VIDEO_PLAN_SCHEMA_UNSUPPORTED', `Unknown video plan control tool ${name}`, {
    recovery: 'Use video_plan_get_contract',
  });
}

export function isVideoPlanControlTool(name: string): boolean {
  return VIDEO_PLAN_CONTROL_TOOLS.some((tool) => tool.name === name);
}

export function isVideoPlanProjectTool(name: string): boolean {
  return VIDEO_PLAN_PROJECT_TOOLS.some((tool) => tool.name === name);
}
