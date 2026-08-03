import {
  SCENE_LIMITS,
  SCENE_SCHEMA_VERSION,
  SCENE_ANIMATION_COMPOSITION_VERSION,
  SCENE_LAYOUT_FIT_SEMANTICS_VERSION,
  SCENE_RENDERER_CONTRACT_VERSION,
  SCENE_RUNTIME_CONTRACT_VERSION,
  SCENE_TRANSFORM_SEMANTICS_VERSION,
} from '../contracts/scene-document.ts';

const CAPABILITIES = [
  'group-nodes',
  'asset-nodes',
  'world-transforms',
  'fit-contain-cover-stretch',
  'scene-still',
  'scene-contact-sheet',
  'layout-analyzer',
] as const;

/** Browser-safe deterministic hash (no node:crypto) for Remotion client bundles. */
function djb2Hex(payload: string): string {
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Deterministic scene runtime revision (no timestamp, no Node APIs). */
export function computeSceneRuntimeRevision(): string {
  const payload = [
    `schema=${SCENE_SCHEMA_VERSION}`,
    `renderer=${SCENE_RENDERER_CONTRACT_VERSION}`,
    `transform=${SCENE_TRANSFORM_SEMANTICS_VERSION}`,
    `animation=${SCENE_ANIMATION_COMPOSITION_VERSION}`,
    `fit=${SCENE_LAYOUT_FIT_SEMANTICS_VERSION}`,
    `contract=${SCENE_RUNTIME_CONTRACT_VERSION}`,
    `limits=${JSON.stringify(SCENE_LIMITS)}`,
    `capabilities=${CAPABILITIES.join(',')}`,
  ].join('\n');
  return `scene-runtime-${djb2Hex(payload)}`;
}

export function getSceneRuntimeCapabilities(): readonly string[] {
  return CAPABILITIES;
}
