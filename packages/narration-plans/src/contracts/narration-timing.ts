import type { NarrationCaptionPacing } from './narration-policy.ts';

/** Compatible with OpenChatCut TranscriptWord (ms timestamps). */
export type NarrationWordV1 = {
  text: string;
  start: number;
  end: number;
  speaker?: string | null;
};

export type NarrationCaptionPolicyV1 = {
  enabled: boolean;
  template?: string;
  pacing?: NarrationCaptionPacing;
  language?: string;
  track?: string;
  sourceMode?: 'narration-items' | 'manual-timing';
  style?: Record<string, unknown>;
  layout?: {
    anchor?: string;
    offsetXRatio?: number;
    offsetYRatio?: number;
  };
  export?: {
    srt?: boolean;
    vtt?: boolean;
  };
};

export type NarrationTimedSceneV1 = {
  sceneEntryId: string;
  relativeStartFrame: number;
  durationInFrames: number;
  relativeEndFrame: number;
  narrationStartFrame: number;
  narrationEndFrame: number;
  segments: {
    segmentId: string;
    startFrame: number;
    endFrame: number;
    startMs: number;
    endMs: number;
    speakerId: string;
    audioArtifactId?: string;
    timingQuality: string;
  }[];
  warnings: import('./narration-errors.ts').NarrationDiagnostic[];
};

export type NarrationTimingSnapshotV1 = {
  schemaVersion: '1.0.0';
  narrationPlanId: string;
  narrationPlanHash: string;
  baseVideoPlanId: string;
  baseVideoPlanHash: string;
  source:
    | { type: 'temporary-tts'; synthesisManifestHash: string }
    | { type: 'voiceover'; voiceoverSourceRevision: string; transcriptHash?: string };
  timelineFps: number;
  scenes: NarrationTimedSceneV1[];
  timedVideoPlan: import('../../../video-plans/src/contracts/video-plan.ts').VideoPlanV1;
  timedVideoPlanHash: string;
  captionWords: NarrationWordV1[];
  timingHash: string;
  errors: import('./narration-errors.ts').NarrationDiagnostic[];
  warnings: import('./narration-errors.ts').NarrationDiagnostic[];
};

export type NarrationPlanValidationResultV1 = {
  valid: boolean;
  normalizedPlan?: import('./narration-plan.ts').NarrationPlanV1;
  narrationPlanHash?: string;
  narrationRuntimeRevision: string;
  errors: import('./narration-errors.ts').NarrationDiagnostic[];
  warnings: import('./narration-errors.ts').NarrationDiagnostic[];
};

export type NarrationNormalizationResult = {
  ok: boolean;
  plan?: import('./narration-plan.ts').NarrationPlanV1;
  errors: import('./narration-errors.ts').NarrationDiagnostic[];
  warnings: import('./narration-errors.ts').NarrationDiagnostic[];
};
