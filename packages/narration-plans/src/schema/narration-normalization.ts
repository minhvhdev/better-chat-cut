import type { NarrationPlanV1 } from '../contracts/narration-plan.ts';
import type { NarrationSpeakerV1, NarrationTemporaryVoiceV1 } from '../contracts/narration-speaker.ts';
import type { NarrationSceneV1 } from '../contracts/narration-scene.ts';
import type { NarrationSegmentV1 } from '../contracts/narration-segment.ts';
import type { NarrationCaptionPolicyV1, NarrationNormalizationResult } from '../contracts/narration-timing.ts';
import { narrationDiagnostic, type NarrationDiagnostic } from '../contracts/narration-errors.ts';
import { normalizeVideoPlan } from '../../../video-plans/src/schema/video-plan-normalization.ts';
import {
  CAPTION_PACING_MODES,
  DEFAULT_NARRATION_LEAD_IN_MS,
  DEFAULT_NARRATION_TAIL_OUT_MS,
  DEFAULT_SEGMENT_GAP_MS,
  LANGUAGE_TAG_PATTERN,
  MAX_NARRATION_PLAN_SERIALIZED_BYTES,
  MAX_NARRATION_SCENES,
  MAX_NARRATION_SEGMENTS,
  MAX_NARRATION_SPEAKERS,
  MAX_SEGMENT_TEXT_LENGTH,
  MAX_TIMING_MS,
  MAX_TOTAL_TEXT_LENGTH,
  NARRATION_PLAN_ID_PATTERN,
  NARRATION_PLAN_SCHEMA_VERSION,
  NARRATION_SEGMENT_ID_PATTERN,
  NARRATION_SPEAKER_ID_PATTERN,
  NARRATION_TTS_PROVIDERS,
  SCENE_DURATION_POLICIES,
  SUBTITLE_TIMING_MODES,
  type SceneDurationPolicy,
} from '../contracts/narration-policy.ts';
import {
  NARRATION_CAPTION_KNOWN_KEYS,
  NARRATION_DEFAULTS_KNOWN_KEYS,
  NARRATION_PLAN_KNOWN_ROOT_KEYS,
  NARRATION_SCENE_KNOWN_KEYS,
  NARRATION_SEGMENT_KNOWN_KEYS,
  NARRATION_SPEAKER_KNOWN_KEYS,
  NARRATION_VOICE_KNOWN_KEYS,
} from './narration-schema.ts';
import {
  deepCloneJson,
  isJsonSerializable,
  stableStringify,
  utf8ByteLength,
} from './narration-serialization.ts';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

function pushUnknownKeys(
  record: Record<string, unknown>,
  known: Set<string>,
  path: string,
  errors: NarrationDiagnostic[],
): void {
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      errors.push(narrationDiagnostic('error', 'NARRATION_UNKNOWN_FIELD', `Unknown field ${path}.${key}`, {
        path: `${path}.${key}`,
        recovery: 'Remove unknown fields',
      }));
    }
  }
}

function normalizeMs(
  value: unknown,
  path: string,
  errors: NarrationDiagnostic[],
  fallback?: number,
): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_TIMING_MS || !Number.isInteger(value)) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', `${path} must be an integer 0..${MAX_TIMING_MS}`, {
      path,
      recovery: 'Pass a non-negative integer timing in milliseconds',
    }));
    return undefined;
  }
  return value;
}

