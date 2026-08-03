export type SceneDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
  frame?: number;
  recovery?: string;
};

export type SceneErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export const SCENE_ERROR_CODES = [
  'SCENE_SCHEMA_UNSUPPORTED',
  'SCENE_DOCUMENT_TOO_LARGE',
  'SCENE_TOO_MANY_NODES',
  'SCENE_GRAPH_TOO_DEEP',
  'SCENE_INVALID_ID',
  'SCENE_DUPLICATE_NODE_ID',
  'SCENE_PARENT_NOT_FOUND',
  'SCENE_PARENT_NOT_GROUP',
  'SCENE_GRAPH_CYCLE',
  'SCENE_INVALID_NODE_TYPE',
  'SCENE_INVALID_TIMING',
  'SCENE_INVALID_LAYOUT',
  'SCENE_INVALID_TRANSFORM',
  'SCENE_INVALID_ANCHOR',
  'SCENE_INVALID_OPACITY',
  'SCENE_INVALID_NUMBER',
  'SCENE_ASSET_NOT_FOUND',
  'SCENE_ASSET_VERSION_NOT_FOUND',
  'SCENE_ASSET_NOT_RENDERABLE',
  'SCENE_ASSET_DRAFT_NOT_ALLOWED',
  'SCENE_ASSET_DEPRECATED',
  'SCENE_ANIMATION_NOT_FOUND',
  'SCENE_ANIMATION_VERSION_NOT_FOUND',
  'SCENE_INVALID_ANIMATION_PARAMS',
  'SCENE_ANIMATION_OUT_OF_RANGE',
  'SCENE_THEME_NOT_FOUND',
  'SCENE_THEME_VERSION_NOT_FOUND',
  'SCENE_INVALID_FRAME',
  'SCENE_EVALUATION_FAILED',
  'SCENE_RENDER_FAILED',
  'SCENE_CONTACT_SHEET_FAILED',
  'SCENE_CACHE_READ_FAILED',
  'SCENE_CACHE_WRITE_FAILED',
  'SCENE_PREVIEW_TOO_LARGE',
  'SCENE_DUPLICATE_SIBLING_ORDER',
  'SCENE_UNKNOWN_FIELD',
  'SCENE_NON_SERIALIZABLE',
  'SCENE_INVALID_PROPS',
] as const;

export type SceneErrorCode = (typeof SCENE_ERROR_CODES)[number];

export function diagnostic(
  severity: SceneDiagnostic['severity'],
  code: string,
  message: string,
  extra?: Partial<SceneDiagnostic>,
): SceneDiagnostic {
  return { severity, code, message, ...extra };
}
