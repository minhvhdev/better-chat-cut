import type { VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';
import type { VideoPlanAssemblyStatus } from './assembly-metadata.ts';
import type { AssemblyTimelineLike } from '../planning/track-resolver.ts';

export type VideoPlanRenderValidationReportV1 = {
  valid: boolean;
  ready: boolean;
  planId: string;
  planHash: string;
  timelineId: string;
  targetTrackId?: string;
  assemblyStatus: VideoPlanAssemblyStatus;
  absoluteStartFrame?: number;
  absoluteEndFrame?: number;
  totalDurationInFrames?: number;
  timeline: {
    width: number;
    height: number;
    fps: number;
  };
  readiness: {
    planRangeReady: boolean;
    timelineExportReady: boolean;
    sceneClipsReady: number;
    sceneClipsNotReady: number;
  };
  renderedSamples: {
    frame: number;
    reasons: string[];
    rendered: boolean;
    width?: number;
    height?: number;
    byteLength?: number;
    pixelHash?: string;
    fullyTransparent?: boolean;
    mostlyBlack?: boolean;
    errors: VideoPlanDiagnostic[];
    warnings: VideoPlanDiagnostic[];
  }[];
  transitionChecks: {
    outgoingEntryId: string;
    incomingEntryId: string;
    type: string;
    durationInFrames: number;
    renderable: boolean;
    visuallyChanges: boolean;
    errors: VideoPlanDiagnostic[];
    warnings: VideoPlanDiagnostic[];
  }[];
  contactSheet?: {
    mimeType: 'image/png';
    byteLength: number;
    frames: number[];
    columns: number;
    width: number;
    height: number;
  };
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};

export type ValidateVideoPlanRenderInput = {
  plan: unknown;
  timeline: AssemblyTimelineLike;
  mode?: 'metadata-only' | 'sample-frames';
  columns?: number;
  includeTransitionSamples?: boolean;
  /** Optional PNG bytes for contact sheet (kept out of structured report). */
  onContactSheet?: (png: Uint8Array) => void;
};
