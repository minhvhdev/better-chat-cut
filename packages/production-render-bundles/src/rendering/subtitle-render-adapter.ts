import type { ProductionRenderPlanV1 } from '../../../production-render-plans/src/contracts/production-render-plan.ts';
import { buildSubtitleCues, serializeSrt, serializeWebVtt, shiftCues } from '../../../project-narration/src/subtitles/subtitle-cues.ts';
import type { NarrationTimingSnapshotV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import { sha256Hex, stableStringify } from '../../../production-render-plans/src/schema/production-render-serialization.ts';
import { ProductionRenderError } from '../../../production-render-plans/src/contracts/production-render-errors.ts';

export type SubtitleRenderResult = {
  srt?: string;
  vtt?: string;
  cueCount: number;
};

export function generateProductionSubtitles(input: {
  plan: ProductionRenderPlanV1;
  captions?: { words?: Array<{ text: string; start: number; end: number }> } | null;
}): SubtitleRenderResult {
  const { plan } = input;
  if (!plan.subtitles.includeSrt && !plan.subtitles.includeVtt) {
    return { cueCount: 0 };
  }

  const fps = plan.source.timeline.fps;
  const originMs = (plan.source.range.startFrame / fps) * 1000;
  const endMs = (plan.source.range.endFrame / fps) * 1000;

  let words: Array<{ text: string; start: number; end: number }> = [];
  if (plan.subtitles.source.type === 'narration-timing') {
    const snap = plan.subtitles.source.timingSnapshot as NarrationTimingSnapshotV1;
    words = snap.captionWords ?? [];
  } else if (plan.subtitles.source.type === 'project-caption-track') {
    const hash = sha256Hex(stableStringify(input.captions ?? null));
    if (hash !== plan.subtitles.source.expectedCaptionsHash) {
      throw new ProductionRenderError('PRODUCTION_RENDER_CAPTION_SOURCE_INVALID', 'Caption track drifted at subtitle generation', {
        recovery: 'Re-prepare the production render plan',
      });
    }
    words = (input.captions?.words ?? []).map((w) => ({ text: w.text, start: w.start, end: w.end }));
  } else {
    throw new ProductionRenderError('PRODUCTION_RENDER_CAPTION_SOURCE_INVALID', 'Subtitle source is none but sidecars requested');
  }

  const cues = shiftCues(
    buildSubtitleCues({ words, pacing: 'phrase' })
      .filter((c) => c.endMs > originMs && c.startMs < endMs)
      .map((c) => ({
        ...c,
        startMs: Math.max(originMs, c.startMs),
        endMs: Math.min(endMs, c.endMs),
      })),
    originMs,
  );

  return {
    ...(plan.subtitles.includeSrt ? { srt: serializeSrt(cues) } : {}),
    ...(plan.subtitles.includeVtt ? { vtt: serializeWebVtt(cues) } : {}),
    cueCount: cues.length,
  };
}
