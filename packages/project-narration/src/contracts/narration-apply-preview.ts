import type { NarrationDiagnostic } from '../../../narration-plans/src/contracts/narration-errors.ts';
import type { NarrationTimingConflictPolicy } from './narration-timeline-metadata.ts';

export type NarrationTimelineApplyPreviewV1 = {
  narrationPlanId: string;
  narrationPlanHash: string;
  timingHash: string;
  timelineId: string;
  videoAssembly: {
    planId: string;
    currentPlanHash: string;
    resultingPlanHash: string;
    retimeRequired: boolean;
  };
  audioTrack: { trackId: string; create: boolean };
  captionTrack?: { trackId: string; create: boolean };
  visualChanges: {
    sceneEntryId: string;
    itemId: string;
    previousStartFrame: number;
    nextStartFrame: number;
    previousDurationInFrames: number;
    nextDurationInFrames: number;
  }[];
  audioItems: {
    sourceType: 'temporary-tts' | 'voiceover';
    sceneEntryIds: string[];
    startFrame: number;
    durationInFrames: number;
    transcriptWordCount: number;
    timingQuality: string;
  }[];
  captions?: {
    enabled: boolean;
    cueCount: number;
    timingQuality: string;
  };
  collisionAnalysis: {
    clear: boolean;
    conflictingItemIds: string[];
    rippleAffectedItemIds: string[];
  };
  errors: NarrationDiagnostic[];
  warnings: NarrationDiagnostic[];
};

export type NarrationTimelineApplyResultV1 = {
  ok: boolean;
  replayed: boolean;
  narrationAssemblyId: string;
  timingHash: string;
  actionSummary: string;
  appliedActionCount: number;
  errors: NarrationDiagnostic[];
  warnings: NarrationDiagnostic[];
};

export type NarrationTimelineValidationResultV1 = {
  valid: boolean;
  ready: boolean;
  status: import('./narration-timeline-metadata.ts').NarrationTimelineStatus;
  narrationPlanId: string;
  narrationPlanHash: string;
  timingHash: string;
  audio: { readyItems: number; missingItems: number; durationFrames: number };
  visuals: { matchingScenes: number; driftedScenes: number };
  captions: { enabled: boolean; ready: boolean; cueCount: number; timingQuality?: string };
  errors: NarrationDiagnostic[];
  warnings: NarrationDiagnostic[];
};

export type ProjectNarrationErrors = NarrationDiagnostic;
export type { NarrationTimingConflictPolicy };
