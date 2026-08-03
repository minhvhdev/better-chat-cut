import type { VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';

export type VideoPlanAssemblyResultV1 = {
  planId: string;
  planHash: string;
  assemblyId: string;
  replayed: boolean;
  timelineId: string;
  targetTrackId: string;
  absoluteStartFrame: number;
  absoluteEndFrame: number;
  totalDurationInFrames: number;
  sceneItems: {
    entryId: string;
    sequenceIndex: number;
    itemId: string;
    startFrame: number;
    durationInFrames: number;
    bindingPayloadHash: string;
    itemFingerprint: string;
  }[];
  transitionIds: string[];
  markerIds: string[];
  actionSummary: string;
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};
