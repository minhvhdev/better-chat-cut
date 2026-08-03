import {
  createGlobalAssetRegistry,
  resolveAssetCatalogRootDescriptors,
  resolveWritableAssetCatalogRoot,
} from '../../../global-asset-registry/src/index.ts';
import type { AssetCatalogRoot } from '../../../global-asset-registry/src/asset-catalog-roots.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../global-asset-registry/src/asset-registry.ts';
import {
  computeRuntimeRevision,
  ensureBetterChatCutMotionRuntime,
  getMotionComponent,
  validateMotionProps,
} from '../../../motion-components/src/index.ts';
import {
  computeMotionImplementationFingerprint,
  refreshVerifiedUserMotionRuntimes,
} from '../../../motion-source-pipeline/src/index.ts';
import type { AssetRequirementSetV1 } from '../contracts/asset-requirement-set.ts';
import type { AssetPlanV1, AssetPlanValidationResult } from '../contracts/asset-plan.ts';
import type { AssetResolverDiagnostic } from '../contracts/resolver-errors.ts';
import { diagnostic } from '../contracts/resolver-errors.ts';
import { validateAndNormalizeRequirementSet } from '../schema/requirement-validator.ts';
import { computeAssetPlanHash } from '../schema/requirement-hash.ts';
import type { AssetResolutionSnapshot, SnapshotAssetRecord } from '../candidates/index.ts';
import { planBatch } from '../planning/index.ts';
import { computeAssetResolverRevision } from './resolver-revision.ts';
import { ASSET_PLAN_SCHEMA_VERSION } from '../contracts/asset-plan.ts';
import { ASSET_REQUIREMENT_SCHEMA_VERSION } from '../contracts/asset-requirement-set.ts';
import {
  ASSET_RESOLVER_SCORE_WEIGHTS,
  COMPOSITION_PART_COMPLEXITY_PENALTY,
  COMPOSITION_SWITCH_MARGIN,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
} from '../scoring/scoring-constants.ts';
import { ASSET_REQUIREMENT_LIMITS } from '../contracts/asset-requirement-set.ts';
import { DEFAULT_RESOLUTION_POLICY } from '../contracts/resolution-policy.ts';

export type ResolveAssetRequirementsInput = {
  requirementSet: AssetRequirementSetV1;
  includeCandidates?: boolean;
  includeRejectedCandidates?: boolean;
  candidateLimit?: number;
  rejectedCandidateLimit?: number;
};

export type AssetResolutionResult = {
  requirementSetHash: string;
  catalogRevision: string;
  motionRuntimeRevision: string;
  resolverRevision: string;
  plan: AssetPlanV1;
  diagnostics: AssetResolverDiagnostic[];
};

export type ValidateAssetPlanInput = {
  plan: AssetPlanV1;
};

export type BatchAssetResolver = {
  validateRequirements(input: unknown): ReturnType<typeof validateAndNormalizeRequirementSet>;
  resolveBatch(input: ResolveAssetRequirementsInput): Promise<AssetResolutionResult>;
  validatePlan(input: ValidateAssetPlanInput): Promise<AssetPlanValidationResult>;
  getContract(format?: 'summary' | 'full'): Record<string, unknown>;
};

export type CreateBatchAssetResolverOptions = {
  roots?: AssetCatalogRoot[];
  registry?: GlobalAssetRegistryWithRecords;
};

