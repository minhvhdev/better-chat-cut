import type { AgentToolSchema } from '../../tool-schema';

export const VIDEO_PLAN_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'video_plan_preview_assembly',
    description: 'Preview how a VideoPlanV1 would assemble onto the active edit-session timeline (track, collisions, absolute schedule). Read-only; does not mutate the proposal draft.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plan: { type: 'object', description: 'VideoPlanV1 object with embedded SceneClipBindingV1 per scene' },
      },
      required: ['plan'],
    },
  },
  {
    name: 'video_plan_assemble',
    description: 'Assemble a multi-scene VideoPlanV1 onto the active edit-session proposal draft as one atomic batch (clips, transitions, markers). Idempotent by requestId. Does not review/apply the session.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128, description: 'Stable idempotency key ^[A-Za-z0-9._-]{1,128}$' },
        plan: { type: 'object', description: 'VideoPlanV1 object' },
      },
      required: ['requestId', 'plan'],
    },
  },
  {
    name: 'video_plan_inspect_assembly',
    description: 'Inspect whether a VideoPlanV1 is completely assembled on the edit-session draft/live timeline and report drift.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plan: { type: 'object', description: 'VideoPlanV1 object' },
      },
      required: ['plan'],
    },
  },
  {
    name: 'video_plan_validate_render',
    description: 'Validate assembly readiness and optionally render TimelineComposition sample frames / contact sheet for the proposal draft. Does not submit export jobs.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plan: { type: 'object', description: 'VideoPlanV1 object' },
        mode: { type: 'string', enum: ['metadata-only', 'sample-frames'] },
        columns: { type: 'number', minimum: 1, maximum: 8 },
        includeTransitionSamples: { type: 'boolean' },
      },
      required: ['plan'],
    },
  },
];

export const VIDEO_PLAN_TOOL_NAMES = new Set(VIDEO_PLAN_TOOL_SCHEMAS.map((tool) => tool.name));
