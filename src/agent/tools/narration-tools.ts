import type { AgentContext } from '../context';
import { activeTimeline } from '../../editor/types';
import { hasOperationalTranscript } from '../../transcript/types';
import {
  previewNarrationTimelineApply,
  planNarrationTimelineApply,
  inspectNarrationTimeline,
  exportSubtitles,
  type NarrationTimelineLike,
  type NarrationAtomicAction,
} from '../../../packages/project-narration/src/index.ts';
import type { NarrationTimingSnapshotV1 } from '../../../packages/narration-plans/src/contracts/narration-timing.ts';
import { alignNarrationToTranscript } from '../../../packages/voiceover-alignment/src/index.ts';
import { NarrationError } from '../../../packages/narration-plans/src/contracts/narration-errors.ts';
import { msToTimelineFrames } from '../../../packages/narration-plans/src/timing/scene-duration-policy.ts';

type Args = Record<string, unknown>;

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function timelineLike(ctx: AgentContext): NarrationTimelineLike {
  const doc = ctx.getDoc();
  const timeline = activeTimeline(doc);
  return {
    id: timeline.id,
    name: timeline.name,
    width: timeline.width,
    height: timeline.height,
    fps: timeline.fps,
    fit: timeline.fit,
    items: timeline.items as NarrationTimelineLike['items'],
    tracks: timeline.tracks as NarrationTimelineLike['tracks'],
    transitions: (timeline.transitions ?? []) as NarrationTimelineLike['transitions'],
    markers: (timeline.markers ?? []) as NarrationTimelineLike['markers'],
    captions: (timeline as { captions?: unknown }).captions,
  };
}

function asTimingSnapshot(value: unknown): NarrationTimingSnapshotV1 {
  return value as NarrationTimingSnapshotV1;
}

function mapActions(actions: NarrationAtomicAction[]): unknown[] {
  return actions.map((action) => {
    if (action.type === 'setCaptions') {
      // Store caption payload on a dedicated batch action if reducer supports it;
      // fall back to a no-op-safe update on timeline via custom batch shape.
      return { type: 'tl.setCaptions', captions: action.captions };
    }
    return action;
  });
}