async function buildSnapshot(
  registry: GlobalAssetRegistryWithRecords,
): Promise<AssetResolutionSnapshot> {
  ensureBetterChatCutMotionRuntime();
  // Single refresh for the whole batch
  await registry.refresh();
  try {
    await refreshVerifiedUserMotionRuntimes({
      registry,
      userCatalogRoot: resolveWritableAssetCatalogRoot().path,
    });
  } catch {
    // User catalog may be unavailable; bundled runtimes still work.
  }

  const catalogRevision = registry.getSnapshot().revision;
  const motionRuntimeRevision = computeRuntimeRevision();
  const resolverRevision = computeAssetResolverRevision();
  const diagnosticsByKey = new Map<string, boolean>();
  for (const d of registry.getSnapshot().diagnostics) {
    if (d.severity !== 'error') continue;
    const extra = d as unknown as { assetId?: string; assetVersion?: string };
    if (typeof extra.assetId === 'string' && typeof extra.assetVersion === 'string') {
      diagnosticsByKey.set(`${extra.assetId}@${extra.assetVersion}`, true);
    }
  }

  const assets: SnapshotAssetRecord[] = registry.getRecords().map((record) => {
    const runtime = getMotionComponent(record.manifest.id, record.manifest.version);
    const entry = record.manifest.implementation.entry;
    const isDraftCandidate = record.manifest.status === 'draft'
      || entry.startsWith('candidates/');
    let implementationFingerprint: string | undefined;
    try {
      implementationFingerprint = computeMotionImplementationFingerprint(record.manifest);
    } catch {
      implementationFingerprint = undefined;
    }
    return {
      manifest: record.manifest,
      contentHash: record.contentHash,
      ...(implementationFingerprint ? { implementationFingerprint } : {}),
      runtimeAvailable: Boolean(runtime) && record.manifest.status !== 'draft' && !isDraftCandidate,
      defaultProps: runtime?.defaultProps ?? {},
      propsSchema: runtime?.propsSchema ?? record.manifest.propsSchema,
      storageScope: record.storageScope,
      isDraftCandidate,
      hasManifestDiagnosticError: diagnosticsByKey.has(`${record.manifest.id}@${record.manifest.version}`),
    };
  }).sort((a, b) => {
    const id = a.manifest.id.localeCompare(b.manifest.id);
    if (id !== 0) return id;
    return a.manifest.version.localeCompare(b.manifest.version);
  });

  return {
    catalogRevision,
    motionRuntimeRevision,
    resolverRevision,
    assets,
    createdFromConsistentSnapshot: true,
  };
}

function getContract(format: 'summary' | 'full' = 'summary'): Record<string, unknown> {
  const summary = {
    requirementSchemaVersion: ASSET_REQUIREMENT_SCHEMA_VERSION,
    planSchemaVersion: ASSET_PLAN_SCHEMA_VERSION,
    resolverRevision: computeAssetResolverRevision(),
    defaultPolicy: DEFAULT_RESOLUTION_POLICY,
    allowedStrategies: ['exact', 'reuse', 'variant', 'composition', 'review-duplicate', 'create-new', 'none'],
    exactVersionPolicy: 'Exact pins never fall back to latest or alternate versions',
    statusPolicy: {
      defaultAllowed: ['published'],
      draftNeverSelected: true,
      deprecatedOnlyWithExactPinAndFlag: true,
    },
    reuseSemantics: 'reuseKey groups share one exact id@version when a compatible intersection exists',
    distinctSemantics: 'distinctKey uses deterministic greedy exclusion by priority/input order/id',
    variantSemantics: 'Same asset id@version with validated non-default props; no new manifest/version',
    compositionSemantics: 'Only when input declares parts; no prose decomposition; depth 1',
    scoringWeights: ASSET_RESOLVER_SCORE_WEIGHTS,
    confidenceThresholds: { high: CONFIDENCE_HIGH, medium: CONFIDENCE_MEDIUM },
    compositionConstants: {
      switchMargin: COMPOSITION_SWITCH_MARGIN,
      complexityPenalty: COMPOSITION_PART_COMPLEXITY_PENALTY,
    },
    limits: ASSET_REQUIREMENT_LIMITS,
    knownLimitations: [
      'Does not create assets, write source, or mutate catalog/lifecycle',
      'Does not generate SceneDocument or render previews',
      'Distinct assignment is greedy, not a full NP-hard solver',
      'Composition is never inferred from prose',
      'No embeddings/LLM/internet ranking',
    ],
    exampleDirectRequirementSet: {
      schemaVersion: '1.0.0',
      id: 'requirements.example-direct',
      requirements: [{
        id: 'mainArrow',
        name: 'Arrow',
        description: 'Explanation arrow',
        search: { queries: ['arrow'] },
        kinds: { preferred: ['primitive'] },
      }],
    },
    exampleCompositionRequirement: {
      id: 'labelledPlanet',
      name: 'Labelled planet',
      description: 'Planet body with label',
      mode: 'composition',
      search: { queries: ['labelled planet'] },
      composition: {
        layoutHint: 'labelled',
        parts: [
          { id: 'body', role: 'body', search: { queries: ['circle'] }, kinds: { preferred: ['primitive'] } },
          { id: 'label', role: 'label', search: { queries: ['label'] }, kinds: { preferred: ['ui'] } },
        ],
      },
    },
  };
  if (format === 'summary') return summary;
  return {
    ...summary,
    exampleAssetPlan: {
      schemaVersion: '1.0.0',
      id: 'asset-plan.example-direct',
      complete: true,
      decisions: [],
    },
  };
}

