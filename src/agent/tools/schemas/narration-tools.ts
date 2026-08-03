import type { AgentToolSchema } from '../../tool-schema';

export const NARRATION_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'narration_voiceover_align',
    description: 'Align a project voice-over media asset or timeline item transcript to NarrationPlan segments. Read-only; does not mutate the proposal draft.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        narrationPlan: { type: 'object' },
        voiceoverSource: { type: 'object' },
        mode: { type: 'string', enum: ['transcript', 'manual'] },
        overrides: { type: 'array' },
      },
      required: ['narrationPlan', 'voiceoverSource'],
    },
  },
  {
    name: 'narration_preview_timeline',
    description: 'Preview narration audio/caption/visual retime apply on the active edit-session timeline. Read-only.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        timingSnapshot: { type: 'object' },
        audioTrack: { type: 'string' },
        captionTrack: { type: 'string' },
        timingConflictPolicy: { type: 'string', enum: ['require-clear', 'ripple-after-assembly'] },
        replaceTemporaryTts: { type: 'boolean' },
      },
      required: ['timingSnapshot'],
    },
  },
  {
    name: 'narration_apply_timeline',
    description: 'Apply narration audio, captions, and visual retiming as one atomic proposal batch. Idempotent by requestId.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        timingSnapshot: { type: 'object' },
        audioTrack: { type: 'string' },
        captionTrack: { type: 'string' },
        timingConflictPolicy: { type: 'string', enum: ['require-clear', 'ripple-after-assembly'] },
        replaceTemporaryTts: { type: 'boolean' },
      },
      required: ['requestId', 'timingSnapshot'],
    },
  },
  {
    name: 'narration_validate_timeline',
    description: 'Inspect narration timeline completeness/drift against a timing snapshot.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        timingSnapshot: { type: 'object' },
        mode: { type: 'string', enum: ['metadata-only', 'sample-frames'] },
      },
      required: ['timingSnapshot'],
    },
  },
  {
    name: 'narration_export_subtitles',
    description: 'Export SRT and/or WebVTT from a narration timing snapshot.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        timingSnapshot: { type: 'object' },
        formats: { type: 'array', items: { type: 'string', enum: ['srt', 'vtt'] } },
        timeOrigin: { type: 'string', enum: ['timeline', 'narration-assembly'] },
      },
      required: ['timingSnapshot'],
    },
  },
];

export const NARRATION_TOOL_NAMES = new Set(NARRATION_TOOL_SCHEMAS.map((tool) => tool.name));
