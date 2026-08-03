import type { VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';
import type { VideoPlanMarkerColor } from '../../../video-plans/src/contracts/video-plan-policy.ts';

export type VideoPlanAssemblyPreviewV1 = {
  planId: string;
  planHash: string;
  timelineId: string;
  timelineName: string;
  targetTrackId: string;
  absoluteStartFrame: number;
  absoluteEndFrame: number;
  totalDurationInFrames: number;
  placementMode: 'append' | 'at-frame';
  collisionPolicy: 'require-clear' | 'ripple';
  scenes: {
    entryId: string;
    sequenceIndex: number;
    absoluteStartFrame: number;
    durationInFrames: number;
    absoluteEndFrame: number;
    sceneId: string;
    sceneContentHash: string;
    warnings: VideoPlanDiagnostic[];
  }[];
  transitions: {
    outgoingEntryId: string;
    incomingEntryId: string;
    cutFrame: number;
    type: string;
    durationInFrames: number;
    direction?: string;
  }[];
  markers: {
    sceneEntryId: string;
    fromFrame: number;
    durationFrames: number;
    note: string;
    color: VideoPlanMarkerColor;
  }[];
  collisionAnalysis: {
    clear: boolean;
    conflictingItemIds: string[];
    conflictingTransitionIds: string[];
    affectedByRippleItemIds: string[];
  };
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};
