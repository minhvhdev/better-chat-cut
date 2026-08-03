import type { SceneClipDiagnostic } from './scene-clip-errors.ts';
import type { SceneClipBindingV1 } from './scene-clip-binding.ts';

export type SceneClipSyncStatus =
  | 'synced'
  | 'source-newer'
  | 'source-older'
  | 'source-unavailable'
  | 'detached-snapshot'
  | 'binding-invalid'
  | 'dependency-invalid';

export type SceneClipComparisonResult = {
  status: SceneClipSyncStatus;
  itemId: string;
  clipBindingHash?: string;
  sourceBindingHash?: string;
  clipDraftRevision?: number;
  sourceDraftRevision?: number;
  clipSceneContentHash?: string;
  sourceSceneContentHash?: string;
  diagnostics: SceneClipDiagnostic[];
};

export type SceneClipReadinessResult = {
  ready: boolean;
  errors: SceneClipDiagnostic[];
  warnings: SceneClipDiagnostic[];
};

export type SceneClipSummary = {
  itemId: string;
  timelineId: string;
  timelineName: string;
  trackId: string;
  startFrame: number;
  durationInFrames: number;
  srcInFrame?: number;
  name: string;
  itemFingerprint: string;
  bindingValid: boolean;
  bindingPayloadHash?: string;
  sourceDraft?: SceneClipBindingV1['sourceDraft'];
  embeddedScene?: {
    id: string;
    name: string;
    fps: number;
    durationInFrames: number;
    nodeCount: number;
  };
  errors: SceneClipDiagnostic[];
  warnings: SceneClipDiagnostic[];
};