export function createBatchAssetResolver(options: CreateBatchAssetResolverOptions = {}): BatchAssetResolver {
  const registry = options.registry ?? createGlobalAssetRegistry({
    roots: options.roots ?? resolveAssetCatalogRootDescriptors(),
    strict: false,
  });

  return {
    validateRequirements(input: unknown) {
      return validateAndNormalizeRequirementSet(input);
    },

    async resolveBatch(input: ResolveAssetRequirementsInput): Promise<AssetResolutionResult> {
      const validated = validateAndNormalizeRequirementSet(input.requirementSet);
      if (!validated.valid || !validated.normalizedRequirementSet || !validated.requirementSetHash) {
        const emptyPlan = {
          schemaVersion: ASSET_PLAN_SCHEMA_VERSION,
          id: 'asset-plan.invalid',
          requirementSetId: typeof (input.requirementSet as { id?: string })?.id === 'string'
            ? (input.requirementSet as { id: string }).id
            : 'invalid',
          requirementSetHash: 'invalid',
          planHash: 'invalid',
          catalogRevision: '',
          motionRuntimeRevision: '',
          resolverRevision: computeAssetResolverRevision(),
          complete: false,
          decisions: [],
          summary: {
            totalRequirements: 0,
            resolved: 0,
            partiallyResolved: 0,
            unresolved: 0,
            blocked: 0,
            skipped: 0,
            exact: 0,
            reused: 0,
            variants: 0,
            compositions: 0,
            duplicateReviews: 0,
            creationBriefs: 0,
            uniqueAssets: 0,
            reusedAssetAssignments: 0,
          },
          diagnostics: validated.errors,
        } satisfies AssetPlanV1;
        return {
          requirementSetHash: 'invalid',
          catalogRevision: '',
          motionRuntimeRevision: '',
          resolverRevision: computeAssetResolverRevision(),
          plan: emptyPlan,
          diagnostics: validated.errors,
        };
      }

      const snapshot = await buildSnapshot(registry as GlobalAssetRegistryWithRecords);
      const plan = planBatch(validated.normalizedRequirementSet, snapshot, {
        includeCandidates: input.includeCandidates,
        includeRejectedCandidates: input.includeRejectedCandidates,
        candidateLimit: input.candidateLimit,
        rejectedCandidateLimit: input.rejectedCandidateLimit,
      });

      return {
        requirementSetHash: validated.requirementSetHash,
        catalogRevision: snapshot.catalogRevision,
        motionRuntimeRevision: snapshot.motionRuntimeRevision,
        resolverRevision: snapshot.resolverRevision,
        plan,
        diagnostics: [...validated.warnings, ...plan.diagnostics],
      };
    },

    async validatePlan(input: ValidateAssetPlanInput): Promise<AssetPlanValidationResult> {
      const snapshot = await buildSnapshot(registry as GlobalAssetRegistryWithRecords);
      return validatePlanAgainstSnapshot(input.plan, snapshot);
    },

    getContract,
  };
}

