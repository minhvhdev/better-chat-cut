import type { ProductionDiagnostic } from '../contracts/production-diagnostic.ts';
import { productionDiagnostic } from '../contracts/production-errors.ts';
import type { StoryboardV1 } from '../contracts/storyboard.ts';
import type { ExplainerScriptV1 } from '../contracts/explainer-script.ts';
import type { ResearchBriefV1 } from '../contracts/research-brief.ts';
import type { ExplainerProductionRequestV1 } from '../contracts/explainer-production-request.ts';
import { EXPLAINER_PRODUCTION_SCHEMA_VERSION } from '../contracts/explainer-production-request.ts';
import { VISUAL_ROLES } from '../contracts/storyboard-visual-requirement.ts';
import { asRecord, deepCloneJson, isJsonSerializable } from './serialization.ts';
import { computeProductionArtifactHash } from './artifact-hash.ts';

export type StoryboardValidationResult = {
  valid: boolean;
  errors: ProductionDiagnostic[];
  warnings: ProductionDiagnostic[];
  normalized?: StoryboardV1;
  artifactHash?: string;
};

const STORYBOARD_KEYS = new Set(['schemaVersion', 'id', 'title', 'output', 'scenes']);
const SCENE_KEYS = new Set([
  'id', 'name', 'purpose', 'scriptSegmentIds', 'claimIds', 'durationHintSeconds',
  'visualDescription', 'layout', 'visualRequirements', 'transitionToNext', 'markerNote',
]);
const LAYOUT_KEYS = new Set(['backgroundColor', 'safeArea', 'notes']);
const VISUAL_KEYS = new Set([
  'id', 'name', 'description', 'role', 'searchQueries', 'kinds', 'requiredCapabilities',
  'preferredCapabilities', 'categories', 'tags', 'styleTags', 'desiredProps', 'reuseKey',
  'distinctKey', 'optional', 'placement', 'composition',
]);
const PLACEMENT_KEYS = new Set(['nodeId', 'parentNodeId', 'order', 'normalizedBox', 'fit']);
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

function validateNormalizedBox(box: unknown, path: string, errors: ProductionDiagnostic[]): void {
  const b = asRecord(box);
  if (!b) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'normalizedBox required', { path }));
    return;
  }
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    if (typeof b[k] !== 'number' || !Number.isFinite(b[k] as number)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', `Invalid ${k}`, { path: `${path}.${k}` }));
    }
  }
  if (typeof b.x === 'number' && typeof b.width === 'number' && (b.x < 0 || b.x + b.width > 1.0001)) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'Box out of unit square (x)', { path }));
  }
  if (typeof b.y === 'number' && typeof b.height === 'number' && (b.y < 0 || b.y + b.height > 1.0001)) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'Box out of unit square (y)', { path }));
  }
  if (typeof b.width === 'number' && b.width <= 0) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'width must be > 0', { path: `${path}.width` }));
  }
  if (typeof b.height === 'number' && b.height <= 0) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'height must be > 0', { path: `${path}.height` }));
  }
}

