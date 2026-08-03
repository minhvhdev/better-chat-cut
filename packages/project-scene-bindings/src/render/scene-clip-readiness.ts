import {
  computeSceneContentHash,
  createSceneDependencyResolver,
  createSceneValidator,
} from '../../../scene-graph/src/index.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import type { SceneClipReadinessResult } from '../contracts/scene-clip-status.ts';
import { sceneClipDiagnostic } from '../contracts/scene-clip-errors.ts';
import { parseSceneClipBinding } from '../schema/scene-clip-props-validator.ts';

export async function validateBetterChatCutSceneClipReadiness(
  item: SceneClipTimelineItemLike,
): Promise<SceneClipReadinessResult> {
  const parsed = parseSceneClipBinding(item);
  const errors = [...parsed.errors];
  const warnings = [...parsed.warnings];
  if (!parsed.binding) {
    return { ready: false, errors, warnings };
  }
  const binding = parsed.binding;

  const sceneHash = computeSceneContentHash(binding.scene);
  if (sceneHash !== binding.sceneContentHash) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_SCENE_HASH_INVALID', 'Embedded scene hash mismatch', {
      itemId: item.id,
      sceneId: binding.scene.id,
      recovery: 'Regenerate binding payload',
    }));
  }

  const validator = createSceneValidator();
  const schema = await validator.validate(binding.scene);
  if (!schema.valid) {
    for (const d of schema.errors) {
      errors.push(sceneClipDiagnostic('error', d.code || 'SCENE_BINDING_SCENE_INVALID', d.message, {
        itemId: item.id,
        sceneId: binding.scene.id,
        path: d.path,
        recovery: d.recovery ?? 'Fix the embedded scene',
      }));
    }
  }

  const resolver = createSceneDependencyResolver();
  const deps = await resolver.resolve(binding.scene);
  for (const d of deps.errors) {
    const code = d.code.includes('DRAFT') || d.message.toLowerCase().includes('draft')
      ? 'SCENE_CLIP_DRAFT_RUNTIME_NOT_ALLOWED'
      : d.code.includes('NOT_FOUND') || d.code.includes('NOT_RENDERABLE')
        ? 'SCENE_CLIP_RUNTIME_UNAVAILABLE'
        : 'SCENE_BINDING_DEPENDENCY_INVALID';
    errors.push(sceneClipDiagnostic('error', code, d.message, {
      itemId: item.id,
      recovery: d.recovery ?? 'Ensure exact staged/published runtimes are available',
    }));
  }
  for (const d of deps.warnings) {
    warnings.push(sceneClipDiagnostic('warning', d.code, d.message, {
      itemId: item.id,
      recovery: d.recovery,
    }));
  }

  if (deps.dependencyFingerprint && deps.dependencyFingerprint !== binding.dependencyFingerprint) {
    // Catalog/runtime environment may differ; check pinned content hashes instead of hard-failing on fingerprint alone.
    warnings.push(sceneClipDiagnostic('warning', 'SCENE_CLIP_DEPENDENCY_FINGERPRINT_INVALID', 'Live dependency fingerprint differs from binding pin', {
      itemId: item.id,
      details: { pinned: binding.dependencyFingerprint, live: deps.dependencyFingerprint },
      recovery: 'Re-sync from scene draft if dependencies intentionally changed',
    }));
  }

  // Content-hash drift for pinned assets
  for (const pinned of binding.dependencies.assets) {
    const live = deps.assets.find((a) => a.assetId === pinned.id && a.assetVersion === pinned.version);
    if (!live) {
      errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_RUNTIME_UNAVAILABLE', `Pinned asset ${pinned.id}@${pinned.version} unavailable`, {
        itemId: item.id,
        recovery: 'Install the exact asset version or re-sync with available assets',
      }));
      continue;
    }
    if (live.contentHash && pinned.contentHash && live.contentHash !== pinned.contentHash) {
      errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_DEPENDENCY_CONTENT_CHANGED', `Content hash changed for ${pinned.id}@${pinned.version}`, {
        itemId: item.id,
        details: { pinned: pinned.contentHash, live: live.contentHash },
        recovery: 'Re-generate binding payload after reviewing the asset change',
      }));
    }
    if (live.status === 'draft') {
      errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_DRAFT_RUNTIME_NOT_ALLOWED', `Draft asset ${pinned.id}@${pinned.version} is not allowed`, {
        itemId: item.id,
        recovery: 'Promote the asset to staging/published',
      }));
    }
    if (pinned.status === 'deprecated' || live.status === 'deprecated') {
      warnings.push(sceneClipDiagnostic('warning', 'SCENE_ASSET_DEPRECATED', `Deprecated asset ${pinned.id}@${pinned.version}`, {
        itemId: item.id,
        recovery: 'Migrate to a published replacement when available',
      }));
    }
  }

  if (!Number.isFinite(binding.scene.canvas.width) || binding.scene.canvas.width < 1
    || !Number.isFinite(binding.scene.canvas.height) || binding.scene.canvas.height < 1) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_BINDING_SCENE_INVALID', 'Scene canvas is invalid', {
      itemId: item.id,
      recovery: 'Fix scene canvas dimensions',
    }));
  }
  if (!Number.isFinite(binding.scene.durationInFrames) || binding.scene.durationInFrames < 1) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_INVALID_DURATION', 'Scene duration is invalid', {
      itemId: item.id,
      recovery: 'Fix scene durationInFrames',
    }));
  }

  return { ready: errors.length === 0, errors, warnings };
}
