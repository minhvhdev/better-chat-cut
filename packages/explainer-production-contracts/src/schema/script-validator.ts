import type { ProductionDiagnostic } from '../contracts/production-diagnostic.ts';
import { productionDiagnostic } from '../contracts/production-errors.ts';
import type { ExplainerScriptV1 } from '../contracts/explainer-script.ts';
import type { ResearchBriefV1 } from '../contracts/research-brief.ts';
import type { ExplainerProductionRequestV1 } from '../contracts/explainer-production-request.ts';
import { EXPLAINER_PRODUCTION_SCHEMA_VERSION, PRODUCTION_REQUEST_LIMITS } from '../contracts/explainer-production-request.ts';
import { asRecord, deepCloneJson, isJsonSerializable } from './serialization.ts';
import { computeProductionArtifactHash } from './artifact-hash.ts';

export type ScriptValidationResult = {
  valid: boolean;
  errors: ProductionDiagnostic[];
  warnings: ProductionDiagnostic[];
  normalized?: ExplainerScriptV1;
  artifactHash?: string;
};

const SCRIPT_KEYS = new Set([
  'schemaVersion', 'id', 'title', 'logline', 'targetDurationSeconds', 'language', 'sections', 'closing',
]);
const SECTION_KEYS = new Set(['id', 'title', 'purpose', 'segments']);
const SEGMENT_KEYS = new Set([
  'id', 'narration', 'onScreenText', 'claimIds', 'emphasis', 'pronunciationHints', 'targetDurationSeconds',
]);
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;