export function validatePlanAgainstSnapshot(
  plan: AssetPlanV1,
  snapshot: AssetResolutionSnapshot,
): AssetPlanValidationResult {
  const errors: AssetResolverDiagnostic[] = [];
  const warnings: AssetResolverDiagnostic[] = [];
  const dependencyChecks: AssetPlanValidationResult['dependencyChecks'] = [];

  if (plan.schemaVersion !== ASSET_PLAN_SCHEMA_VERSION) {
    errors.push(diagnostic('error', 'ASSET_PLAN_HASH_INVALID', `Unsupported plan schemaVersion ${plan.schemaVersion}`));
  }

  const { planHash: _ignored, ...withoutHash } = plan;
  void _ignored;
  const expectedHash = computeAssetPlanHash(withoutHash);
  const planHashValid = expectedHash === plan.planHash;
  if (!planHashValid) {
    errors.push(diagnostic('error', 'ASSET_PLAN_HASH_INVALID', 'Plan hash mismatch', {
      recovery: 'Re-run asset_resolve_batch',
    }));
  }

  let stale = false;
  let reusable = true;

  if (plan.catalogRevision !== snapshot.catalogRevision) {
    stale = true;
    warnings.push(diagnostic('warning', 'ASSET_PLAN_CATALOG_CHANGED', 'Catalog revision changed'));
  }
  if (plan.motionRuntimeRevision !== snapshot.motionRuntimeRevision) {
    stale = true;
    warnings.push(diagnostic('warning', 'ASSET_PLAN_RUNTIME_CHANGED', 'Motion runtime revision changed'));
  }
  if (plan.resolverRevision !== snapshot.resolverRevision) {
    stale = true;
    warnings.push(diagnostic('warning', 'ASSET_PLAN_RESOLVER_CHANGED', 'Resolver revision changed; recommend re-resolution'));
  }

  const byKey = new Map(snapshot.assets.map((a) => [`${a.manifest.id}@${a.manifest.version}`, a]));

  for (const decision of plan.decisions) {
    const selections: Array<{ requirementId: string; selection: NonNullable<typeof decision.selection> }> = [];
    if (decision.selection) {
      selections.push({ requirementId: decision.requirementId, selection: decision.selection });
    }
    if (decision.composition) {
      for (const part of decision.composition.parts) {
        selections.push({ requirementId: decision.requirementId, selection: part.selection });
      }
    }
    for (const { requirementId, selection } of selections) {
      const key = `${selection.asset.id}@${selection.asset.version}`;
      const record = byKey.get(key);
      const issues: AssetResolverDiagnostic[] = [];
      if (!record) {
        issues.push(diagnostic('error', 'ASSET_PLAN_DEPENDENCY_MISSING', `Selected asset ${key} missing`, {
          requirementId,
          assetId: selection.asset.id,
          assetVersion: selection.asset.version,
        }));
        reusable = false;
      } else {
        if (record.contentHash !== selection.asset.contentHash) {
          issues.push(diagnostic('error', 'ASSET_PLAN_CONTENT_HASH_CHANGED', `Content hash changed for ${key}`, {
            requirementId,
            assetId: selection.asset.id,
            assetVersion: selection.asset.version,
          }));
          reusable = false;
        }
        if (
          selection.asset.implementationFingerprint
          && record.implementationFingerprint
          && selection.asset.implementationFingerprint !== record.implementationFingerprint
        ) {
          issues.push(diagnostic('error', 'ASSET_PLAN_IMPLEMENTATION_CHANGED', `Implementation fingerprint changed for ${key}`, {
            requirementId,
            assetId: selection.asset.id,
            assetVersion: selection.asset.version,
          }));
          reusable = false;
        }
        if (!record.runtimeAvailable) {
          issues.push(diagnostic('error', 'ASSET_PLAN_RUNTIME_UNAVAILABLE', `Runtime unavailable for ${key}`, {
            requirementId,
            assetId: selection.asset.id,
            assetVersion: selection.asset.version,
          }));
          reusable = false;
        }
        const props = validateMotionProps(record.propsSchema, selection.props, record.defaultProps);
        if (!props.valid) {
          issues.push(diagnostic('error', 'ASSET_PLAN_PROPS_INVALID', `Props no longer valid for ${key}`, {
            requirementId,
            assetId: selection.asset.id,
            assetVersion: selection.asset.version,
          }));
          reusable = false;
        }
      }
      dependencyChecks.push({
        requirementId,
        assetId: selection.asset.id,
        assetVersion: selection.asset.version,
        ok: issues.length === 0,
        issues,
      });
      errors.push(...issues);
    }

    if (decision.creationBrief) {
      const collision = snapshot.assets.some((a) => a.manifest.id === decision.creationBrief!.suggestedId);
      if (collision) {
        errors.push(diagnostic('error', 'ASSET_RESOLVER_CREATION_ID_COLLISION', `Suggested id ${decision.creationBrief.suggestedId} now collides`, {
          requirementId: decision.requirementId,
        }));
        reusable = false;
      }
    }
  }

  if (
    plan.catalogRevision !== snapshot.catalogRevision
    && reusable
    && dependencyChecks.every((c) => c.ok)
  ) {
    // Replace generic catalog warning nuance
    const idx = warnings.findIndex((w) => w.code === 'ASSET_PLAN_CATALOG_CHANGED');
    if (idx >= 0) {
      warnings[idx] = diagnostic('warning', 'CATALOG_REVISION_CHANGED_DEPENDENCIES_STABLE', 'Catalog revision changed but selected dependencies remain stable');
    }
  }

  const valid = errors.length === 0 && planHashValid;
  if (!valid) reusable = false;

  return {
    valid,
    stale,
    reusable: valid && reusable,
    planHashValid,
    currentCatalogRevision: snapshot.catalogRevision,
    currentMotionRuntimeRevision: snapshot.motionRuntimeRevision,
    currentResolverRevision: snapshot.resolverRevision,
    dependencyChecks,
    errors,
    warnings,
  };
}