function normalizeVoice(
  raw: unknown,
  path: string,
  errors: NarrationDiagnostic[],
): NarrationTemporaryVoiceV1 | undefined {
  const record = asRecord(raw);
  if (!record) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_VOICE', 'temporaryVoice must be an object', { path }));
    return undefined;
  }
  pushUnknownKeys(record, NARRATION_VOICE_KNOWN_KEYS, path, errors);
  const provider = record.provider;
  if (typeof provider !== 'string' || !(NARRATION_TTS_PROVIDERS as readonly string[]).includes(provider)) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_PROVIDER', 'Unsupported TTS provider', {
      path: `${path}.provider`,
      recovery: 'Use elevenlabs | doubao | minimax',
    }));
    return undefined;
  }
  const voiceId = trimString(record.voiceId);
  if (!voiceId) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_VOICE', 'voiceId is required', {
      path: `${path}.voiceId`,
    }));
    return undefined;
  }
  // Reject credential-like keys if somehow present
  for (const banned of ['apiKey', 'accessToken', 'secret', 'token', 'authorization', 'baseUrl', 'endpoint']) {
    if (banned in record) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_VOICE', `Credentials / endpoints must not appear in temporaryVoice (${banned})`, {
        path: `${path}.${banned}`,
        recovery: 'Resolve credentials from environment/config only',
      }));
    }
  }
  const voice: NarrationTemporaryVoiceV1 = {
    provider: provider as NarrationTemporaryVoiceV1['provider'],
    voiceId,
  };
  if (typeof record.modelId === 'string' && record.modelId.trim()) voice.modelId = record.modelId.trim();
  for (const numKey of ['speed', 'pitch', 'volume', 'emotionScale', 'sampleRate'] as const) {
    const v = record[numKey];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_VOICE', `${numKey} must be a finite number`, {
        path: `${path}.${numKey}`,
      }));
    } else {
      (voice as Record<string, unknown>)[numKey] = v;
    }
  }
  for (const strKey of ['emotion', 'languageCode', 'languageBoost', 'outputFormat'] as const) {
    const v = record[strKey];
    if (typeof v === 'string' && v.trim()) (voice as Record<string, unknown>)[strKey] = v.trim();
  }
  if (record.subtitleTiming !== undefined) {
    if (typeof record.subtitleTiming !== 'string'
      || !(SUBTITLE_TIMING_MODES as readonly string[]).includes(record.subtitleTiming)) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_VOICE', 'subtitleTiming must be none|sentence|word', {
        path: `${path}.subtitleTiming`,
      }));
    } else {
      voice.subtitleTiming = record.subtitleTiming as NarrationTemporaryVoiceV1['subtitleTiming'];
    }
  }
  return voice;
}

function normalizeCaptionPolicy(
  raw: unknown,
  path: string,
  errors: NarrationDiagnostic[],
): NarrationCaptionPolicyV1 | undefined {
  if (raw === undefined) return undefined;
  const record = asRecord(raw);
  if (!record) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_CAPTION_POLICY', 'captions must be an object', { path }));
    return undefined;
  }
  pushUnknownKeys(record, NARRATION_CAPTION_KNOWN_KEYS, path, errors);
  if (typeof record.enabled !== 'boolean') {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_CAPTION_POLICY', 'captions.enabled must be boolean', {
      path: `${path}.enabled`,
    }));
    return undefined;
  }
  const policy: NarrationCaptionPolicyV1 = { enabled: record.enabled };
  if (typeof record.template === 'string' && record.template.trim()) policy.template = record.template.trim();
  if (record.pacing !== undefined) {
    if (typeof record.pacing !== 'string' || !(CAPTION_PACING_MODES as readonly string[]).includes(record.pacing)) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_CAPTION_POLICY', 'pacing must be word|phrase', {
        path: `${path}.pacing`,
      }));
    } else {
      policy.pacing = record.pacing as NarrationCaptionPolicyV1['pacing'];
    }
  }
  if (typeof record.language === 'string' && record.language.trim()) policy.language = record.language.trim();
  if (typeof record.track === 'string' && record.track.trim()) policy.track = record.track.trim();
  if (record.sourceMode !== undefined) {
    if (record.sourceMode !== 'narration-items' && record.sourceMode !== 'manual-timing') {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_CAPTION_POLICY', 'sourceMode invalid', {
        path: `${path}.sourceMode`,
      }));
    } else {
      policy.sourceMode = record.sourceMode;
    }
  }
  if (record.style !== undefined) {
    const style = asRecord(record.style);
    if (!style) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_CAPTION_POLICY', 'style must be an object', {
        path: `${path}.style`,
      }));
    } else {
      policy.style = style;
    }
  }
  if (record.layout !== undefined) {
    const layout = asRecord(record.layout);
    if (!layout) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_CAPTION_POLICY', 'layout must be an object', {
        path: `${path}.layout`,
      }));
    } else {
      policy.layout = {};
      if (typeof layout.anchor === 'string') policy.layout.anchor = layout.anchor;
      if (typeof layout.offsetXRatio === 'number' && Number.isFinite(layout.offsetXRatio)) {
        policy.layout.offsetXRatio = layout.offsetXRatio;
      }
      if (typeof layout.offsetYRatio === 'number' && Number.isFinite(layout.offsetYRatio)) {
        policy.layout.offsetYRatio = layout.offsetYRatio;
      }
    }
  }
  if (record.export !== undefined) {
    const exp = asRecord(record.export);
    if (!exp) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_CAPTION_POLICY', 'export must be an object', {
        path: `${path}.export`,
      }));
    } else {
      policy.export = {};
      if (typeof exp.srt === 'boolean') policy.export.srt = exp.srt;
      if (typeof exp.vtt === 'boolean') policy.export.vtt = exp.vtt;
    }
  }
  return policy;
}

