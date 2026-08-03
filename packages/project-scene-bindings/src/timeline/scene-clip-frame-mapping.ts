export function timelineFrameToSceneFrame(input: {
  itemLocalFrame: number;
  itemSrcInFrame?: number;
  timelineFps: number;
  sceneFps: number;
  sceneDurationInFrames: number;
}): number {
  const {
    itemLocalFrame,
    itemSrcInFrame,
    timelineFps,
    sceneFps,
    sceneDurationInFrames,
  } = input;

  if (!Number.isFinite(timelineFps) || timelineFps <= 0
    || !Number.isFinite(sceneFps) || sceneFps <= 0
    || !Number.isFinite(sceneDurationInFrames) || sceneDurationInFrames < 1) {
    return 0;
  }

  const local = Number.isFinite(itemLocalFrame) ? Math.max(0, itemLocalFrame) : 0;
  const srcIn = Number.isFinite(itemSrcInFrame ?? 0) ? Math.max(0, itemSrcInFrame ?? 0) : 0;
  const sourceTimelineFrame = srcIn + local;
  const sceneFrame = Math.floor((sourceTimelineFrame * sceneFps) / timelineFps);
  if (!Number.isFinite(sceneFrame)) return 0;
  return Math.max(0, Math.min(sceneDurationInFrames - 1, sceneFrame));
}
