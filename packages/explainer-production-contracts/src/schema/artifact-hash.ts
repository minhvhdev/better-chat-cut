import { createHash } from 'node:crypto';
import { stableStringify } from './serialization.ts';
import type { ProductionArtifactType } from '../contracts/production-artifact-type.ts';

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function computeProductionArtifactHash(input: {
  artifactType: ProductionArtifactType;
  artifact: unknown;
}): string {
  return sha256Hex(stableStringify({
    artifactType: input.artifactType,
    artifact: input.artifact,
  }));
}

export function computeProductionRequestHash(request: unknown): string {
  return sha256Hex(stableStringify(request));
}

export function shortHash(hex: string, length = 8): string {
  return hex.slice(0, length);
}
