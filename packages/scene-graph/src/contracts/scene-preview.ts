import type { SceneDiagnostic } from './scene-errors.ts';
import type { SceneDocumentV1 } from './scene-document.ts';

export type SceneStillCompositionInput = {
  scene: SceneDocumentV1;
  frame: number;
};

export type SceneContactSheetCompositionInput = {
  scene: SceneDocumentV1;
  frames: number[];
  columns: number;
  cellLabelMode: 'none' | 'frame';
};

export type RenderSceneStillInput = {
  scene: SceneDocumentV1;
  frame: number;
  outputWidth?: number;
  outputHeight?: number;
};

export type RenderSceneContactSheetInput = {
  scene: SceneDocumentV1;
  frames?: number[];
  columns?: number;
  cellLabelMode?: 'none' | 'frame';
  cellWidth?: number;
};

export type ScenePreviewMetadata = {
  sceneId: string;
  sceneContentHash: string;
  dependencyFingerprint: string;
  catalogRevision: string;
  motionRuntimeRevision: string;
  sceneRuntimeRevision: string;
  mode: 'still' | 'contact-sheet';
  frame?: number;
  frames?: number[];
  width: number;
  height: number;
  mimeType: 'image/png';
  byteLength: number;
  cacheKey: string;
  cacheHit: boolean;
  diagnostics: SceneDiagnostic[];
};

export type SceneStillResult = ScenePreviewMetadata & {
  base64: string;
};

export type SceneContactSheetResult = ScenePreviewMetadata & {
  base64: string;
};

export type SceneLayoutAnalysis = {
  sceneId: string;
  frames: number[];
  diagnostics: SceneDiagnostic[];
  overlaps: Array<{
    frame: number;
    a: string;
    b: string;
    approximate: true;
  }>;
};