function normalizeSegment(
  raw: unknown,
  path: string,
  defaultPauseAfter: number,
  errors: NarrationDiagnostic[],
  warnings: NarrationDiagnostic[],
): NarrationSegmentV1 | undefined {
  const record = asRecord(raw);
  if (!record) {
    errors.push(narrationDiagnostic('error', 'NARRATION_EMPTY_TEXT', 'segment must be an object', { path }));
    return undefined;
  }
  pushUnknownKeys(record, NARRATION_SEGMENT_KNOWN_KEYS, path, errors);
  const id = trimString(record.id);
  if (!id || !NARRATION_SEGMENT_ID_PATTERN.test(id)) {
    errors.push(narrationDiagnostic('error', 'NARRATION_DUPLICATE_SEGMENT', 'Invalid segment id', {
      path: `${path}.id`,
      recovery: 'Use ^[A-Za-z][A-Za-z0-9_-]{0,63}$',
    }));
    return undefined;
  }
  const text = typeof record.text === 'string' ? record.text : '';
  if (!text.trim()) {
    errors.push(narrationDiagnostic('error', 'NARRATION_EMPTY_TEXT', 'Segment text must be non-empty', {
      path: `${path}.text`,
      segmentId: id,
    }));
    return undefined;
  }
  if (text.length > MAX_SEGMENT_TEXT_LENGTH) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TEXT_TOO_LONG', `Segment text exceeds ${MAX_SEGMENT_TEXT_LENGTH}`, {
      path: `${path}.text`,
      segmentId: id,
    }));
    return undefined;
  }
  if (/<\s*script|javascript:|on\w+\s*=/i.test(text)) {
    errors.push(narrationDiagnostic('error', 'NARRATION_EMPTY_TEXT', 'Segment text must not contain HTML/script', {
      path: `${path}.text`,
      segmentId: id,
    }));
    return undefined;
  }
  const captionText = typeof record.captionText === 'string' ? record.captionText : undefined;
  if (captionText !== undefined && captionText.trim() && captionText !== text) {
    const ratio = Math.abs(captionText.length - text.length) / Math.max(text.length, 1);
    if (ratio > 0.5) {
      warnings.push(narrationDiagnostic('warning', 'NARRATION_EMPTY_TEXT', 'captionText differs substantially from spoken text', {
        path: `${path}.captionText`,
        segmentId: id,
        recovery: 'Confirm intentional pronunciation vs display difference',
      }));
    }
  }
  if (text.length > 2000) {
    warnings.push(narrationDiagnostic('warning', 'NARRATION_TEXT_TOO_LONG', 'Very long segment', {
      segmentId: id,
      recovery: 'Consider splitting into shorter segments',
    }));
  }
  const segment: NarrationSegmentV1 = {
    id,
    text,
    includeInCaptions: record.includeInCaptions !== false,
    pauseBeforeMs: normalizeMs(record.pauseBeforeMs, `${path}.pauseBeforeMs`, errors, 0) ?? 0,
    pauseAfterMs: normalizeMs(record.pauseAfterMs, `${path}.pauseAfterMs`, errors, defaultPauseAfter) ?? defaultPauseAfter,
  };
  if (captionText !== undefined) segment.captionText = captionText;
  if (typeof record.speakerId === 'string' && record.speakerId.trim()) segment.speakerId = record.speakerId.trim();
  if (Array.isArray(record.pronunciationHints)) {
    segment.pronunciationHints = record.pronunciationHints.filter((h): h is string => typeof h === 'string');
  }
  if (record.alignmentHints !== undefined) {
    const hints = asRecord(record.alignmentHints);
    if (hints) {
      segment.alignmentHints = {};
      if (typeof hints.expectedText === 'string') segment.alignmentHints.expectedText = hints.expectedText;
      if (typeof hints.expectedStartMs === 'number' && Number.isFinite(hints.expectedStartMs)) {
        segment.alignmentHints.expectedStartMs = hints.expectedStartMs;
      }
      if (typeof hints.expectedEndMs === 'number' && Number.isFinite(hints.expectedEndMs)) {
        segment.alignmentHints.expectedEndMs = hints.expectedEndMs;
      }
    }
  }
  return segment;
}

