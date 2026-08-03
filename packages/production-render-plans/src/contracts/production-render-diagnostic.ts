import type { ProductionRenderDiagnostic } from './production-render-errors.ts';

export type ProductionPreflightReportV1 = {
  ready: boolean;
  project: {
    projectId: string;
    projectFingerprint: string;
  };
  timeline: {
    timelineId: string;
    timelineFingerprint: string;
    width: number;
    height: number;
    fps: number;
    startFrame: number;
    endFrame: number;
    durationInFrames: number;
  };
  videoPlan?: {
    required: boolean;
    status?: string;
    planId?: string;
    planHash?: string;
  };
  narration?: {
    expected: boolean;
    status?: string;
    timingHash?: string;
    audioItems: number;
    captionReady: boolean;
  };
  dependencies: {
    sceneClips: number;
    readySceneClips: number;
    invalidSceneClips: number;
    mediaAssets: number;
    missingMediaAssets: number;
    runtimeDependencies: number;
    missingRuntimeDependencies: number;
    deprecatedDependencies: number;
    stagingDependencies: number;
  };
  subtitles: {
    requestedSrt: boolean;
    requestedVtt: boolean;
    sourceReady: boolean;
    cueCount?: number;
    mp4CaptionsVisible: boolean;
  };
  errors: ProductionRenderDiagnostic[];
  warnings: ProductionRenderDiagnostic[];
};
