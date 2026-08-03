import type { ProductionDiagnostic } from '../contracts/production-diagnostic.ts';
import { productionDiagnostic } from '../contracts/production-errors.ts';
import type { ResearchBriefV1 } from '../contracts/research-brief.ts';
import type { SourceReferenceV1 } from '../contracts/source-reference.ts';
import { SOURCE_RELIABILITY, SOURCE_TYPES } from '../contracts/source-reference.ts';
import type { FactualClaimV1 } from '../contracts/factual-claim.ts';
import { CLAIM_CONFIDENCE, CLAIM_REVIEW_STATUS, CLAIM_TYPES } from '../contracts/factual-claim.ts';
import { EXPLAINER_PRODUCTION_SCHEMA_VERSION } from '../contracts/explainer-production-request.ts';
import type { ExplainerProductionRequestV1 } from '../contracts/explainer-production-request.ts';
import { asRecord, deepCloneJson, isJsonSerializable } from './serialization.ts';
import { computeProductionArtifactHash } from './artifact-hash.ts';

export type ResearchValidationResult = {
  valid: boolean;
  errors: ProductionDiagnostic[];
  warnings: ProductionDiagnostic[];
  normalized?: ResearchBriefV1;
  artifactHash?: string;
};

const SOURCE_KEYS = new Set([
  'id', 'title', 'publisher', 'author', 'url', 'publicationDate', 'accessedDate',
  'sourceType', 'notes', 'reliability',
]);
const CLAIM_KEYS = new Set([
  'id', 'text', 'sourceIds', 'confidence', 'type', 'reviewStatus', 'caveat',
]);
const BRIEF_KEYS = new Set([
  'schemaVersion', 'id', 'topic', 'summary', 'sources', 'claims', 'openQuestions', 'excludedClaims', 'reviewed',
]);

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateResearchBrief(
  raw: unknown,
  options?: { productionRequest?: ExplainerProductionRequestV1 },
): ResearchValidationResult {
  const errors: ProductionDiagnostic[] = [];
  const warnings: ProductionDiagnostic[] = [];

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_NON_SERIALIZABLE', 'Research brief is not JSON-serializable')],
      warnings,
    };
  }

  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'Research brief must be an object')],
      warnings,
    };
  }

  for (const key of Object.keys(rec)) {
    if (!BRIEF_KEYS.has(key)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `Unknown field: ${key}`, { path: key }));
    }
  }

  if (rec.schemaVersion !== EXPLAINER_PRODUCTION_SCHEMA_VERSION) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_CONTRACT_SCHEMA_UNSUPPORTED', 'Unsupported research schemaVersion'));
  }
  if (typeof rec.id !== 'string' || !ID_PATTERN.test(rec.id)) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'Invalid research id', { path: 'id' }));
  }
  if (typeof rec.topic !== 'string' || !rec.topic.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'topic required', { path: 'topic' }));
  }
  if (typeof rec.summary !== 'string' || !rec.summary.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'summary required', { path: 'summary' }));
  }
  if (typeof rec.reviewed !== 'boolean') {
    errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'reviewed must be boolean', { path: 'reviewed' }));
  }

  if (!Array.isArray(rec.sources) || rec.sources.length === 0) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'sources required', { path: 'sources' }));
  }
  if (!Array.isArray(rec.claims) || rec.claims.length === 0) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'claims required', { path: 'claims' }));
  }

  const sourceIds = new Set<string>();
  if (Array.isArray(rec.sources)) {
    rec.sources.forEach((src, i) => {
      const s = asRecord(src);
      if (!s) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `Invalid source at ${i}`, { path: `sources[${i}]` }));
        return;
      }
      for (const key of Object.keys(s)) {
        if (!SOURCE_KEYS.has(key)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `Unknown source field: ${key}`, { path: `sources[${i}].${key}` }));
        }
      }
      if (typeof s.id !== 'string' || !s.id.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'source id required', { path: `sources[${i}].id` }));
      } else if (sourceIds.has(s.id)) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `Duplicate source id: ${s.id}`, { path: `sources[${i}].id` }));
      } else {
        sourceIds.add(s.id);
      }
      if (typeof s.title !== 'string' || !s.title.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'source title required', { path: `sources[${i}].title` }));
      }
      if (!SOURCE_TYPES.includes(s.sourceType as SourceReferenceV1['sourceType'])) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'invalid sourceType', { path: `sources[${i}].sourceType` }));
      }
      if (!SOURCE_RELIABILITY.includes(s.reliability as SourceReferenceV1['reliability'])) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'invalid reliability', { path: `sources[${i}].reliability` }));
      }
      if (s.url !== undefined) {
        if (typeof s.url !== 'string' || !/^https?:\/\//i.test(s.url)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'url must be http(s) if present', { path: `sources[${i}].url` }));
        }
      }
      for (const df of ['publicationDate', 'accessedDate'] as const) {
        if (s[df] !== undefined && (typeof s[df] !== 'string' || !DATE_PATTERN.test(s[df] as string))) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `${df} must be YYYY-MM-DD`, { path: `sources[${i}].${df}` }));
        }
      }
    });
  }

  const claimIds = new Set<string>();
  const requireSources = options?.productionRequest?.factualPolicy.requireSources ?? true;
  const minSources = options?.productionRequest?.factualPolicy.minimumSourcesPerClaim ?? 1;
  const allowOpinion = options?.productionRequest?.factualPolicy.allowUnverifiedOpinion ?? false;

  if (Array.isArray(rec.claims)) {
    rec.claims.forEach((claim, i) => {
      const c = asRecord(claim);
      if (!c) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `Invalid claim at ${i}`, { path: `claims[${i}]` }));
        return;
      }
      for (const key of Object.keys(c)) {
        if (!CLAIM_KEYS.has(key)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `Unknown claim field: ${key}`, { path: `claims[${i}].${key}` }));
        }
      }
      if (typeof c.id !== 'string' || !c.id.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'claim id required', { path: `claims[${i}].id` }));
      } else if (claimIds.has(c.id)) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', `Duplicate claim id: ${c.id}`, { path: `claims[${i}].id` }));
      } else {
        claimIds.add(c.id);
      }
      if (typeof c.text !== 'string' || !c.text.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'claim text required', { path: `claims[${i}].text` }));
      }
      if (!CLAIM_TYPES.includes(c.type as FactualClaimV1['type'])) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'invalid claim type', { path: `claims[${i}].type` }));
      }
      if (!CLAIM_CONFIDENCE.includes(c.confidence as FactualClaimV1['confidence'])) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'invalid claim confidence', { path: `claims[${i}].confidence` }));
      }
      if (!CLAIM_REVIEW_STATUS.includes(c.reviewStatus as FactualClaimV1['reviewStatus'])) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'invalid reviewStatus', { path: `claims[${i}].reviewStatus` }));
      }
      if (!Array.isArray(c.sourceIds)) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RESEARCH_INVALID', 'sourceIds must be array', { path: `claims[${i}].sourceIds` }));
      } else {
        for (const sid of c.sourceIds) {
          if (typeof sid !== 'string' || !sourceIds.has(sid)) {
            errors.push(productionDiagnostic(
              'error',
              'PRODUCTION_SOURCE_REFERENCE_MISSING',
              `Claim source ${String(sid)} not found`,
              { path: `claims[${i}].sourceIds` },
            ));
          }
        }
        const needsSource = c.type !== 'opinion' || !allowOpinion;
        if (requireSources && needsSource && c.sourceIds.length < minSources) {
          errors.push(productionDiagnostic(
            'error',
            'PRODUCTION_CLAIM_SOURCE_MISSING',
            `Claim ${String(c.id)} requires sources`,
            { path: `claims[${i}].sourceIds`, recovery: 'Attach sourceIds or mark as allowed opinion' },
          ));
        }
        if (c.type === 'opinion' && (!c.sourceIds || c.sourceIds.length === 0) && !allowOpinion) {
          errors.push(productionDiagnostic(
            'error',
            'PRODUCTION_CLAIM_SOURCE_MISSING',
            `Opinion claim ${String(c.id)} requires source or allowUnverifiedOpinion`,
            { path: `claims[${i}]` },
          ));
        }
      }
      if (c.confidence === 'low' && c.type !== 'opinion') {
        warnings.push(productionDiagnostic(
          'warning',
          'PRODUCTION_RESEARCH_INVALID',
          `Low-confidence claim ${String(c.id)}`,
          { path: `claims[${i}].confidence` },
        ));
      }
    });
  }

  if (errors.length) return { valid: false, errors, warnings };

  const normalized = deepCloneJson(raw) as ResearchBriefV1;
  const artifactHash = computeProductionArtifactHash({ artifactType: 'research-brief', artifact: normalized });
  return { valid: true, errors, warnings, normalized, artifactHash };
}