export function normalizeNarrationPlan(input: unknown): NarrationNormalizationResult {
  const errors: NarrationDiagnostic[] = [];
  const warnings: NarrationDiagnostic[] = [];

  if (!isJsonSerializable(input)) {
    return {
      ok: false,
      errors: [narrationDiagnostic('error', 'NARRATION_NON_SERIALIZABLE', 'NarrationPlan must be JSON-serializable')],
      warnings,
    };
  }

  const root = asRecord(input);
  if (!root) {
    return {
      ok: false,
      errors: [narrationDiagnostic('error', 'NARRATION_SCHEMA_UNSUPPORTED', 'NarrationPlan must be an object')],
      warnings,
    };
  }

  const serialized = stableStringify(root);
  if (utf8ByteLength(serialized) > MAX_NARRATION_PLAN_SERIALIZED_BYTES) {
    errors.push(narrationDiagnostic('error', 'NARRATION_PLAN_TOO_LARGE', `Serialized plan exceeds ${MAX_NARRATION_PLAN_SERIALIZED_BYTES} bytes`));
  }

  pushUnknownKeys(root, NARRATION_PLAN_KNOWN_ROOT_KEYS, 'plan', errors);

  if (root.schemaVersion !== NARRATION_PLAN_SCHEMA_VERSION) {
    errors.push(narrationDiagnostic('error', 'NARRATION_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion ${String(root.schemaVersion)}`, {
      recovery: `Use schemaVersion "${NARRATION_PLAN_SCHEMA_VERSION}"`,
    }));
  }

  const id = trimString(root.id);
  if (!id || !NARRATION_PLAN_ID_PATTERN.test(id)) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_ID', 'Invalid narration plan id', {
      path: 'plan.id',
      recovery: 'Use lowercase id matching ^[a-z0-9]+(?:[.-][a-z0-9]+)*$',
    }));
  }

  const name = trimString(root.name);
  if (!name) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_ID', 'name is required', { path: 'plan.name' }));
  }

  const language = trimString(root.language);
  if (!language || !LANGUAGE_TAG_PATTERN.test(language)) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_LANGUAGE', 'language must be a BCP-47-like tag (letters, digits, -; max 35)', {
      path: 'plan.language',
    }));
  }

  const videoNorm = normalizeVideoPlan(root.videoPlan);
  if (!videoNorm.ok || !videoNorm.plan) {
    errors.push(narrationDiagnostic('error', 'NARRATION_VIDEO_PLAN_INVALID', 'Embedded VideoPlan is invalid', {
      path: 'plan.videoPlan',
      details: { videoPlanErrors: videoNorm.errors },
      recovery: 'Validate the VideoPlan with video_plan_validate first',
    }));
  }
  errors.push(...videoNorm.errors.map((d) => narrationDiagnostic(d.severity, 'NARRATION_VIDEO_PLAN_INVALID', d.message, {
    path: `plan.videoPlan.${d.path ?? ''}`,
    details: d.details,
    recovery: d.recovery,
  })));
  warnings.push(...videoNorm.warnings.map((d) => narrationDiagnostic(d.severity, 'NARRATION_VIDEO_PLAN_INVALID', d.message, {
    path: `plan.videoPlan.${d.path ?? ''}`,
    details: d.details,
    recovery: d.recovery,
  })));

  if (!Array.isArray(root.speakers) || root.speakers.length === 0) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TOO_MANY_SPEAKERS', 'At least one speaker is required', {
      path: 'plan.speakers',
    }));
  } else if (root.speakers.length > MAX_NARRATION_SPEAKERS) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TOO_MANY_SPEAKERS', `Too many speakers (max ${MAX_NARRATION_SPEAKERS})`));
  }

  const speakers: NarrationSpeakerV1[] = [];
  const speakerIds = new Set<string>();
  const voiceFingerprints = new Map<string, string[]>();
  if (Array.isArray(root.speakers)) {
    root.speakers.forEach((raw, index) => {
      const record = asRecord(raw);
      const path = `plan.speakers[${index}]`;
      if (!record) {
        errors.push(narrationDiagnostic('error', 'NARRATION_MISSING_SPEAKER', 'speaker must be an object', { path }));
        return;
      }
      pushUnknownKeys(record, NARRATION_SPEAKER_KNOWN_KEYS, path, errors);
      const speakerId = trimString(record.id);
      if (!speakerId || !NARRATION_SPEAKER_ID_PATTERN.test(speakerId)) {
        errors.push(narrationDiagnostic('error', 'NARRATION_DUPLICATE_SPEAKER', 'Invalid speaker id', { path: `${path}.id` }));
        return;
      }
      if (speakerIds.has(speakerId)) {
        errors.push(narrationDiagnostic('error', 'NARRATION_DUPLICATE_SPEAKER', `Duplicate speaker id ${speakerId}`, {
          speakerId,
          path: `${path}.id`,
        }));
        return;
      }
      speakerIds.add(speakerId);
      const voice = normalizeVoice(record.temporaryVoice, `${path}.temporaryVoice`, errors);
      if (!voice) return;
      const speaker: NarrationSpeakerV1 = { id: speakerId, temporaryVoice: voice };
      if (typeof record.name === 'string' && record.name.trim()) speaker.name = record.name.trim();
      speakers.push(speaker);
      const fp = `${voice.provider}:${voice.voiceId}:${voice.modelId ?? ''}`;
      const list = voiceFingerprints.get(fp) ?? [];
      list.push(speakerId);
      voiceFingerprints.set(fp, list);
    });
  }
  for (const [, ids] of voiceFingerprints) {
    if (ids.length > 1) {
      warnings.push(narrationDiagnostic('warning', 'NARRATION_DUPLICATE_SPEAKER', 'Multiple speakers share the same temporary voice', {
        details: { speakerIds: ids },
      }));
    }
  }

  let defaultSpeakerId: string | undefined;
  let defaultLeadIn = DEFAULT_NARRATION_LEAD_IN_MS;
  let defaultTailOut = DEFAULT_NARRATION_TAIL_OUT_MS;
  let defaultPause = DEFAULT_SEGMENT_GAP_MS;
  let defaultPolicy: SceneDurationPolicy = 'fit-narration';
  let defaultCaptions: NarrationCaptionPolicyV1 | undefined;

  if (root.defaults !== undefined) {
    const defaults = asRecord(root.defaults);
    if (!defaults) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', 'defaults must be an object', { path: 'plan.defaults' }));
    } else {
      pushUnknownKeys(defaults, NARRATION_DEFAULTS_KNOWN_KEYS, 'plan.defaults', errors);
      if (typeof defaults.speakerId === 'string' && defaults.speakerId.trim()) {
        defaultSpeakerId = defaults.speakerId.trim();
        if (!speakerIds.has(defaultSpeakerId)) {
          errors.push(narrationDiagnostic('error', 'NARRATION_MISSING_SPEAKER', `defaults.speakerId ${defaultSpeakerId} not found`, {
            path: 'plan.defaults.speakerId',
            speakerId: defaultSpeakerId,
          }));
        }
      }
      defaultLeadIn = normalizeMs(defaults.leadInMs, 'plan.defaults.leadInMs', errors, DEFAULT_NARRATION_LEAD_IN_MS) ?? DEFAULT_NARRATION_LEAD_IN_MS;
      defaultTailOut = normalizeMs(defaults.tailOutMs, 'plan.defaults.tailOutMs', errors, DEFAULT_NARRATION_TAIL_OUT_MS) ?? DEFAULT_NARRATION_TAIL_OUT_MS;
      defaultPause = normalizeMs(defaults.pauseBetweenSegmentsMs, 'plan.defaults.pauseBetweenSegmentsMs', errors, DEFAULT_SEGMENT_GAP_MS) ?? DEFAULT_SEGMENT_GAP_MS;
      if (defaults.sceneDurationPolicy !== undefined) {
        if (typeof defaults.sceneDurationPolicy !== 'string'
          || !(SCENE_DURATION_POLICIES as readonly string[]).includes(defaults.sceneDurationPolicy)) {
          errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', 'Invalid sceneDurationPolicy', {
            path: 'plan.defaults.sceneDurationPolicy',
          }));
        } else {
          defaultPolicy = defaults.sceneDurationPolicy as SceneDurationPolicy;
        }
      }
      defaultCaptions = normalizeCaptionPolicy(defaults.captions, 'plan.defaults.captions', errors);
    }
  }

  if (!defaultCaptions) {
    defaultCaptions = {
      enabled: true,
      template: 'black-bar',
      pacing: 'phrase',
      sourceMode: 'narration-items',
      export: { srt: true, vtt: true },
    };
  }

  if (!Array.isArray(root.scenes)) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TOO_MANY_SCENES', 'scenes must be an array', { path: 'plan.scenes' }));
  } else if (root.scenes.length > MAX_NARRATION_SCENES) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TOO_MANY_SCENES', `Too many narration scenes (max ${MAX_NARRATION_SCENES})`));
  }

  const videoPlan = videoNorm.plan;
  const videoSceneIds = new Set(videoPlan?.scenes.map((s) => s.id) ?? []);
  const narrationScenesRaw: NarrationSceneV1[] = [];
  const seenSceneIds = new Set<string>();
  const seenSegmentIds = new Set<string>();
  let totalText = 0;
  let totalSegments = 0;

  if (Array.isArray(root.scenes)) {
    root.scenes.forEach((raw, index) => {
      const record = asRecord(raw);
      const path = `plan.scenes[${index}]`;
      if (!record) {
        errors.push(narrationDiagnostic('error', 'NARRATION_DUPLICATE_SCENE', 'scene must be an object', { path }));
        return;
      }
      pushUnknownKeys(record, NARRATION_SCENE_KNOWN_KEYS, path, errors);
      const sceneEntryId = trimString(record.sceneEntryId);
      if (!sceneEntryId) {
        errors.push(narrationDiagnostic('error', 'NARRATION_MISSING_VIDEO_SCENE', 'sceneEntryId is required', { path: `${path}.sceneEntryId` }));
        return;
      }
      if (seenSceneIds.has(sceneEntryId)) {
        errors.push(narrationDiagnostic('error', 'NARRATION_DUPLICATE_SCENE', `Duplicate sceneEntryId ${sceneEntryId}`, {
          sceneEntryId,
          path: `${path}.sceneEntryId`,
        }));
        return;
      }
      seenSceneIds.add(sceneEntryId);
      if (!videoSceneIds.has(sceneEntryId)) {
        errors.push(narrationDiagnostic('error', 'NARRATION_MISSING_VIDEO_SCENE', `sceneEntryId ${sceneEntryId} not in embedded VideoPlan`, {
          sceneEntryId,
          path: `${path}.sceneEntryId`,
          recovery: 'Use an exact VideoPlan scene entry id',
        }));
      }
      let policy = defaultPolicy;
      if (record.sceneDurationPolicy !== undefined) {
        if (typeof record.sceneDurationPolicy !== 'string'
          || !(SCENE_DURATION_POLICIES as readonly string[]).includes(record.sceneDurationPolicy)) {
          errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', 'Invalid sceneDurationPolicy', {
            path: `${path}.sceneDurationPolicy`,
            sceneEntryId,
          }));
        } else {
          policy = record.sceneDurationPolicy as SceneDurationPolicy;
        }
      }
      if (policy === 'preserve-video-plan') {
        warnings.push(narrationDiagnostic('warning', 'NARRATION_AUDIO_OVERFLOWS_SCENE', 'preserve-video-plan may overflow if narration is longer than the visual', {
          sceneEntryId,
          recovery: 'Use fit-narration or at-least-visual, or shorten narration',
        }));
      }
      const segmentsRaw = Array.isArray(record.segments) ? record.segments : [];
      if (segmentsRaw.length === 0) {
        warnings.push(narrationDiagnostic('warning', 'NARRATION_EMPTY_TEXT', 'Narration scene has no segments', {
          sceneEntryId,
        }));
      }
      const segments: NarrationSegmentV1[] = [];
      segmentsRaw.forEach((segRaw, segIndex) => {
        const seg = normalizeSegment(segRaw, `${path}.segments[${segIndex}]`, defaultPause, errors, warnings);
        if (!seg) return;
        if (seenSegmentIds.has(seg.id)) {
          errors.push(narrationDiagnostic('error', 'NARRATION_DUPLICATE_SEGMENT', `Duplicate segment id ${seg.id}`, {
            segmentId: seg.id,
            sceneEntryId,
          }));
          return;
        }
        seenSegmentIds.add(seg.id);
        const speakerId = seg.speakerId ?? defaultSpeakerId ?? speakers[0]?.id;
        if (!speakerId || !speakerIds.has(speakerId)) {
          errors.push(narrationDiagnostic('error', 'NARRATION_MISSING_SPEAKER', `Segment ${seg.id} has unknown speaker`, {
            segmentId: seg.id,
            sceneEntryId,
            speakerId,
          }));
        } else {
          seg.speakerId = speakerId;
        }
        totalText += seg.text.length;
        totalSegments += 1;
        segments.push(seg);
      });
      narrationScenesRaw.push({
        sceneEntryId,
        leadInMs: normalizeMs(record.leadInMs, `${path}.leadInMs`, errors, defaultLeadIn) ?? defaultLeadIn,
        tailOutMs: normalizeMs(record.tailOutMs, `${path}.tailOutMs`, errors, defaultTailOut) ?? defaultTailOut,
        sceneDurationPolicy: policy,
        segments,
      });
    });
  }

  if (totalSegments > MAX_NARRATION_SEGMENTS) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TOO_MANY_SEGMENTS', `Too many segments (max ${MAX_NARRATION_SEGMENTS})`));
  }
  if (totalText > MAX_TOTAL_TEXT_LENGTH) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TOTAL_TEXT_TOO_LONG', `Total text exceeds ${MAX_TOTAL_TEXT_LENGTH}`));
  }

  if (videoPlan) {
    for (const scene of videoPlan.scenes) {
      if (!seenSceneIds.has(scene.id)) {
        warnings.push(narrationDiagnostic('warning', 'NARRATION_MISSING_VIDEO_SCENE', `VideoPlan scene ${scene.id} has no narration`, {
          sceneEntryId: scene.id,
        }));
      }
    }
  }

  // Sort narration scenes by VideoPlan order
  const order = new Map((videoPlan?.scenes ?? []).map((s, i) => [s.id, i]));
  const scenes = [...narrationScenesRaw].sort((a, b) => (order.get(a.sceneEntryId) ?? 0) - (order.get(b.sceneEntryId) ?? 0));

  if (errors.length > 0 || !videoPlan || !id || !name || !language || speakers.length === 0) {
    return { ok: false, errors, warnings };
  }

  const plan: NarrationPlanV1 = {
    schemaVersion: '1.0.0',
    id,
    name,
    language,
    videoPlan: deepCloneJson(videoPlan),
    speakers,
    defaults: {
      ...(defaultSpeakerId ? { speakerId: defaultSpeakerId } : {}),
      leadInMs: defaultLeadIn,
      tailOutMs: defaultTailOut,
      pauseBetweenSegmentsMs: defaultPause,
      sceneDurationPolicy: defaultPolicy,
      captions: defaultCaptions,
    },
    scenes,
  };
  if (typeof root.description === 'string' && root.description.trim()) {
    plan.description = root.description.trim();
  }

  return { ok: true, plan, errors, warnings };
}
