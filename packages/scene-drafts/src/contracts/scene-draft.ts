import type { SceneDocumentV1 } from '../../../scene-graph/src/index.ts';
import type { SceneDraftAssetPlanReferenceV1 } from './asset-plan-binding.ts';
import type { SceneDraftDiagnostic } from './scene-draft-errors.ts';
import type { SceneChangeSummaryV1 } from './scene-change-summary.ts';
import type { ScenePatchV1 } from './scene-patch.ts';
import type { AssetPlanSceneCompositionSpecV1 } from './asset-plan-composition-spec.ts';
import type { AssetPlanV1 } from '../../../asset-resolver/src/index.ts';
import type { SceneDiagnostic } from '../../../scene-graph/src/contracts/scene-errors.ts';

export const SCENE_DRAFT_SCHEMA_VERSION = '1.0.0' as const;
export const DRAFT_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;
export const MAX_SCENE_DRAFT_HISTORY_ENTRIES = 200;
export const SCENE_DRAFT_LOCK_TIMEOUT_MS = 10_000;
export const SCENE_DRAFT_LOCK_POLL_MS = 50;

export type SceneDraftWriteGuard = {
  requestId: string;
  expectedRevision: number;
  expectedSceneContentHash: string;
  dryRun?: boolean;
};

export type CreateSceneDraftInput = {
  requestId: string;
  draftId: string;
  name: string;
  description?: string;
  scene: SceneDocumentV1;
  dryRun?: boolean;
};

export type ComposeSceneDraftFromAssetPlanInput = {
  requestId: string;
  plan: AssetPlanV1;
  compositionSpec: AssetPlanSceneCompositionSpecV1;
  dryRun?: boolean;
};

export type ApplySceneDraftPatchInput = SceneDraftWriteGuard & {
  draftId: string;
  patch: ScenePatchV1;
  includePredictedScene?: boolean;
};

export type SceneDraftHistoryMutationInput = SceneDraftWriteGuard & {
  draftId: string;
  steps?: number;
};

export type SceneDraftSummaryV1 = {
  draftId: string;
  name: string;
  description?: string;
  revision: number;
  sceneId: string;
  sceneContentHash: string;
  nodeCount: number;
  durationInFrames: number;
  fps: number;
  canUndo: boolean;
  canRedo: boolean;
  sourceAssetPlan?: {
    planId: string;
    planHash: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type SceneDraftHistoryEntrySummaryV1 = {
  entryId: string;
  sceneContentHash: string;
  operation: {
    type: 'create' | 'compose-asset-plan' | 'patch';
    requestId: string;
    patchHash?: string;
  };
  createdAt: string;
};

export type SceneDraftDetailV1 = {
  summary: SceneDraftSummaryV1;
  scene: SceneDocumentV1;
  sourceAssetPlan?: SceneDraftAssetPlanReferenceV1;
  history: {
    cursor: number;
    count: number;
    entries: SceneDraftHistoryEntrySummaryV1[];
  };
};

export type SceneDraftCreateResultV1 = {
  dryRun: boolean;
  replayedFromReceipt: boolean;
  draft: SceneDraftSummaryV1;
  resultingRevision: number;
  resultingSceneContentHash: string;
  historyEntryId: string;
  warnings: SceneDraftDiagnostic[];
  predictedScene?: SceneDocumentV1;
};

export type SceneDraftPatchPlanV1 = {
  dryRun: true;
  draftId: string;
  currentRevision: number;
  currentSceneContentHash: string;
  patchHash: string;
  predictedSceneContentHash: string;
  predictedScene?: SceneDocumentV1;
  validation: {
    valid: boolean;
    errors: SceneDiagnostic[];
    warnings: SceneDiagnostic[];
    sceneContentHash?: string;
    dependencyFingerprint?: string;
  };
  changeSummary: SceneChangeSummaryV1;
  warnings: SceneDraftDiagnostic[];
};

export type SceneDraftMutationResultV1 = {
  dryRun: false;
  replayedFromReceipt: boolean;
  draft: SceneDraftSummaryV1;
  previousRevision: number;
  resultingRevision: number;
  previousSceneContentHash: string;
  resultingSceneContentHash: string;
  historyEntryId: string;
  patchHash?: string;
  changeSummary?: SceneChangeSummaryV1;
  warnings: SceneDraftDiagnostic[];
};

export type SceneDraftPatchResultV1 = SceneDraftPatchPlanV1 | SceneDraftMutationResultV1;

export type SceneDraftHistoryDryRunResultV1 = {
  dryRun: true;
  draftId: string;
  currentRevision: number;
  currentSceneContentHash: string;
  predictedRevision: number;
  predictedSceneContentHash: string;
  targetHistoryEntryId: string;
  targetSceneSummary: {
    sceneId: string;
    nodeCount: number;
    durationInFrames: number;
    fps: number;
  };
  warnings: SceneDraftDiagnostic[];
};

export type SceneDraftValidationResultV1 = {
  draftId: string;
  revision: number;
  historyEntryId: string;
  sceneContentHash: string;
  valid: boolean;
  dependencyFingerprint?: string;
  errors: SceneDraftDiagnostic[];
  warnings: SceneDraftDiagnostic[];
};

export type RenderSceneDraftPreviewInput = {
  draftId: string;
  historyEntryId?: string;
  mode: 'still' | 'contact-sheet';
  frame?: number;
  frames?: number[];
  columns?: number;
  cellLabelMode?: 'none' | 'frame';
  outputWidth?: number;
  outputHeight?: number;
  cellWidth?: number;
};
