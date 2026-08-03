import { resolveThemeRegistryId } from './theme-id.ts';
import {
  computeRuntimeRevision,
  ensureBetterChatCutMotionRuntime,
  getMotionAnimation,
  getMotionComponent,
  getMotionTheme,
  validateMotionProps,
} from '../../../motion-components/src/index.ts';
import {
  createGlobalAssetRegistry,
  resolveAssetCatalogRootDescriptors,
} from '../../../global-asset-registry/src/index.ts';
import { refreshVerifiedUserMotionRuntimes } from '../../../motion-source-pipeline/src/runtime/user-runtime-registry.ts';
import { resolveWritableAssetCatalogRoot } from '../../../global-asset-registry/src/index.ts';
import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneDependencyResolution } from '../contracts/scene-dependency.ts';
import { diagnostic } from '../contracts/scene-errors.ts';
import { computeSceneContentHash, sha256Hex } from '../schema/scene-hash.ts';
import { computeSceneRuntimeRevision } from '../schema/scene-schema.ts';
import { stableStringify } from '../schema/scene-serialization.ts';
import { SCENE_RUNTIME_CONTRACT_VERSION } from '../contracts/scene-document.ts';
import { BUILTIN_THEME_VERSION } from './theme-id.ts';

export { resolveThemeRegistryId } from './theme-id.ts';

export interface SceneDependencyResolver {
  resolve(scene: SceneDocumentV1): Promise<SceneDependencyResolution>;
}