export async function execNarrationTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  try {
    if (name === 'narration_voiceover_align') {
      const doc = ctx.getDoc();
      const timeline = activeTimeline(doc);
      const source = args.voiceoverSource as { type?: string; mediaAssetId?: string; itemId?: string };
      let transcript: Array<{ text: string; start: number; end: number }> = [];
      let sourceRevision = '';
      let durationMs = 0;
      let transcriptStale = false;

      if (source?.type === 'timeline-item' && source.itemId) {
        const item = timeline.items.find((i) => i.id === source.itemId);
        if (!item) return { error: 'Voice-over timeline item not found', code: 'NARRATION_VOICEOVER_TRANSCRIPT_MISSING' };
        transcriptStale = item.transcriptStale === true;
        if (hasOperationalTranscript(item)) transcript = item.transcript;
        sourceRevision = String(item.sourceRevision ?? item.id);
        durationMs = Math.round((item.durationInFrames / timeline.fps) * 1000);
      } else if (source?.type === 'media-asset' && source.mediaAssetId) {
        const asset = doc.assets.find((m) => m.id === source.mediaAssetId);
        if (!asset) return { error: 'Voice-over media asset not found', code: 'NARRATION_VOICEOVER_TRANSCRIPT_MISSING' };
        transcriptStale = asset.transcriptStale === true;
        if (hasOperationalTranscript(asset)) transcript = asset.transcript;
        sourceRevision = String(asset.sourceRevision ?? source.mediaAssetId);
        durationMs = typeof asset.durationInFrames === 'number'
          ? Math.round((asset.durationInFrames / timeline.fps) * 1000)
          : 0;
      } else {
        return { error: 'Invalid voiceoverSource', code: 'NARRATION_VOICEOVER_TRANSCRIPT_MISSING' };
      }

      const result = alignNarrationToTranscript({
        narrationPlan: args.narrationPlan,
        transcriptWords: transcript,
        voiceoverSource: source as never,
        sourceRevision,
        durationMs,
        mode: args.mode === 'manual' ? 'manual' : 'transcript',
        overrides: Array.isArray(args.overrides) ? args.overrides as never : undefined,
        transcriptStale,
      });
      return { ok: result.valid, ...result };
    }

    if (name === 'narration_preview_timeline') {
      const preview = previewNarrationTimelineApply({
        timingSnapshot: asTimingSnapshot(args.timingSnapshot),
        timeline: timelineLike(ctx),
        audioTrack: typeof args.audioTrack === 'string' ? args.audioTrack : undefined,
        captionTrack: typeof args.captionTrack === 'string' ? args.captionTrack : undefined,
        timingConflictPolicy: args.timingConflictPolicy === 'ripple-after-assembly'
          ? 'ripple-after-assembly'
          : 'require-clear',
        replaceTemporaryTts: args.replaceTemporaryTts === true,
      });
      return { ok: preview.errors.every((e) => e.severity !== 'error'), ...preview };
    }

    if (name === 'narration_apply_timeline') {
      const snap = asTimingSnapshot(args.timingSnapshot);
      const sceneAudioMedia = new Map<string, {
        src: string;
        durationInFrames: number;
        transcript: Array<{ text: string; start: number; end: number }>;
        sourceRevision: string;
      }>();
      for (const scene of snap.scenes) {
        if (!scene.segments.length) continue;
        sceneAudioMedia.set(scene.sceneEntryId, {
          src: `narration://tts/${snap.timingHash}/${scene.sceneEntryId}.wav`,
          durationInFrames: scene.durationInFrames,
          transcript: snap.captionWords,
          sourceRevision: snap.timingHash.slice(0, 16),
        });
      }
      let voiceoverMedia: {
        src: string;
        durationInFrames: number;
        transcript: Array<{ text: string; start: number; end: number }>;
        sourceRevision: string;
      } | undefined;
      if (snap.source.type === 'voiceover') {
        voiceoverMedia = {
          src: `narration://voiceover/${snap.source.voiceoverSourceRevision}`,
          durationInFrames: Math.max(
            1,
            ...snap.scenes.map((s) => s.relativeEndFrame),
            msToTimelineFrames(Math.max(1, ...snap.captionWords.map((w) => w.end)), snap.timelineFps),
          ),
          transcript: snap.captionWords,
          sourceRevision: snap.source.voiceoverSourceRevision,
        };
      }

      const planned = planNarrationTimelineApply({
        timingSnapshot: snap,
        timeline: timelineLike(ctx),
        requestId: String(args.requestId ?? ''),
        audioTrack: typeof args.audioTrack === 'string' ? args.audioTrack : undefined,
        captionTrack: typeof args.captionTrack === 'string' ? args.captionTrack : undefined,
        timingConflictPolicy: args.timingConflictPolicy === 'ripple-after-assembly'
          ? 'ripple-after-assembly'
          : 'require-clear',
        replaceTemporaryTts: args.replaceTemporaryTts === true,
        uid,
        sceneAudioMedia,
        voiceoverMedia,
      });

      if (!planned.result.replayed && planned.actions.length > 0) {
        const batch = mapActions(planned.actions);
        // Filter unsupported setCaptions into a best-effort timeline update if needed
        const supported = batch.filter((a) => (a as { type?: string }).type !== 'tl.setCaptions');
        const captionsAction = batch.find((a) => (a as { type?: string }).type === 'tl.setCaptions') as
          | { captions: Record<string, unknown> }
          | undefined;
        if (captionsAction) {
          // Attach captions onto the first narration audio add via props if reducer lacks setCaptions
          for (const action of supported) {
            if ((action as { type?: string }).type === 'add') {
              const add = action as { item: Record<string, unknown> };
              add.item.captionsMeta = captionsAction.captions;
            }
          }
        }
        if (supported.length) {
          ctx.commands.batch(supported as never, planned.result.actionSummary);
        }
      }
      return { ...planned.result, ok: planned.result.ok, preview: planned.preview };
    }

    if (name === 'narration_validate_timeline') {
      const report = inspectNarrationTimeline({
        timingSnapshot: asTimingSnapshot(args.timingSnapshot),
        timeline: timelineLike(ctx),
      });
      return { ok: report.valid, ...report };
    }

    if (name === 'narration_export_subtitles') {
      const snap = asTimingSnapshot(args.timingSnapshot);
      const formats = Array.isArray(args.formats)
        ? args.formats.filter((f): f is 'srt' | 'vtt' => f === 'srt' || f === 'vtt')
        : ['srt', 'vtt'] as Array<'srt' | 'vtt'>;
      const exported = exportSubtitles({
        words: snap.captionWords,
        pacing: 'phrase',
        formats,
        timeOrigin: args.timeOrigin === 'narration-assembly' ? 'narration-assembly' : 'timeline',
        narrationPlanId: snap.narrationPlanId,
        narrationPlanHash: snap.narrationPlanHash,
        timingHash: snap.timingHash,
      });
      return { ok: true, ...exported };
    }

    return { error: `unknown tool ${name}` };
  } catch (error) {
    if (error instanceof NarrationError) {
      return {
        error: `${error.code}: ${error.message}`,
        code: error.code,
        diagnostics: error.diagnostics,
        recovery: error.recovery,
        details: error.details,
      };
    }
    throw error;
  }
}
