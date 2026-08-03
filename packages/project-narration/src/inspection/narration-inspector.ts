import type { NarrationTimingSnapshotV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import { narrationDiagnostic } from '../../../narration-plans/src/contracts/narration-errors.ts';
import type { NarrationTimelineValidationResultV1 } from '../contracts/narration-apply-preview.ts';
import {
  BETTER_CHAT_CUT_NARRATION_PROPS_KEY,
  type NarrationTimelineMetadataV1,
  type NarrationTimelineStatus,
} from '../contracts/narration-timeline-metadata.ts';
import type { NarrationTimelineLike } from '../planning/narration-apply-planner.ts';
import { readNarrationMeta, readVideoPlanMeta } from '../planning/narration-apply-planner.ts';

export function inspectNarrationTimeline(input: {
  timingSnapshot: NarrationTimingSnapshotV1;
  timeline: NarrationTimelineLike;
}): NarrationTimelineValidationResultV1 {
  const errors: ReturnType<typeof narrationDiagnostic>[] = [];
  const warnings: ReturnType<typeof narrationDiagnostic>[] = [];
  const snap = input.timingSnapshot;

  const narrItems = input.timeline.items.filter((item) => {
    const meta = readNarrationMeta(item);
    return meta?.narrationPlanId === snap.narrationPlanId;
  });

  const matchingMeta = narrItems
    .map((i) => readNarrationMeta(i))
    .filter((m): m is NarrationTimelineMetadataV1 => !!m && m.timingHash === snap.timingHash);

  let status: NarrationTimelineStatus = 'not-applied';
  if (narrItems.length === 0) status = 'not-applied';
  else if (matchingMeta.length === 0) status = 'drifted';
  else if (matchingMeta.length !== narrItems.length) status = 'incomplete';
  else {
    const dup = narrItems.length > (snap.source.type === 'voiceover' ? 1 : snap.scenes.filter((s) => s.segments.length).length);
    status = dup ? 'duplicate' : 'complete';
  }

  let matchingScenes = 0;
  let driftedScenes = 0;
  const sceneItems = input.timeline.items.filter((i) => readVideoPlanMeta(i)?.sceneEntryId);
  for (const scene of snap.scenes) {
    const item = sceneItems.find((i) => readVideoPlanMeta(i)?.sceneEntryId === scene.sceneEntryId);
    if (!item) {
      if (scene.segments.length) driftedScenes += 1;
      continue;
    }
    const assemblyStart = Math.min(...sceneItems.map((i) => i.startFrame));
    const expectedStart = assemblyStart + scene.relativeStartFrame;
    if (item.startFrame !== expectedStart || item.durationInFrames !== scene.durationInFrames) {
      driftedScenes += 1;
      errors.push(narrationDiagnostic('error', 'NARRATION_VIDEO_ASSEMBLY_DRIFTED', `Scene ${scene.sceneEntryId} timing drifted`, {
        sceneEntryId: scene.sceneEntryId,
        details: { itemId: item.id },
      }));
    } else {
      matchingScenes += 1;
    }
  }

  if (status === 'drifted') {
    errors.push(narrationDiagnostic('error', 'NARRATION_VIDEO_ASSEMBLY_DRIFTED', 'Narration timeline drifted from timing snapshot', {
      recovery: 'Re-run narration_apply_timeline with a fresh timing snapshot',
    }));
  }

  const captionsReady = Boolean(input.timeline.captions)
    || Boolean((input.timeline as { captions?: unknown }).captions);
  const ready = status === 'complete' && driftedScenes === 0 && errors.filter((e) => e.severity === 'error').length === 0;

  return {
    valid: ready,
    ready,
    status,
    narrationPlanId: snap.narrationPlanId,
    narrationPlanHash: snap.narrationPlanHash,
    timingHash: snap.timingHash,
    audio: {
      readyItems: matchingMeta.length,
      missingItems: Math.max(0, (snap.source.type === 'voiceover' ? 1 : snap.scenes.filter((s) => s.segments.length).length) - matchingMeta.length),
      durationFrames: narrItems.reduce((sum, i) => sum + i.durationInFrames, 0),
    },
    visuals: { matchingScenes, driftedScenes },
    captions: {
      enabled: true,
      ready: captionsReady || snap.captionWords.length > 0,
      cueCount: snap.captionWords.length,
      timingQuality: snap.source.type === 'voiceover' ? 'voiceover-transcript' : 'estimated-word',
    },
    errors,
    warnings,
  };
}

export { BETTER_CHAT_CUT_NARRATION_PROPS_KEY };
