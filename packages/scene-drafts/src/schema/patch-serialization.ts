import { createHash } from 'node:crypto';
import { stableStringify } from '../../../scene-graph/src/index.ts';

export function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

export function computeInputHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export { stableStringify };
