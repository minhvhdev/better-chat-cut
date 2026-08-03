import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneDiagnostic } from '../contracts/scene-errors.ts';
import type { SceneDependencyResolution } from '../contracts/scene-dependency.ts';
import type { SceneLayoutAnalysis } from '../contracts/scene-preview.ts';
import { normalizeSceneDocument } from './scene-normalization.ts';
import { computeSceneContentHash } from './scene-hash.ts';
import { computeSceneRuntimeRevision } from './scene-schema.ts';
import { validateSceneGraphStructure } from '../graph/graph-validation.ts';
import { validateSceneTimingAndLayout } from '../graph/graph-traversal.ts';
import { createSceneDependencyResolver } from '../dependencies/scene-dependency-resolver.ts';
import { analyzeSceneLayout } from '../analysis/scene-layout-analyzer.ts';

export type SceneValidationOptions = {
  includeNormalizedScene?: boolean;
  includeDependencies?: boolean;
  analyzeLayout?: boolean;
  analysisFrames?: number[];
  roots?: Parameters<typeof createSceneDependencyResolver>[0] extends infer T
    ? T extends { roots?: infer R } ? R : never
    : never;
};

export type SceneValidationResult = {
  valid: boolean;
  normalizedScene?: SceneDocumentV1;
  sceneContentHash?: string;
  dependencyFingerprint?: string;
  catalogRevision?: string;
  motionRuntimeRevision?: string;
  sceneRuntimeRevision: string;
  dependencies?: SceneDependencyResolution;
  layoutAnalysis?: SceneLayoutAnalysis;
  errors: SceneDiagnostic[];
  warnings: SceneDiagnostic[];
};

export interface SceneValidator {
  validate(input: unknown, options?: SceneValidationOptions): Promise<SceneValidationResult>;
}

export function createSceneValidator(options?: {
  roots?: SceneValidationOptions['roots'];
}): SceneValidator {
  const resolver = createSceneDependencyResolver({ roots: options?.roots as never });
  return {
    async validate(input, opts = {}): Promise<SceneValidationResult> {
      const includeNormalizedScene = opts.includeNormalizedScene === true;
      const includeDependencies = opts.includeDependencies !== false;
      const analyzeLayout = opts.analyzeLayout !== false;
      const sceneRuntimeRevision = computeSceneRuntimeRevision();
      const errors: SceneDiagnostic[] = [];
      const warnings: SceneDiagnostic[] = [];

      const normalized = normalizeSceneDocument(input);
      if (!normalized.success) {
        return {
          valid: false,
          sceneRuntimeRevision,
          errors: normalized.errors,
          warnings: normalized.warnings,
        };
      }
      warnings.push(...normalized.warnings);
      const scene = normalized.scene;

      const graph = validateSceneGraphStructure(scene);
      errors.push(...graph.errors);
      warnings.push(...graph.warnings);

      const timing = validateSceneTimingAndLayout(scene);
      errors.push(...timing.errors);
      warnings.push(...timing.warnings);

      let dependencies: SceneDependencyResolution | undefined;
      if (includeDependencies || errors.length === 0) {
        dependencies = await resolver.resolve(scene);
        errors.push(...dependencies.errors);
        warnings.push(...dependencies.warnings);
      }

      let layoutAnalysis: SceneLayoutAnalysis | undefined;
      if (analyzeLayout && errors.length === 0) {
        layoutAnalysis = await analyzeSceneLayout(scene, opts.analysisFrames);
        warnings.push(...layoutAnalysis.diagnostics.filter((d) => d.severity === 'warning'));
      }

      const valid = errors.length === 0;
      return {
        valid,
        normalizedScene: includeNormalizedScene || valid ? scene : undefined,
        sceneContentHash: computeSceneContentHash(scene),
        dependencyFingerprint: dependencies?.dependencyFingerprint,
        catalogRevision: dependencies?.catalogRevision,
        motionRuntimeRevision: dependencies?.motionRuntimeRevision,
        sceneRuntimeRevision,
        dependencies: includeDependencies ? dependencies : undefined,
        layoutAnalysis: analyzeLayout ? layoutAnalysis : undefined,
        errors,
        warnings,
      };
    },
  };
}
