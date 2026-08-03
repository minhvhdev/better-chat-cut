import type { AgentToolSchema } from '../../tool-schema';

export const SCENE_CLIP_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'scene_clip_list',
    description: 'List Better Chat Cut scene clips on the edit-session draft timelines. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        timelineId: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'scene_clip_get',
    description: 'Get one Better Chat Cut scene clip binding, fingerprint, readiness, and clip metadata from the edit-session draft.',
    input_schema: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
        includeEmbeddedScene: { type: 'boolean', description: 'Defaults to true' },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'scene_clip_compare',
    description: 'Compare an embedded scene clip binding with an optional current draft binding payload. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
        currentDraftBinding: { type: 'object', additionalProperties: true },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'scene_clip_bind',
    description: 'Bind a SceneClipBindingV1 payload onto the active timeline as a motion-graphic scene clip. Draft-only until review_edit_session applies.',
    input_schema: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        binding: { type: 'object', additionalProperties: true },
        track: { type: 'string' },
        startFrame: { type: 'number' },
        ripple: { type: 'boolean' },
        name: { type: 'string' },
      },
      required: ['requestId', 'binding'],
    },
  },
  {
    name: 'scene_clip_sync',
    description: 'Sync an existing Better Chat Cut scene clip with a new binding payload. Preserves track/start/transforms by default.',
    input_schema: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        itemId: { type: 'string' },
        expectedItemFingerprint: { type: 'string' },
        expectedBindingPayloadHash: { type: 'string' },
        binding: { type: 'object', additionalProperties: true },
        timingPolicy: { type: 'string', enum: ['preserve-timeline', 'match-scene'] },
        namePolicy: { type: 'string', enum: ['preserve', 'match-draft'] },
      },
      required: ['requestId', 'itemId', 'expectedItemFingerprint', 'expectedBindingPayloadHash', 'binding'],
    },
  },
  {
    name: 'scene_clip_validate',
    description: 'Validate readiness of a Better Chat Cut scene clip on the edit-session draft. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
      },
      required: ['itemId'],
    },
  },
];

export const SCENE_CLIP_TOOL_NAMES = new Set(SCENE_CLIP_TOOL_SCHEMAS.map((tool) => tool.name));