export function validateStoryboard(
  raw: unknown,
  options?: {
    productionRequest?: ExplainerProductionRequestV1;
    script?: ExplainerScriptV1;
    researchBrief?: ResearchBriefV1;
  },
): StoryboardValidationResult {
  const errors: ProductionDiagnostic[] = [];
  const warnings: ProductionDiagnostic[] = [];

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_NON_SERIALIZABLE', 'Storyboard is not JSON-serializable')],
      warnings,
    };
  }

  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'Storyboard must be an object')],
      warnings,
    };
  }

  for (const key of Object.keys(rec)) {
    if (!STORYBOARD_KEYS.has(key)) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Unknown field: ${key}`, { path: key }));
    }
  }

  if (rec.schemaVersion !== EXPLAINER_PRODUCTION_SCHEMA_VERSION) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_CONTRACT_SCHEMA_UNSUPPORTED', 'Unsupported storyboard schemaVersion'));
  }
  if (typeof rec.id !== 'string' || !rec.id.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'id required', { path: 'id' }));
  }
  if (typeof rec.title !== 'string' || !rec.title.trim()) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'title required', { path: 'title' }));
  }

  const output = asRecord(rec.output);
  if (!output) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'output required', { path: 'output' }));
  } else {
    for (const dim of ['width', 'height', 'fps'] as const) {
      if (typeof output[dim] !== 'number' || !(output[dim] as number)) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `output.${dim} invalid`, { path: `output.${dim}` }));
      }
    }
    if (options?.productionRequest) {
      const reqOut = options.productionRequest.output;
      if (output.width !== reqOut.width || output.height !== reqOut.height || output.fps !== reqOut.fps) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'storyboard output must match production request', { path: 'output' }));
      }
    }
  }

  const scriptSegmentIds = new Set<string>();
  if (options?.script) {
    for (const section of options.script.sections) {
      for (const seg of section.segments) scriptSegmentIds.add(seg.id);
    }
  }
  const acceptedClaims = new Set(
    options?.researchBrief?.claims.filter((c) => c.reviewStatus === 'accepted').map((c) => c.id) ?? [],
  );

  if (!Array.isArray(rec.scenes) || rec.scenes.length === 0) {
    errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'scenes required', { path: 'scenes' }));
  }

  const sceneIds = new Set<string>();
  const visualIds = new Set<string>();
  const nodeIds = new Set<string>();

  if (Array.isArray(rec.scenes)) {
    rec.scenes.forEach((scene, i) => {
      const s = asRecord(scene);
      if (!s) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Invalid scene ${i}`, { path: `scenes[${i}]` }));
        return;
      }
      for (const key of Object.keys(s)) {
        if (!SCENE_KEYS.has(key)) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Unknown scene field: ${key}`, { path: `scenes[${i}].${key}` }));
        }
      }
      if (typeof s.id !== 'string' || !s.id.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'scene id required', { path: `scenes[${i}].id` }));
      } else if (sceneIds.has(s.id)) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Duplicate scene id: ${s.id}`, { path: `scenes[${i}].id` }));
      } else sceneIds.add(s.id);
      if (typeof s.name !== 'string' || !s.name.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'scene name required', { path: `scenes[${i}].name` }));
      }
      if (typeof s.purpose !== 'string' || !s.purpose.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'scene purpose required', { path: `scenes[${i}].purpose` }));
      }
      if (typeof s.visualDescription !== 'string' || !s.visualDescription.trim()) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'visualDescription required', { path: `scenes[${i}].visualDescription` }));
      }

      if (!Array.isArray(s.scriptSegmentIds) || s.scriptSegmentIds.length === 0) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'scriptSegmentIds required', { path: `scenes[${i}].scriptSegmentIds` }));
      } else if (options?.script) {
        for (const sid of s.scriptSegmentIds) {
          if (typeof sid !== 'string' || !scriptSegmentIds.has(sid)) {
            errors.push(productionDiagnostic(
              'error',
              'PRODUCTION_STORYBOARD_INVALID',
              `Unknown script segment ${String(sid)}`,
              { path: `scenes[${i}].scriptSegmentIds` },
            ));
          }
        }
      }

      if (!Array.isArray(s.claimIds)) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'claimIds must be array', { path: `scenes[${i}].claimIds` }));
      } else if (options?.researchBrief) {
        for (const cid of s.claimIds) {
          if (typeof cid !== 'string' || !acceptedClaims.has(cid)) {
            // Allow unreviewed only as warning if claim exists; reject missing
            const allClaims = new Set(options.researchBrief.claims.map((c) => c.id));
            if (typeof cid !== 'string' || !allClaims.has(cid)) {
              errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Unknown claim ${String(cid)}`, { path: `scenes[${i}].claimIds` }));
            } else if (!acceptedClaims.has(cid)) {
              warnings.push(productionDiagnostic('warning', 'PRODUCTION_STORYBOARD_INVALID', `Claim ${cid} not accepted`, { path: `scenes[${i}].claimIds` }));
            }
          }
        }
      }

      const layout = asRecord(s.layout);
      if (!layout || typeof layout.backgroundColor !== 'string') {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'layout.backgroundColor required', { path: `scenes[${i}].layout` }));
      } else {
        for (const key of Object.keys(layout)) {
          if (!LAYOUT_KEYS.has(key)) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Unknown layout field: ${key}`, { path: `scenes[${i}].layout.${key}` }));
          }
        }
      }

      if (!Array.isArray(s.visualRequirements) || s.visualRequirements.length === 0) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'visualRequirements required', { path: `scenes[${i}].visualRequirements` }));
      } else {
        s.visualRequirements.forEach((vr, vi) => {
          const v = asRecord(vr);
          const vpath = `scenes[${i}].visualRequirements[${vi}]`;
          if (!v) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'Invalid visual requirement', { path: vpath }));
            return;
          }
          for (const key of Object.keys(v)) {
            if (!VISUAL_KEYS.has(key)) {
              errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Unknown visual field: ${key}`, { path: `${vpath}.${key}` }));
            }
          }
          if (typeof v.id !== 'string' || !ID_PATTERN.test(v.id)) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'Invalid visual id', { path: `${vpath}.id` }));
          } else if (visualIds.has(v.id)) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Duplicate visual id: ${v.id}`, { path: `${vpath}.id` }));
          } else visualIds.add(v.id);
          if (typeof v.name !== 'string' || !v.name.trim()) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'visual name required', { path: `${vpath}.name` }));
          }
          if (typeof v.description !== 'string' || !v.description.trim()) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'visual description required', { path: `${vpath}.description` }));
          }
          if (!VISUAL_ROLES.includes(v.role as never)) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'invalid visual role', { path: `${vpath}.role` }));
          }
          if (!Array.isArray(v.searchQueries) || v.searchQueries.length === 0) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'searchQueries required', { path: `${vpath}.searchQueries` }));
          }
          const placement = asRecord(v.placement);
          if (!placement) {
            errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'placement required', { path: `${vpath}.placement` }));
          } else {
            for (const key of Object.keys(placement)) {
              if (!PLACEMENT_KEYS.has(key)) {
                errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Unknown placement field: ${key}`, { path: `${vpath}.placement.${key}` }));
              }
            }
            if (typeof placement.nodeId !== 'string' || !placement.nodeId.trim()) {
              errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'nodeId required', { path: `${vpath}.placement.nodeId` }));
            } else if (nodeIds.has(placement.nodeId)) {
              errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', `Duplicate nodeId: ${placement.nodeId}`, { path: `${vpath}.placement.nodeId` }));
            } else nodeIds.add(placement.nodeId);
            if (typeof placement.order !== 'number' || !Number.isInteger(placement.order)) {
              errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE', 'order must be integer', { path: `${vpath}.placement.order` }));
            }
            validateNormalizedBox(placement.normalizedBox, `${vpath}.placement.normalizedBox`, errors);
          }
        });
      }

      if (s.transitionToNext !== undefined) {
        const t = asRecord(s.transitionToNext);
        if (!t || (t.mode !== 'cut' && t.mode !== 'timeline-transition')) {
          errors.push(productionDiagnostic('error', 'PRODUCTION_STORYBOARD_INVALID', 'Invalid transitionToNext', { path: `scenes[${i}].transitionToNext` }));
        }
      }
    });
  }

  if (errors.length) return { valid: false, errors, warnings };
  const normalized = deepCloneJson(raw) as StoryboardV1;
  const artifactHash = computeProductionArtifactHash({ artifactType: 'storyboard', artifact: normalized });
  return { valid: true, errors, warnings, normalized, artifactHash };
}
