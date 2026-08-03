import { validateBetterChatCutSceneClipReadiness } from '../../../project-scene-bindings/src/render/scene-clip-readiness.ts';
import { discoverVideoPlanClips } from '../inspection/assembly-discovery.ts';
import type { AssemblyTimelineLike } from '../planning/track-resolver.ts';

export async function evaluateAssemblyReadiness(input: {
  timeline: AssemblyTimelineLike;
  planId: string;
  planHash: string;
}): Promise<{
  planRangeReady: boolean;
  timelineExportReady: boolean;
  sceneClipsReady: number;
  sceneClipsNotReady: number;
}> {
  const clips = discoverVideoPlanClips(input.timeline, input.planId, input.planHash);
  let ready = 0;
  let notReady = 0;
  for (const clip of clips) {
    const result = await validateBetterChatCutSceneClipReadiness(clip as never);
    if (result.ready) ready += 1;
    else notReady += 1;
  }
  const planRangeReady = clips.length > 0 && notReady === 0;
  return {
    planRangeReady,
    timelineExportReady: planRangeReady,
    sceneClipsReady: ready,
    sceneClipsNotReady: notReady,
  };
}
