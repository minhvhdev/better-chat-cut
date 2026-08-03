import type { AssetResolverDiagnostic } from './resolver-errors.ts';
import type { AssetResolutionDecisionV1 } from './resolution-decision.ts';

export const ASSET_PLAN_SCHEMA_VERSION = '1.0.0' as const;

export type AssetPlanV1 = {
  schemaVersion: typeof ASSET_PLAN_SCHEMA_VERSION;
  id: string;
  requirementSetId: string;
  requirementSetHash: string;
  planHash: string;
  catalogRevision: string;
  motionRuntimeRevision: string;
  resolverRevision: string;
  theme?: {
    id: string;
    version: string;
  };
  complete: boolean;
  decisions: AssetResolutionDecisionV1[];
  summary: {
    totalRequirements: number;
    resolved: number;
    partiallyResolved: number;
    unresolved: number;
    blocked: number;
    skipped: number;
    exact: number;
    reused: number;
    variants: number;
    compositions: number;
    duplicateReviews: number;
    creationBriefs: number;
    uniqueAssets: number;
    reusedAssetAssignments: number;
  };
  diagnostics: AssetResolverDiagnostic[];
};

export type AssetPlanWithoutHash = Omit<AssetPlanV1, 'planHash'>;

export type AssetPlanDependencyCheckV1 = {
  requirementId: string;
  assetId: string;
  assetVersion: string;
  ok: boolean;
  issues: AssetResolverDiagnostic[];
};

export type AssetPlanValidationResult = {
  valid: boolean;
  stale: boolean;
  reusable: boolean;
  planHashValid: boolean;
  currentCatalogRevision: string;
  currentMotionRuntimeRevision: string;
  currentResolverRevision: string;
  dependencyChecks: AssetPlanDependencyCheckV1[];
  errors: AssetResolverDiagnostic[];
  warnings: AssetResolverDiagnostic[];
};
