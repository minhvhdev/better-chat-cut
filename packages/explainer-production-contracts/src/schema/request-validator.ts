import type { ProductionDiagnostic } from '../contracts/production-diagnostic.ts';
import { productionDiagnostic } from '../contracts/production-errors.ts';
import {
  EXPLAINER_PRODUCTION_SCHEMA_VERSION,
  EXPLAINER_RENDER_PROFILE_IDS,
  PRODUCTION_REQUEST_ID_PATTERN,
  PRODUCTION_REQUEST_LIMITS,
  type ExplainerProductionRequestV1,
} from '../contracts/explainer-production-request.ts';
import { asRecord, deepCloneJson, isJsonSerializable, stableStringify, utf8ByteLength } from './serialization.ts';
import { computeProductionRequestHash } from './artifact-hash.ts';
import { validateProductionPolicy, mergeProductionPolicy } from './normalization.ts';
import { getExplainerProductionContractRevision } from './contract-revision.ts';

export type ProductionRequestValidationResult = {
  valid: boolean;
  errors: ProductionDiagnostic[];
  warnings: ProductionDiagnostic[];
  normalizedRequest?: ExplainerProductionRequestV1;
  requestHash?: string;
  contractRevision?: string;
};

const REQUEST_KEYS = new Set([
  'schemaVersion', 'id', 'name', 'description', 'topic', 'objective', 'audience',
  'language', 'duration', 'output', 'style', 'factualPolicy', 'project', 'workflow',
]);

export function validateProductionRequest(raw: unknown): ProductionRequestValidationResult {
  const errors: ProductionDiagnostic[] = [];
  const warnings: ProductionDiagnostic[] = [];

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_NON_SERIALIZABLE', 'Request is not JSON-serializable')],
      warnings,
    };
  }

  const serialized = stableStringify(raw);
  if (utf8ByteLength(serialized) > PRODUCTION_REQUEST_LIMITS.MAX_PRODUCTION_REQUEST_SERIALIZED_BYTES) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_REQUEST_TOO_LARGE', 'Request exceeds max serialized size')],
      warnings,
    };
  }

  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'Request must be an object')],
      warnings,
    };
  }

  for (const key of Object.keys(rec)) {
    if (!REQUEST_KEYS.has(key)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', `Unknown field: ${key}`, { path: key }));
    }
  }

  if (rec.schemaVersion !== EXPLAINER_PRODUCTION_SCHEMA_VERSION) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_CONTRACT_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion: ${String(rec.schemaVersion)}`));
  }

  if (typeof rec.id !== 'string' || !PRODUCTION_REQUEST_ID_PATTERN.test(rec.id)) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'Invalid request id', { path: 'id', recovery: 'Use lowercase IDs like explainer.hawking-radiation' }));
  }
  if (typeof rec.name !== 'string' || !rec.name.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'name is required', { path: 'name' }));
  }
  if (typeof rec.topic !== 'string' || !rec.topic.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'topic is required', { path: 'topic' }));
  } else if (rec.topic.length > PRODUCTION_REQUEST_LIMITS.MAX_TOPIC_LENGTH) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'topic too long', { path: 'topic' }));
  }
  if (typeof rec.objective !== 'string' || !rec.objective.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'objective is required', { path: 'objective' }));
  } else if (rec.objective.length > PRODUCTION_REQUEST_LIMITS.MAX_OBJECTIVE_LENGTH) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'objective too long', { path: 'objective' }));
  }
  if (typeof rec.language !== 'string' || !rec.language.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'language is required', { path: 'language' }));
  }

  const audience = asRecord(rec.audience);
  if (!audience || typeof audience.description !== 'string' || !audience.description.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'audience.description is required', { path: 'audience.description' }));
  } else if (audience.description.length > PRODUCTION_REQUEST_LIMITS.MAX_AUDIENCE_DESCRIPTION_LENGTH) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'audience.description too long', { path: 'audience.description' }));
  }

  const duration = asRecord(rec.duration);
  if (!duration || typeof duration.targetSeconds !== 'number' || !Number.isFinite(duration.targetSeconds)) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'duration.targetSeconds is required', { path: 'duration.targetSeconds' }));
  } else {
    const t = duration.targetSeconds;
    if (t < PRODUCTION_REQUEST_LIMITS.MIN_TARGET_DURATION_SECONDS || t > PRODUCTION_REQUEST_LIMITS.MAX_TARGET_DURATION_SECONDS) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'duration.targetSeconds out of range', { path: 'duration.targetSeconds' }));
    }
    if (duration.minimumSeconds !== undefined && (typeof duration.minimumSeconds !== 'number' || duration.minimumSeconds > t)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'duration.minimumSeconds invalid', { path: 'duration.minimumSeconds' }));
    }
    if (duration.maximumSeconds !== undefined && (typeof duration.maximumSeconds !== 'number' || duration.maximumSeconds < t)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'duration.maximumSeconds invalid', { path: 'duration.maximumSeconds' }));
    }
  }

  const output = asRecord(rec.output);
  if (!output) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'output is required', { path: 'output' }));
  } else {
    for (const dim of ['width', 'height', 'fps'] as const) {
      if (typeof output[dim] !== 'number' || !Number.isFinite(output[dim] as number) || (output[dim] as number) <= 0) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', `output.${dim} invalid`, { path: `output.${dim}` }));
      }
    }
    if (!EXPLAINER_RENDER_PROFILE_IDS.includes(output.renderProfile as never)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'output.renderProfile invalid', { path: 'output.renderProfile' }));
    }
  }

  const style = asRecord(rec.style);
  if (!style) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'style is required', { path: 'style' }));
  } else {
    for (const field of ['visualStyle', 'tone'] as const) {
      if (typeof style[field] !== 'string' || !(style[field] as string).trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', `style.${field} is required`, { path: `style.${field}` }));
      } else if ((style[field] as string).length > PRODUCTION_REQUEST_LIMITS.MAX_STYLE_DESCRIPTION_LENGTH) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', `style.${field} too long`, { path: `style.${field}` }));
      }
    }
    if (!['slow', 'balanced', 'fast'].includes(String(style.pacing))) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'style.pacing invalid', { path: 'style.pacing' }));
    }
    if (!['introductory', 'intermediate', 'advanced'].includes(String(style.complexity))) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'style.complexity invalid', { path: 'style.complexity' }));
    }
  }

  const factual = asRecord(rec.factualPolicy);
  if (!factual || typeof factual.requireSources !== 'boolean') {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'factualPolicy.requireSources required', { path: 'factualPolicy.requireSources' }));
  }

  const project = asRecord(rec.project);
  if (!project || project.mode !== 'existing-target') {
    errors.push(productionDiagnostic('error', 'PRODUCTION_REQUEST_INVALID', 'project.mode must be existing-target', { path: 'project.mode' }));
  }

  let policyResult = validateProductionPolicy(rec.workflow);
  errors.push(...policyResult.errors);
  warnings.push(...policyResult.warnings);

  if (errors.length) return { valid: false, errors, warnings };

  const request = deepCloneJson(raw) as ExplainerProductionRequestV1;
  if (request.workflow) {
    request.workflow = mergeProductionPolicy(request.workflow);
  }
  const hash = computeProductionRequestHash(request);
  return {
    valid: true,
    errors,
    warnings,
    normalizedRequest: request,
    requestHash: hash,
    contractRevision: getExplainerProductionContractRevision(),
  };
}