export function createSceneDependencyResolver(options?: {
  roots?: ReturnType<typeof resolveAssetCatalogRootDescriptors>;
}): SceneDependencyResolver {
  return {
    async resolve(scene: SceneDocumentV1): Promise<SceneDependencyResolution> {
      ensureBetterChatCutMotionRuntime();
      const roots = options?.roots ?? resolveAssetCatalogRootDescriptors();
      const registry = createGlobalAssetRegistry({ roots, strict: false });
      await registry.refresh();
      try {
        await refreshVerifiedUserMotionRuntimes({
          registry: registry as never,
          userCatalogRoot: resolveWritableAssetCatalogRoot().path,
        });
      } catch {
        // User catalog may be unavailable in some verify contexts; built-ins still resolve.
      }

      const errors = [];
      const warnings = [];
      const motionRuntimeRevision = computeRuntimeRevision();
      const catalogRevision = registry.getSnapshot().revision;

      const themeRegistryId = resolveThemeRegistryId(scene.theme.id);
      const themeDef = getMotionTheme(themeRegistryId);
      const themeFound = Boolean(themeDef) && scene.theme.version === BUILTIN_THEME_VERSION;
      if (!themeDef) {
        errors.push(diagnostic('error', 'SCENE_THEME_NOT_FOUND', `Theme "${scene.theme.id}" not found`, {
          path: 'theme.id',
          recovery: 'Use default or high-contrast (or better-chat-cut.default)',
        }));
      } else if (scene.theme.version !== BUILTIN_THEME_VERSION) {
        errors.push(diagnostic('error', 'SCENE_THEME_VERSION_NOT_FOUND', `Theme version "${scene.theme.version}" not found`, {
          path: 'theme.version',
          recovery: `Use version "${BUILTIN_THEME_VERSION}"`,
        }));
      }

      const assetMap = new Map<string, {
        nodeIds: string[];
        assetId: string;
        assetVersion: string;
      }>();
      const animationMap = new Map<string, {
        nodeIds: string[];
        animationId: string;
        animationVersion: string;
      }>();

      for (const node of scene.nodes) {
        if (node.type === 'asset') {
          const key = `${node.asset.id}@${node.asset.version}`;
          const entry = assetMap.get(key) ?? {
            nodeIds: [] as string[],
            assetId: node.asset.id,
            assetVersion: node.asset.version,
          };
          entry.nodeIds.push(node.id);
          assetMap.set(key, entry);
        }
        for (const anim of node.animations ?? []) {
          const key = `${anim.animation.id}@${anim.animation.version}`;
          const entry = animationMap.get(key) ?? {
            nodeIds: [] as string[],
            animationId: anim.animation.id,
            animationVersion: anim.animation.version,
          };
          entry.nodeIds.push(node.id);
          animationMap.set(key, entry);
        }
      }

      const assets = [];
      for (const entry of [...assetMap.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)
        || a.assetVersion.localeCompare(b.assetVersion))) {
        const detail = registry.getDetail(entry.assetId, entry.assetVersion);
        const runtime = getMotionComponent(entry.assetId, entry.assetVersion);
        const status = detail?.manifest.status;
        let manifestFound = Boolean(detail);
        let runtimeAvailable = Boolean(runtime);

        if (!detail) {
          // Built-in runtime may exist without a catalog row for some animation-only assets;
          // for scene assets we still require catalog OR built-in runtime.
          if (!runtime) {
            errors.push(diagnostic('error', 'SCENE_ASSET_NOT_FOUND', `Asset ${entry.assetId}@${entry.assetVersion} not found`, {
              recovery: 'Pin an existing catalog asset id and version',
            }));
          } else {
            manifestFound = false;
            // Built-in components are allowed without catalog when runtime exists.
            manifestFound = true;
          }
        } else if (status === 'draft') {
          errors.push(diagnostic('error', 'SCENE_ASSET_DRAFT_NOT_ALLOWED', `Draft asset ${entry.assetId}@${entry.assetVersion} cannot be used in scenes`, {
            recovery: 'Promote to staging after verification',
          }));
          runtimeAvailable = false;
        } else if (status === 'deprecated') {
          warnings.push(diagnostic('warning', 'SCENE_ASSET_DEPRECATED', `Deprecated asset ${entry.assetId}@${entry.assetVersion} pinned exactly`, {
            recovery: 'Migrate to a published replacement when available',
          }));
        }

        if (!runtime) {
          errors.push(diagnostic('error', 'SCENE_ASSET_NOT_RENDERABLE', `No normal runtime for ${entry.assetId}@${entry.assetVersion}`, {
            recovery: 'Use staging/published verified runtime; draft candidates are not allowed',
          }));
          runtimeAvailable = false;
        }

        // Validate props for each referencing node
        if (runtime) {
          for (const nodeId of entry.nodeIds) {
            const node = scene.nodes.find((n) => n.id === nodeId);
            if (!node || node.type !== 'asset') continue;
            const validated = validateMotionProps(
              runtime.propsSchema,
              node.asset.props ?? {},
              runtime.defaultProps,
            );
            if (!validated.valid) {
              for (const issue of validated.errors) {
                errors.push(diagnostic('error', 'SCENE_INVALID_PROPS', issue.message, {
                  nodeId,
                  path: `asset.props.${issue.path}`,
                  recovery: 'Fix props to match the asset propsSchema',
                }));
              }
            }
          }
        }

        assets.push({
          nodeIds: entry.nodeIds,
          assetId: entry.assetId,
          assetVersion: entry.assetVersion,
          status,
          contentHash: detail?.contentHash,
          implementationFingerprint: detail?.manifest.implementation
            ? sha256Hex(stableStringify(detail.manifest.implementation))
            : runtime
              ? sha256Hex(`${runtime.assetId}@${runtime.assetVersion}:builtin`)
              : undefined,
          manifestFound,
          runtimeAvailable,
        });
      }

      const animations = [];
      for (const entry of [...animationMap.values()].sort((a, b) => a.animationId.localeCompare(b.animationId)
        || a.animationVersion.localeCompare(b.animationVersion))) {
        const detail = registry.getDetail(entry.animationId, entry.animationVersion);
        const runtime = getMotionAnimation(entry.animationId, entry.animationVersion);
        const manifestFound = Boolean(detail) || Boolean(runtime);
        const runtimeAvailable = Boolean(runtime);
        if (!runtime) {
          errors.push(diagnostic('error', 'SCENE_ANIMATION_NOT_FOUND', `Animation ${entry.animationId}@${entry.animationVersion} not found`, {
            recovery: 'Pin an existing animation id and version',
          }));
        } else if (entry.animationVersion !== runtime.assetVersion) {
          errors.push(diagnostic('error', 'SCENE_ANIMATION_VERSION_NOT_FOUND', `Animation version mismatch for ${entry.animationId}`, {
            recovery: `Use version "${runtime.assetVersion}"`,
          }));
        }
        animations.push({
          nodeIds: entry.nodeIds,
          animationId: entry.animationId,
          animationVersion: entry.animationVersion,
          manifestFound,
          runtimeAvailable,
        });
      }

      const sceneContentHash = computeSceneContentHash(scene);
      const fingerprintPayload = stableStringify({
        sceneContentHash,
        catalogRevision,
        assets: assets.map((a) => ({
          id: a.assetId,
          version: a.assetVersion,
          contentHash: a.contentHash ?? null,
          implementationFingerprint: a.implementationFingerprint ?? null,
        })),
        animations: animations.map((a) => ({
          id: a.animationId,
          version: a.animationVersion,
          runtime: a.runtimeAvailable,
        })),
        theme: { id: scene.theme.id, version: scene.theme.version },
        motionRuntimeRevision,
        sceneRuntimeContractVersion: SCENE_RUNTIME_CONTRACT_VERSION,
        sceneRuntimeRevision: computeSceneRuntimeRevision(),
      });
      const dependencyFingerprint = sha256Hex(fingerprintPayload);

      return {
        catalogRevision,
        motionRuntimeRevision,
        theme: {
          id: scene.theme.id,
          version: scene.theme.version,
          found: themeFound,
        },
        assets,
        animations,
        dependencyFingerprint,
        errors,
        warnings,
      };
    },
  };
}
