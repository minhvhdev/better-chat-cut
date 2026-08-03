import type { NarrationPlanV1 } from '../../../narration-plans/src/contracts/narration-plan.ts';
import type { NarrationWordV1, NarrationTimingSnapshotV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import { validateNarrationPlan } from '../../../narration-plans/src/schema/narration-validator.ts';
import { computeNarrationTimingHash } from '../../../narration-plans/src/timing/timed-video-plan.ts';
import { deepCloneJson, sha256Hex, stableStringify } from '../../../narration-plans/src/schema/narration-serialization.ts';
import { computeVideoPlanHash } from '../../../video-plans/src/schema/video-plan-hash.ts';
import { validateVideoPlan } from '../../../video-plans/src/schema/video-plan-validator.ts';
import { msToTimelineFrames, framesToMs, resolveSceneDurationMs } from '../../../narration-plans/src/timing/scene-duration-policy.ts';
import { createVideoPlanSchedule } from '../../../video-plans/src/schedule/sequence-scheduler.ts';
import { tokenizeAlignment } from '../normalization/transcript-normalization.ts';
import {
  alignmentDiagnostic,
  type AlignmentDiagnostic,
  type NarrationAlignmentConfidence,
  type NarrationAlignmentOverrideV1,
  type VoiceoverAlignmentResultV1,
  type VoiceoverSourceV1,
} from '../contracts/voiceover-alignment.ts';

function confidenceFromScore(score: number): NarrationAlignmentConfidence {
  if (score >= 0.85) return 'high';
  if (score >= 0.70) return 'medium';
  if (score >= 0.55) return 'low';
  return 'failed';
}

function scoreSpan(
  narrationTokens: string[],
  transcriptTokens: string[],
  start: number,
  endExclusive: number,
): number {
  const span = transcriptTokens.slice(start, endExclusive);
  if (narrationTokens.length === 0 || span.length === 0) return 0;
  let matched = 0;
  let ti = 0;
  for (const nt of narrationTokens) {
    while (ti < span.length && span[ti] !== nt) ti += 1;
    if (ti < span.length && span[ti] === nt) {
      matched += 1;
      ti += 1;
    }
  }
  const coverage = matched / narrationTokens.length;
  const compactness = matched / Math.max(span.length, 1);
  const orderBonus = coverage;
  return Math.max(0, Math.min(1, 0.55 * coverage + 0.25 * compactness + 0.2 * orderBonus));
}

/**
 * Deterministic monotonic token alignment (ordered DP / greedy with tie-breaks).
 */
export function alignNarrationToTranscript(input: {
  narrationPlan: unknown;
  transcriptWords: NarrationWordV1[];
  voiceoverSource: VoiceoverSourceV1;
  sourceRevision: string;
  durationMs: number;
  mode?: 'transcript' | 'manual';
  overrides?: NarrationAlignmentOverrideV1[];
  transcriptStale?: boolean;
}): VoiceoverAlignmentResultV1 {
  const errors: AlignmentDiagnostic[] = [];
  const warnings: AlignmentDiagnostic[] = [];
  const validated = validateNarrationPlan(input.narrationPlan);
  errors.push(...validated.errors.map((d) => alignmentDiagnostic(d.severity, d.code, d.message, {
    details: d.details,
    recovery: d.recovery,
  })));
  if (!validated.valid || !validated.normalizedPlan || !validated.narrationPlanHash) {
    return {
      valid: false,
      narrationPlanId: 'invalid',
      narrationPlanHash: '',
      voiceover: {
        source: input.voiceoverSource,
        sourceRevision: input.sourceRevision,
        durationMs: input.durationMs,
      },
      segments: [],
      errors,
      warnings,
    };
  }

  const plan = validated.normalizedPlan;
  const planHash = validated.narrationPlanHash;
  const mode = input.mode ?? 'transcript';
  const overrides = new Map((input.overrides ?? []).map((o) => [o.segmentId, o]));

  if (mode === 'transcript') {
    if (input.transcriptStale || !input.transcriptWords?.length) {
      errors.push(alignmentDiagnostic('error', 'NARRATION_VOICEOVER_TRANSCRIPT_MISSING', 'Voice-over transcript missing or stale', {
        recovery: 'Run the existing transcription workflow, then retry alignment',
      }));
      return {
        valid: false,
        narrationPlanId: plan.id,
        narrationPlanHash: planHash,
        voiceover: {
          source: input.voiceoverSource,
          sourceRevision: input.sourceRevision,
          durationMs: input.durationMs,
        },
        segments: [],
        errors,
        warnings,
      };
    }
  }

  const transcriptTokens = input.transcriptWords.flatMap((w, index) =>
    tokenizeAlignment(w.text).map((tok) => ({ tok, wordIndex: index })));
  const flatTokens = transcriptTokens.map((t) => t.tok);

  const segmentDefs = plan.scenes.flatMap((scene) =>
    scene.segments.map((seg) => ({
      segmentId: seg.id,
      sceneEntryId: scene.sceneEntryId,
      text: seg.alignmentHints?.expectedText ?? seg.text,
      hintStart: seg.alignmentHints?.expectedStartMs,
      hintEnd: seg.alignmentHints?.expectedEndMs,
    })));

  let searchFrom = 0;
  const aligned: VoiceoverAlignmentResultV1['segments'] = [];

  for (const seg of segmentDefs) {
    const segErrors: AlignmentDiagnostic[] = [];
    const segWarnings: AlignmentDiagnostic[] = [];
    const override = overrides.get(seg.segmentId);

    if (override) {
      const hasWord = override.startWordIndex !== undefined || override.endWordIndex !== undefined;
      const hasMs = override.startMs !== undefined || override.endMs !== undefined;
      if (hasWord && hasMs) {
        segErrors.push(alignmentDiagnostic('error', 'NARRATION_ALIGNMENT_FAILED', 'Override must use word indices OR milliseconds, not both', {
          segmentId: seg.segmentId,
        }));
        aligned.push({
          segmentId: seg.segmentId,
          sceneEntryId: seg.sceneEntryId,
          confidence: 'failed',
          score: 0,
          errors: segErrors,
          warnings: segWarnings,
        });
        continue;
      }
      let startMs: number;
      let endMs: number;
      let startWordIndex: number | undefined;
      let endWordIndex: number | undefined;
      if (hasWord) {
        startWordIndex = override.startWordIndex ?? 0;
        endWordIndex = override.endWordIndex ?? startWordIndex;
        if (startWordIndex < 0 || endWordIndex >= input.transcriptWords.length || endWordIndex < startWordIndex) {
          segErrors.push(alignmentDiagnostic('error', 'NARRATION_ALIGNMENT_FAILED', 'Invalid word-index override', {
            segmentId: seg.segmentId,
          }));
          aligned.push({
            segmentId: seg.segmentId,
            sceneEntryId: seg.sceneEntryId,
            confidence: 'failed',
            score: 0,
            errors: segErrors,
            warnings: segWarnings,
          });
          continue;
        }
        startMs = input.transcriptWords[startWordIndex]!.start;
        endMs = input.transcriptWords[endWordIndex]!.end;
        searchFrom = transcriptTokens.findIndex((t) => t.wordIndex > (endWordIndex as number)) >= 0
          ? transcriptTokens.findIndex((t) => t.wordIndex > (endWordIndex as number))
          : transcriptTokens.length;
      } else {
        startMs = override.startMs ?? 0;
        endMs = override.endMs ?? startMs + 1;
        if (!(endMs > startMs)) {
          segErrors.push(alignmentDiagnostic('error', 'NARRATION_ALIGNMENT_FAILED', 'Override endMs must be > startMs', {
            segmentId: seg.segmentId,
          }));
          aligned.push({
            segmentId: seg.segmentId,
            sceneEntryId: seg.sceneEntryId,
            confidence: 'failed',
            score: 0,
            errors: segErrors,
            warnings: segWarnings,
          });
          continue;
        }
      }
      aligned.push({
        segmentId: seg.segmentId,
        sceneEntryId: seg.sceneEntryId,
        startMs,
        endMs,
        startWordIndex,
        endWordIndex,
        confidence: 'high',
        score: 1,
        matchedText: input.transcriptWords
          .filter((w) => w.start >= startMs && w.end <= endMs)
          .map((w) => w.text)
          .join(' '),
        errors: segErrors,
        warnings: segWarnings,
      });
      continue;
    }

    if (mode === 'manual') {
      segErrors.push(alignmentDiagnostic('error', 'NARRATION_ALIGNMENT_FAILED', 'Manual mode requires overrides for each segment', {
        segmentId: seg.segmentId,
        recovery: 'Provide NarrationAlignmentOverrideV1 for this segment',
      }));
      aligned.push({
        segmentId: seg.segmentId,
        sceneEntryId: seg.sceneEntryId,
        confidence: 'failed',
        score: 0,
        errors: segErrors,
        warnings: segWarnings,
      });
      continue;
    }

    const narrationTokens = tokenizeAlignment(seg.text);
    let best = { score: -1, start: searchFrom, end: searchFrom, spanLen: Infinity };

    for (let start = searchFrom; start < flatTokens.length; start += 1) {
      const maxEnd = Math.min(flatTokens.length, start + Math.max(narrationTokens.length * 3, narrationTokens.length + 8));
      for (let end = start + 1; end <= maxEnd; end += 1) {
        const score = scoreSpan(narrationTokens, flatTokens, start, end);
        const spanLen = end - start;
        if (
          score > best.score
          || (score === best.score && spanLen < best.spanLen)
          || (score === best.score && spanLen === best.spanLen && start < best.start)
        ) {
          best = { score, start, end, spanLen };
        }
      }
    }

    if (best.score < 0 || best.end <= best.start) {
      aligned.push({
        segmentId: seg.segmentId,
        sceneEntryId: seg.sceneEntryId,
        confidence: 'failed',
        score: 0,
        errors: [alignmentDiagnostic('error', 'NARRATION_ALIGNMENT_FAILED', 'Could not align segment', {
          segmentId: seg.segmentId,
        })],
        warnings: segWarnings,
      });
      continue;
    }

    const startWordIndex = transcriptTokens[best.start]!.wordIndex;
    const endWordIndex = transcriptTokens[best.end - 1]!.wordIndex;
    const startMs = input.transcriptWords[startWordIndex]!.start;
    const endMs = input.transcriptWords[endWordIndex]!.end;
    const confidence = confidenceFromScore(best.score);
    if (confidence === 'low' || confidence === 'failed') {
      segErrors.push(alignmentDiagnostic('error', 'NARRATION_ALIGNMENT_LOW_CONFIDENCE', `Alignment confidence ${confidence}`, {
        segmentId: seg.segmentId,
        details: { score: best.score },
        recovery: 'Fix narration/transcript text or provide manual overrides',
      }));
    } else if (confidence === 'medium') {
      segWarnings.push(alignmentDiagnostic('warning', 'NARRATION_ALIGNMENT_LOW_CONFIDENCE', 'Medium alignment confidence', {
        segmentId: seg.segmentId,
        details: { score: best.score },
      }));
    }

    searchFrom = best.end;
    aligned.push({
      segmentId: seg.segmentId,
      sceneEntryId: seg.sceneEntryId,
      startMs,
      endMs,
      startWordIndex,
      endWordIndex,
      confidence,
      score: best.score,
      matchedText: input.transcriptWords.slice(startWordIndex, endWordIndex + 1).map((w) => w.text).join(' '),
      errors: segErrors,
      warnings: segWarnings,
    });
  }

  // Monotonic check
  for (let i = 1; i < aligned.length; i += 1) {
    const prev = aligned[i - 1]!;
    const cur = aligned[i]!;
    if (prev.endMs !== undefined && cur.startMs !== undefined && cur.startMs < prev.endMs) {
      cur.warnings.push(alignmentDiagnostic('warning', 'NARRATION_ALIGNMENT_FAILED', 'Segment overlaps previous; clamping start', {
        segmentId: cur.segmentId,
      }));
      cur.startMs = prev.endMs;
    }
  }

  const blocked = aligned.some((s) => s.confidence === 'low' || s.confidence === 'failed' || s.errors.some((e) => e.severity === 'error'));
  errors.push(...aligned.flatMap((s) => s.errors));
  warnings.push(...aligned.flatMap((s) => s.warnings));

  let timingSnapshot: NarrationTimingSnapshotV1 | undefined;
  if (!blocked) {
    timingSnapshot = buildVoiceoverTimingSnapshot({
      plan,
      planHash,
      aligned,
      transcriptWords: input.transcriptWords,
      sourceRevision: input.sourceRevision,
      durationMs: input.durationMs,
    });
  }

  return {
    valid: !blocked && errors.filter((e) => e.severity === 'error').length === 0,
    narrationPlanId: plan.id,
    narrationPlanHash: planHash,
    voiceover: {
      source: input.voiceoverSource,
      sourceRevision: input.sourceRevision,
      durationMs: input.durationMs,
      transcriptHash: sha256Hex(stableStringify(input.transcriptWords)),
    },
    segments: aligned,
    timingSnapshot,
    errors,
    warnings,
  };
}

function buildVoiceoverTimingSnapshot(input: {
  plan: NarrationPlanV1;
  planHash: string;
  aligned: VoiceoverAlignmentResultV1['segments'];
  transcriptWords: NarrationWordV1[];
  sourceRevision: string;
  durationMs: number;
}): NarrationTimingSnapshotV1 | undefined {
  const fps = input.plan.videoPlan.output.fps;
  const baseSchedule = createVideoPlanSchedule(input.plan.videoPlan);
  if (baseSchedule.errors.length) return undefined;
  const baseEntries = new Map(baseSchedule.schedule.entries.map((e) => [e.entryId, e]));
  const timedVideoPlan = deepCloneJson(input.plan.videoPlan);
  const timedScenes = [];
  const captionWords: NarrationWordV1[] = [];

  // Midpoint silence split between scenes
  const byScene = new Map<string, typeof input.aligned>();
  for (const seg of input.aligned) {
    const list = byScene.get(seg.sceneEntryId) ?? [];
    list.push(seg);
    byScene.set(seg.sceneEntryId, list);
  }

  const sceneIds = timedVideoPlan.scenes.map((s) => s.id);
  const sceneRanges = new Map<string, { startMs: number; endMs: number }>();
  for (let i = 0; i < sceneIds.length; i += 1) {
    const id = sceneIds[i]!;
    const segs = byScene.get(id) ?? [];
    if (!segs.length) continue;
    let startMs = Math.min(...segs.map((s) => s.startMs ?? 0));
    let endMs = Math.max(...segs.map((s) => s.endMs ?? 0));
    const prevId = sceneIds[i - 1];
    const nextId = sceneIds[i + 1];
    const prevSegs = prevId ? byScene.get(prevId) : undefined;
    const nextSegs = nextId ? byScene.get(nextId) : undefined;
    if (prevSegs?.length) {
      const prevEnd = Math.max(...prevSegs.map((s) => s.endMs ?? 0));
      const gap = startMs - prevEnd;
      if (gap > 0) startMs = prevEnd + Math.floor(gap / 2);
    }
    if (nextSegs?.length) {
      const nextStart = Math.min(...nextSegs.map((s) => s.startMs ?? 0));
      const gap = nextStart - endMs;
      if (gap > 0) endMs = endMs + Math.floor(gap / 2);
    }
    const narrationScene = input.plan.scenes.find((s) => s.sceneEntryId === id);
    const lead = narrationScene?.leadInMs ?? input.plan.defaults?.leadInMs ?? 250;
    const tail = narrationScene?.tailOutMs ?? input.plan.defaults?.tailOutMs ?? 350;
    sceneRanges.set(id, { startMs: Math.max(0, startMs - lead), endMs: endMs + tail });
  }

  for (const sceneEntry of timedVideoPlan.scenes) {
    const base = baseEntries.get(sceneEntry.id)!;
    const range = sceneRanges.get(sceneEntry.id);
    const narrationScene = input.plan.scenes.find((s) => s.sceneEntryId === sceneEntry.id);
    if (!range || !narrationScene?.segments.length) {
      timedScenes.push({
        sceneEntryId: sceneEntry.id,
        relativeStartFrame: 0,
        durationInFrames: base.durationInFrames,
        relativeEndFrame: base.durationInFrames,
        narrationStartFrame: 0,
        narrationEndFrame: 0,
        segments: [],
        warnings: [],
      });
      continue;
    }
    const visualMs = framesToMs(base.durationInFrames, fps);
    const needed = range.endMs - range.startMs;
    const policy = narrationScene.sceneDurationPolicy ?? input.plan.defaults?.sceneDurationPolicy ?? 'fit-narration';
    const resolved = resolveSceneDurationMs({
      policy,
      visualDurationMs: visualMs,
      narrationRequiredMs: needed,
      sceneEntryId: sceneEntry.id,
    });
    if (resolved.errors.length) return undefined;
    const durationInFrames = msToTimelineFrames(resolved.durationMs, fps);
    sceneEntry.duration = { mode: 'timeline-frames', timelineFrames: durationInFrames };
    const segs = byScene.get(sceneEntry.id) ?? [];
    timedScenes.push({
      sceneEntryId: sceneEntry.id,
      relativeStartFrame: 0,
      durationInFrames,
      relativeEndFrame: durationInFrames,
      narrationStartFrame: 0,
      narrationEndFrame: durationInFrames,
      segments: segs.map((s) => ({
        segmentId: s.segmentId,
        startFrame: msToTimelineFrames((s.startMs ?? 0) - range.startMs, fps),
        endFrame: msToTimelineFrames((s.endMs ?? 0) - range.startMs, fps),
        startMs: s.startMs ?? 0,
        endMs: s.endMs ?? 0,
        speakerId: input.plan.speakers[0]!.id,
        timingQuality: 'voiceover-transcript',
      })),
      warnings: resolved.warnings,
    });
  }

  for (const w of input.transcriptWords) {
    captionWords.push({ ...w });
  }

  const timedValidation = validateVideoPlan(timedVideoPlan, { includeSchedule: true });
  if (!timedValidation.valid || !timedValidation.normalizedPlan || !timedValidation.planHash || !timedValidation.schedule) {
    return undefined;
  }
  const scheduleEntries = new Map(timedValidation.schedule.entries.map((e) => [e.entryId, e]));
  for (const scene of timedScenes) {
    const entry = scheduleEntries.get(scene.sceneEntryId);
    if (!entry) continue;
    scene.relativeStartFrame = entry.relativeStartFrame;
    scene.relativeEndFrame = entry.relativeEndFrame;
    scene.durationInFrames = entry.durationInFrames;
  }

  const withoutHash = {
    schemaVersion: '1.0.0' as const,
    narrationPlanId: input.plan.id,
    narrationPlanHash: input.planHash,
    baseVideoPlanId: input.plan.videoPlan.id,
    baseVideoPlanHash: computeVideoPlanHash(input.plan.videoPlan),
    source: {
      type: 'voiceover' as const,
      voiceoverSourceRevision: input.sourceRevision,
      transcriptHash: sha256Hex(stableStringify(input.transcriptWords)),
    },
    timelineFps: fps,
    scenes: timedScenes,
    timedVideoPlan: timedValidation.normalizedPlan,
    timedVideoPlanHash: timedValidation.planHash,
    captionWords,
    errors: [] as never[],
    warnings: [] as never[],
  };

  return {
    ...withoutHash,
    timingHash: computeNarrationTimingHash(withoutHash),
  };
}
