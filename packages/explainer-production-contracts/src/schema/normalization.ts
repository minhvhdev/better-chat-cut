import type { ProductionDiagnostic } from '../contracts/production-diagnostic.ts';
import { productionDiagnostic } from '../contracts/production-errors.ts';
import {
  DEFAULT_EXPLAINER_PRODUCTION_POLICY,
  type ExplainerProductionPolicyV1,
} from '../contracts/production-policy.ts';
import { PRODUCTION_STAGE_IDS, type ProductionStageId } from '../contracts/production-stage-id.ts';

const REVIEW_MODES = new Set(['manual', 'review-key-stages', 'auto']);
const PROJECT_APPROVAL = new Set(['manual', 'auto']);
const QA_GATES = new Set(['balanced', 'strict']);

export function mergeProductionPolicy(
  partial?: Partial<ExplainerProductionPolicyV1>,
): ExplainerProductionPolicyV1 {
  const base = { ...DEFAULT_EXPLAINER_PRODUCTION_POLICY };
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    requiredReviewStages: partial.requiredReviewStages
      ? [...partial.requiredReviewStages]
      : [...base.requiredReviewStages],
  };
}

export function validateProductionPolicy(
  raw: unknown,
  path = 'workflow',
): { valid: boolean; policy?: ExplainerProductionPolicyV1; errors: ProductionDiagnostic[]; warnings: ProductionDiagnostic[] } {
  const errors: ProductionDiagnostic[] = [];
  const warnings: ProductionDiagnostic[] = [];
  const rec = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!rec) {
    return { valid: true, policy: mergeProductionPolicy(), errors, warnings };
  }
  const known = new Set([
    'reviewMode', 'projectMutationApproval', 'requiredReviewStages', 'allowStagingAssets',
    'allowAssetAuthoringTasks', 'allowTemporaryTts', 'requireFinalVoiceover', 'requireCaptions',
    'requireSrt', 'requireVtt', 'productionQaGate', 'stopOnWarnings', 'maximumStageRetries',
  ]);
  for (const key of Object.keys(rec)) {
    if (!known.has(key)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', `Unknown policy field: ${path}.${key}`, { path: `${path}.${key}` }));
    }
  }
  if (rec.reviewMode !== undefined && !REVIEW_MODES.has(String(rec.reviewMode))) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'Invalid reviewMode', { path: `${path}.reviewMode` }));
  }
  if (rec.projectMutationApproval !== undefined && !PROJECT_APPROVAL.has(String(rec.projectMutationApproval))) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'Invalid projectMutationApproval', { path: `${path}.projectMutationApproval` }));
  }
  if (rec.productionQaGate !== undefined && !QA_GATES.has(String(rec.productionQaGate))) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'Invalid productionQaGate', { path: `${path}.productionQaGate` }));
  }
  if (rec.requiredReviewStages !== undefined) {
    if (!Array.isArray(rec.requiredReviewStages)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'requiredReviewStages must be array', { path: `${path}.requiredReviewStages` }));
    } else {
      for (const stage of rec.requiredReviewStages) {
        if (!PRODUCTION_STAGE_IDS.includes(stage as ProductionStageId)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', `Unknown review stage: ${String(stage)}`, { path: `${path}.requiredReviewStages` }));
        }
      }
    }
  }
  if (rec.maximumStageRetries !== undefined) {
    const n = Number(rec.maximumStageRetries);
    if (!Number.isInteger(n) || n < 0 || n > 20) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'maximumStageRetries must be 0..20', { path: `${path}.maximumStageRetries` }));
    }
  }
  if (errors.length) return { valid: false, errors, warnings };
  return { valid: true, policy: mergeProductionPolicy(rec as Partial<ExplainerProductionPolicyV1>), errors, warnings };
}
