export type ThumbnailOverlayV1 =
  | {
    type: 'label';
    id: string;
    text: string;
    box: { x: number; y: number; width: number; height: number };
    style: {
      fontSize: number;
      fontWeight?: number;
      textColor: string;
      backgroundColor?: string;
      align?: 'left' | 'center' | 'right';
    };
  }
  | {
    type: 'shape';
    id: string;
    shape: 'rectangle' | 'circle';
    box: { x: number; y: number; width: number; height: number };
    fill: string;
    opacity?: number;
  };

export type ThumbnailPlanV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  output: {
    width: number;
    height: number;
    format: 'png' | 'jpeg';
    jpegQuality?: number;
  };
  source:
    | {
      type: 'scene-frame';
      /** Portable scene document snapshot from binding or draft. */
      scene: import('../../../scene-graph/src/contracts/scene-document.ts').SceneDocumentV1;
      frame: number;
    }
    | {
      type: 'custom-scene';
      scene: import('../../../scene-graph/src/contracts/scene-document.ts').SceneDocumentV1;
    };
  overlays?: ThumbnailOverlayV1[];
  background?: { color: string };
  safeArea?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export const DEFAULT_THUMBNAIL_OUTPUT = {
  width: 1280,
  height: 720,
  format: 'png' as const,
};
