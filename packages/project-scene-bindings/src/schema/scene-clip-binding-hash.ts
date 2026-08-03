import type {
  SceneClipBindingDependenciesV1,
  SceneClipBindingV1,
  SceneClipBindingWithoutHash,
} from '../contracts/scene-clip-binding.ts';
import { sha256Hex } from './scene-clip-hash.ts';
import { deepCloneJson, stableStringify } from './scene-clip-serialization.ts';

function sortDependencies(deps: SceneClipBindingDependenciesV1): SceneClipBindingDependenciesV1 {
  return {
    theme: { ...deps.theme },
    assets: [...deps.assets]
      .map((asset) => ({ ...asset }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version)),
    animations: [...deps.animations]
      .map((animation) => ({ ...animation }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version)),
  };
}

/** Normalize binding fields that must not affect hash stability. */
export function normalizeBindingForHash(
  payload: SceneClipBindingWithoutHash,
): SceneClipBindingWithoutHash {
  const copy = deepCloneJson(payload);
  copy.dependencies = sortDependencies(copy.dependencies);
  return copy;
}

export function computeSceneClipBindingPayloadHash(
  payloadWithoutHash: SceneClipBindingWithoutHash,
): string {
  const normalized = normalizeBindingForHash(payloadWithoutHash);
  return sha256Hex(stableStringify(normalized));
}

export function withBindingPayloadHash(
  payloadWithoutHash: SceneClipBindingWithoutHash,
): SceneClipBindingV1 {
  const normalized = normalizeBindingForHash(payloadWithoutHash);
  return {
    ...normalized,
    bindingPayloadHash: computeSceneClipBindingPayloadHash(normalized),
  };
}

export function computeCreateInputHash(input: {
  bindingPayloadHash: string;
  track?: string;
  startFrame?: number;
  ripple?: boolean;
  name?: string;
}): string {
  return sha256Hex(stableStringify({
    bindingPayloadHash: input.bindingPayloadHash,
    track: input.track ?? null,
    startFrame: input.startFrame ?? null,
    ripple: input.ripple === true,
    name: input.name ?? null,
  }));
}
