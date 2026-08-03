export type VideoPlanScheduledSceneV1 = {
  entryId: string;
  sequenceIndex: number;
  relativeStartFrame: number;
  durationInFrames: number;
  relativeEndFrame: number;
  gapAfterFrames: number;
  sceneId: string;
  sceneContentHash: string;
  bindingPayloadHash: string;
};

export type VideoPlanScheduledTransitionV1 = {
  outgoingEntryId: string;
  incomingEntryId: string;
  relativeCutFrame: number;
  type: string;
  durationInFrames: number;
  direction?: 'left' | 'right' | 'up' | 'down';
};

export type VideoPlanScheduledMarkerV1 = {
  sceneEntryId: string;
  relativeFromFrame: number;
  durationFrames: number;
  note: string;
  color: string;
  kind: 'boundary' | 'range';
};

export type VideoPlanScheduleV1 = {
  schemaVersion: '1.0.0';
  planId: string;
  planHash: string;
  fps: number;
  relativeStartFrame: 0;
  totalDurationInFrames: number;
  entries: VideoPlanScheduledSceneV1[];
  transitions: VideoPlanScheduledTransitionV1[];
  markers: VideoPlanScheduledMarkerV1[];
};