export function validateExplainerScript(
  raw: unknown,
  options?: {
    productionRequest?: ExplainerProductionRequestV1;
    researchBrief?: ResearchBriefV1;
  },
): ScriptValidationResult {
  const errors: ProductionDiagnostic[] = [];
  const warnings: ProductionDiagnostic[] = [];

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_NON_SERIALIZABLE', 'Script is not JSON-serializable')],
      warnings,
    };
  }

  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'Script must be an object')],
      warnings,
    };
  }

  for (const key of Object.keys(rec)) {
    if (!SCRIPT_KEYS.has(key)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', `Unknown field: ${key}`, { path: key }));
    }
  }

  if (rec.schemaVersion !== EXPLAINER_PRODUCTION_SCHEMA_VERSION) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_CONTRACT_SCHEMA_UNSUPPORTED', 'Unsupported script schemaVersion'));
  }
  if (typeof rec.id !== 'string' || !ID_PATTERN.test(rec.id)) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'Invalid script id', { path: 'id' }));
  }
  if (typeof rec.title !== 'string' || !rec.title.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'title required', { path: 'title' }));
  }
  if (typeof rec.logline !== 'string' || !rec.logline.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'logline required', { path: 'logline' }));
  }
  if (typeof rec.language !== 'string' || !rec.language.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'language required', { path: 'language' }));
  } else if (options?.productionRequest && rec.language !== options.productionRequest.language) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'language mismatches production request', { path: 'language' }));
  }
  if (typeof rec.targetDurationSeconds !== 'number' || !Number.isFinite(rec.targetDurationSeconds)) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'targetDurationSeconds required', { path: 'targetDurationSeconds' }));
  } else {
    const t = rec.targetDurationSeconds;
    if (t < PRODUCTION_REQUEST_LIMITS.MIN_TARGET_DURATION_SECONDS || t > PRODUCTION_REQUEST_LIMITS.MAX_TARGET_DURATION_SECONDS) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'targetDurationSeconds out of range', { path: 'targetDurationSeconds' }));
    }
  }

  const acceptedClaims = new Map<string, { reviewStatus: string; type: string }>();
  if (options?.researchBrief) {
    for (const c of options.researchBrief.claims) {
      acceptedClaims.set(c.id, { reviewStatus: c.reviewStatus, type: c.type });
    }
  }

  if (!Array.isArray(rec.sections) || rec.sections.length === 0) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'sections required', { path: 'sections' }));
  }

  const sectionIds = new Set<string>();
  const segmentIds = new Set<string>();
  let segmentCount = 0;

  if (Array.isArray(rec.sections)) {
    rec.sections.forEach((section, si) => {
      const s = asRecord(section);
      if (!s) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', `Invalid section ${si}`, { path: `sections[${si}]` }));
        return;
      }
      for (const key of Object.keys(s)) {
        if (!SECTION_KEYS.has(key)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', `Unknown section field: ${key}`, { path: `sections[${si}].${key}` }));
        }
      }
      if (typeof s.id !== 'string' || !s.id.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'section id required', { path: `sections[${si}].id` }));
      } else if (sectionIds.has(s.id)) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', `Duplicate section id: ${s.id}`, { path: `sections[${si}].id` }));
      } else sectionIds.add(s.id);
      if (typeof s.purpose !== 'string' || !s.purpose.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'section purpose required', { path: `sections[${si}].purpose` }));
      }
      if (!Array.isArray(s.segments) || s.segments.length === 0) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'section segments required', { path: `sections[${si}].segments` }));
        return;
      }
      s.segments.forEach((seg, gi) => {
        segmentCount += 1;
        const g = asRecord(seg);
        if (!g) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', `Invalid segment ${si}.${gi}`, { path: `sections[${si}].segments[${gi}]` }));
          return;
        }
        for (const key of Object.keys(g)) {
          if (!SEGMENT_KEYS.has(key)) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', `Unknown segment field: ${key}`, { path: `sections[${si}].segments[${gi}].${key}` }));
          }
        }
        if (typeof g.id !== 'string' || !g.id.trim()) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'segment id required', { path: `sections[${si}].segments[${gi}].id` }));
        } else if (segmentIds.has(g.id)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', `Duplicate segment id: ${g.id}`, { path: `sections[${si}].segments[${gi}].id` }));
        } else segmentIds.add(g.id);
        if (typeof g.narration !== 'string' || !g.narration.trim()) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'narration required', { path: `sections[${si}].segments[${gi}].narration` }));
        }
        if (!Array.isArray(g.claimIds)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'claimIds must be array', { path: `sections[${si}].segments[${gi}].claimIds` }));
        } else {
          const requireSources = options?.productionRequest?.factualPolicy.requireSources ?? true;
          if (requireSources && g.claimIds.length === 0) {
            errors.push(productionDiagnostic(
              'error',
              'PRODUCTION_SCRIPT_CLAIM_INVALID',
              `Segment ${String(g.id)} requires claimIds when sources are required`,
              { path: `sections[${si}].segments[${gi}].claimIds` },
            ));
          }
          for (const cid of g.claimIds) {
            if (typeof cid !== 'string') {
              errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_CLAIM_INVALID', 'claim id must be string', { path: `sections[${si}].segments[${gi}].claimIds` }));
              continue;
            }
            if (options?.researchBrief) {
              const claim = acceptedClaims.get(cid);
              if (!claim) {
                errors.push(productionDiagnostic(
                  'error',
                  'PRODUCTION_SCRIPT_CLAIM_INVALID',
                  `Unknown claim ${cid}`,
                  { path: `sections[${si}].segments[${gi}].claimIds` },
                ));
              } else if (claim.reviewStatus === 'rejected') {
                errors.push(productionDiagnostic(
                  'error',
                  'PRODUCTION_CLAIM_REJECTED',
                  `Rejected claim ${cid} cannot appear in script`,
                  { path: `sections[${si}].segments[${gi}].claimIds` },
                ));
              } else if (claim.reviewStatus !== 'accepted') {
                warnings.push(productionDiagnostic(
                  'warning',
                  'PRODUCTION_SCRIPT_CLAIM_INVALID',
                  `Claim ${cid} is not accepted`,
                  { path: `sections[${si}].segments[${gi}].claimIds` },
                ));
              }
            }
          }
        }
      });
    });
  }

  if (segmentCount === 0 && errors.length === 0) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'At least one segment required'));
  }

  if (rec.closing) {
    const closing = asRecord(rec.closing);
    if (!closing || typeof closing.narration !== 'string') {
      errors.push(productionDiagnostic('error', 'PRODUCTION_SCRIPT_INVALID', 'closing.narration required', { path: 'closing.narration' }));
    }
  }

  if (errors.length) return { valid: false, errors, warnings };
  const normalized = deepCloneJson(raw) as ExplainerScriptV1;
  const artifactHash = computeProductionArtifactHash({ artifactType: 'explainer-script', artifact: normalized });
  return { valid: true, errors, warnings, normalized, artifactHash };
}
