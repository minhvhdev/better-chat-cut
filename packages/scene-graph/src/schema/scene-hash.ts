import { createHash } from 'node:crypto';
import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import { stableStringify } from './scene-serialization.ts';

export function computeSceneContentHash(scene: SceneDocumentV1): string {
  return createHash('sha256').update(stableStringify(scene)).digest('hex');
}

export function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}
