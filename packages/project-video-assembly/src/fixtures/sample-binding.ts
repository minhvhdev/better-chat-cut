import { ensureBetterChatCutMotionRuntime } from '../../../motion-components/src/index.ts';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  createSceneDependencyResolver,
  normalizeSceneDocument,
} from '../../../scene-graph/src/index.ts';
import { withBindingPayloadHash, type SceneClipBindingV1 } from '../../../project-scene-bindings/src/index.ts';

ensureBetterChatCutMotionRuntime();

export async function sampleVideoPlanBinding(sceneId = 'scene.basic-explainer'): Promise<SceneClipBindingV1> {
  const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
  if (!normalized.success) throw new Error('normalize failed');
  const scene = { ...normalized.scene, id: sceneId };
  const sceneContentHash = computeSceneContentHash(scene);
  const resolved = await createSceneDependencyResolver().resolve(scene);
  if (resolved.errors.length) {
    throw new Error(`dependency resolve failed: ${resolved.errors.map((e) => e.message).join('; ')}`);
  }
  return withBindingPayloadHash({
    schemaVersion: '1.0.0',
    bindingMode: 'embedded-snapshot',
    sourceDraft: {
      draftId: 'draft.video-plan',
      draftRevision: 1,
      historyEntryId: 'hist_vp',
      sceneContentHash,
    },
    scene,
    sceneContentHash,
    dependencyFingerprint: resolved.dependencyFingerprint,
    catalogRevision: resolved.catalogRevision ?? 'catalog-live',
    motionRuntimeRevision: 'motion-live',
    sceneRuntimeRevision: computeSceneRuntimeRevision(),
    dependencies: {
      assets: resolved.assets.map((asset) => ({
        id: asset.assetId,
        version: asset.assetVersion,
        contentHash: asset.contentHash ?? `${asset.assetId}@${asset.assetVersion}`,
        status: (asset.status === 'deprecated' || asset.status === 'staging' || asset.status === 'published')
          ? asset.status
          : 'published',
      })),
      animations: resolved.animations.map((animation) => ({
        id: animation.animationId,
        version: animation.animationVersion,
      })),
      theme: { id: scene.theme.id, version: scene.theme.version },
    },
  });
}
