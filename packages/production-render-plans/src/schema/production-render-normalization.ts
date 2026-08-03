import {
  DEFAULT_PRODUCTION_DELIVERY_POLICY,
  DELIVERY_BASE_NAME_REGEX,
  type ProductionDeliveryPolicyV1,
} from '../contracts/production-delivery-policy.ts';
import {
  DEFAULT_PRODUCTION_QA_POLICY,
  type ProductionQaPolicyV1,
} from '../contracts/production-qa-policy.ts';
import {
  DEFAULT_PRODUCTION_SUBTITLE_POLICY,
  type ProductionSubtitlePolicyV1,
} from '../contracts/production-subtitle-policy.ts';
import {
  MAX_PRODUCTION_RENDER_REQUEST_BYTES,
  PRODUCTION_RENDER_REQUEST_ID_REGEX,
  type ProductionRenderRequestV1,
} from '../contracts/production-render-request.ts';
import { PRODUCTION_RENDER_PROFILE_IDS } from '../contracts/production-render-profile.ts';
import { PRODUCTION_RENDER_SCHEMA_VERSION } from '../contracts/production-render-policy.ts';
import { productionRenderDiagnostic, type ProductionRenderDiagnostic } from '../contracts/production-render-errors.ts';
import { deepCloneJson, isJsonSerializable, utf8ByteLength, stableStringify } from './production-render-serialization.ts';

export type NormalizeProductionRenderRequestResult = {
  ok: boolean;
  request?: ProductionRenderRequestV1;
  errors: ProductionRenderDiagnostic[];
  warnings: ProductionRenderDiagnostic[];
};

export function normalizeProductionRenderRequest(input: unknown): NormalizeProductionRenderRequestResult {
  const errors: ProductionRenderDiagnostic[] = [];
  const warnings: ProductionRenderDiagnostic[] = [];

  if (!isJsonSerializable(input)) {
    return {
      ok: false,
      errors: [productionRenderDiagnostic('error', 'PRODUCTION_RENDER_NON_SERIALIZABLE', 'Request is not JSON-serializable', {
        recovery: 'Pass plain JSON without functions, symbols, or circular references',
      })],
      warnings,
    };
  }

  const bytes = utf8ByteLength(stableStringify(input));
  if (bytes > MAX_PRODUCTION_RENDER_REQUEST_BYTES) {
    return {
      ok: false,
      errors: [productionRenderDiagnostic('error', 'PRODUCTION_RENDER_REQUEST_TOO_LARGE', `Request exceeds ${MAX_PRODUCTION_RENDER_REQUEST_BYTES} bytes`, {
        recovery: 'Reduce nested subtitle timing payload size',
      })],
      warnings,
    };
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      errors: [productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SCHEMA_UNSUPPORTED', 'Request must be an object', {
        recovery: 'Provide a ProductionRenderRequestV1 object',
      })],
      warnings,
    };
  }

  const raw = input as Record<string, unknown>;
  const allowed = new Set(['schemaVersion', 'id', 'name', 'description', 'source', 'profile', 'subtitles', 'qa', 'delivery']);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_UNKNOWN_FIELD', `Unknown field ${key}`, {
        path: key,
        recovery: 'Remove unknown fields from the request',
      }));
    }
  }

  if (raw.schemaVersion !== PRODUCTION_RENDER_SCHEMA_VERSION) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion ${String(raw.schemaVersion)}`, {
      recovery: `Use schemaVersion "${PRODUCTION_RENDER_SCHEMA_VERSION}"`,
    }));
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!PRODUCTION_RENDER_REQUEST_ID_REGEX.test(id)) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_INVALID_ID', 'Invalid request id', {
      path: 'id',
      recovery: 'Use lowercase slug ids like render.hawking-radiation',
    }));
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_INVALID_ID', 'name is required', {
      path: 'name',
      recovery: 'Provide a non-empty name',
    }));
  }

  const source = raw.source && typeof raw.source === 'object' && !Array.isArray(raw.source)
    ? raw.source as Record<string, unknown>
    : null;
  if (!source) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SCHEMA_UNSUPPORTED', 'source is required', {
      path: 'source',
      recovery: 'Provide source.range',
    }));
  }

  const range = source?.range && typeof source.range === 'object' && !Array.isArray(source.range)
    ? source.range as Record<string, unknown>
    : null;
  if (!range || typeof range.mode !== 'string') {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_RANGE_INVALID', 'source.range.mode is required', {
      path: 'source.range',
      recovery: 'Use full-timeline, video-plan-assembly, or frames',
    }));
  } else if (range.mode === 'frames') {
    const start = range.startFrame;
    const end = range.endFrame;
    if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (end as number) <= (start as number)) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_RANGE_INVALID', 'Invalid frame range', {
        path: 'source.range',
        recovery: 'Use integer startFrame >= 0 and endFrame > startFrame',
      }));
    }
  } else if (range.mode === 'video-plan-assembly') {
    if (typeof range.planId !== 'string' || !range.planId.trim()
      || typeof range.planHash !== 'string' || !range.planHash.trim()) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_RANGE_INVALID', 'video-plan-assembly requires planId and planHash', {
        path: 'source.range',
        recovery: 'Pass exact planId and planHash from a complete assembly',
      }));
    }
  } else if (range.mode !== 'full-timeline') {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_RANGE_INVALID', `Unknown range mode ${range.mode}`, {
      path: 'source.range.mode',
      recovery: 'Use full-timeline, video-plan-assembly, or frames',
    }));
  }

  if (source && 'timelineId' in source && source.timelineId !== undefined && typeof source.timelineId !== 'string') {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_TIMELINE_NOT_FOUND', 'timelineId must be a string', {
      path: 'source.timelineId',
      recovery: 'Pass a timeline id string or omit to use the active timeline',
    }));
  }

  const profile = raw.profile && typeof raw.profile === 'object' && !Array.isArray(raw.profile)
    ? raw.profile as Record<string, unknown>
    : null;
  if (!profile || typeof profile.id !== 'string'
    || !(PRODUCTION_RENDER_PROFILE_IDS as readonly string[]).includes(profile.id)) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_PROFILE_INVALID', 'Invalid or missing profile.id', {
      path: 'profile.id',
      recovery: `Use one of: ${PRODUCTION_RENDER_PROFILE_IDS.join(', ')}`,
    }));
  } else {
    for (const key of Object.keys(profile)) {
      if (key !== 'id' && key !== 'width' && key !== 'height') {
        errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_PROFILE_INVALID', `Unsupported profile field ${key}`, {
          path: `profile.${key}`,
          recovery: 'Only id/width/height are allowed; no arbitrary codec or FFmpeg args',
        }));
      }
    }
  }

  const subtitles = normalizeSubtitles(raw.subtitles, errors);
  const qa = normalizeQa(raw.qa, errors);
  const delivery = normalizeDelivery(raw.delivery, id, errors);

  if (errors.length) return { ok: false, errors, warnings };

  const request: ProductionRenderRequestV1 = {
    schemaVersion: '1.0.0',
    id,
    name,
    ...(typeof raw.description === 'string' && raw.description.trim()
      ? { description: raw.description.trim() }
      : {}),
    source: {
      ...(typeof source!.timelineId === 'string' && source!.timelineId.trim()
        ? { timelineId: source!.timelineId.trim() }
        : {}),
      range: deepCloneJson(range) as ProductionRenderRequestV1['source']['range'],
    },
    profile: deepCloneJson(profile) as ProductionRenderRequestV1['profile'],
    subtitles,
    qa,
    delivery,
  };

  return { ok: true, request, errors, warnings };
}

function normalizeSubtitles(
  value: unknown,
  errors: ProductionRenderDiagnostic[],
): ProductionSubtitlePolicyV1 {
  if (value === undefined) return { ...DEFAULT_PRODUCTION_SUBTITLE_POLICY, source: { type: 'none' } };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_CAPTION_SOURCE_INVALID', 'subtitles must be an object', {
      path: 'subtitles',
    }));
    return { ...DEFAULT_PRODUCTION_SUBTITLE_POLICY };
  }
  const raw = value as Record<string, unknown>;
  const source = raw.source && typeof raw.source === 'object' && !Array.isArray(raw.source)
    ? raw.source as Record<string, unknown>
    : { type: 'none' };
  const type = typeof source.type === 'string' ? source.type : 'none';
  if (type !== 'none' && type !== 'narration-timing' && type !== 'project-caption-track') {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_CAPTION_SOURCE_INVALID', `Invalid subtitle source ${type}`, {
      path: 'subtitles.source.type',
    }));
  }
  const includeSrt = raw.includeSrt !== false;
  const includeVtt = raw.includeVtt !== false;
  if ((includeSrt || includeVtt) && type === 'none') {
    // Allowed at normalize time; preparation will fail if sidecars are requested with none.
  }
  return {
    includeSrt,
    includeVtt,
    source: deepCloneJson(source) as ProductionSubtitlePolicyV1['source'],
    timeOrigin: 'render-range',
    requireCaptionTrackMatch: raw.requireCaptionTrackMatch !== false,
  };
}

function normalizeQa(value: unknown, errors: ProductionRenderDiagnostic[]): ProductionQaPolicyV1 {
  if (value === undefined) return deepCloneJson(DEFAULT_PRODUCTION_QA_POLICY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SCHEMA_UNSUPPORTED', 'qa must be an object', { path: 'qa' }));
    return deepCloneJson(DEFAULT_PRODUCTION_QA_POLICY);
  }
  const partial = value as Partial<ProductionQaPolicyV1>;
  if (partial.qualityGate && partial.qualityGate !== 'strict' && partial.qualityGate !== 'balanced') {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SCHEMA_UNSUPPORTED', 'qa.qualityGate must be balanced|strict', {
      path: 'qa.qualityGate',
    }));
  }
  return {
    ...deepCloneJson(DEFAULT_PRODUCTION_QA_POLICY),
    ...deepCloneJson(partial),
    blackFrame: { ...DEFAULT_PRODUCTION_QA_POLICY.blackFrame!, ...partial.blackFrame },
    frozenFrame: { ...DEFAULT_PRODUCTION_QA_POLICY.frozenFrame!, ...partial.frozenFrame },
    silence: { ...DEFAULT_PRODUCTION_QA_POLICY.silence!, ...partial.silence },
    loudness: { ...DEFAULT_PRODUCTION_QA_POLICY.loudness!, ...partial.loudness },
    subtitle: { ...DEFAULT_PRODUCTION_QA_POLICY.subtitle!, ...partial.subtitle },
    contactSheet: { ...DEFAULT_PRODUCTION_QA_POLICY.contactSheet!, ...partial.contactSheet },
  };
}

function normalizeDelivery(
  value: unknown,
  requestId: string,
  errors: ProductionRenderDiagnostic[],
): ProductionDeliveryPolicyV1 {
  if (value === undefined) {
    return { ...DEFAULT_PRODUCTION_DELIVERY_POLICY, baseName: requestId || 'render' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SCHEMA_UNSUPPORTED', 'delivery must be an object', {
      path: 'delivery',
    }));
    return { ...DEFAULT_PRODUCTION_DELIVERY_POLICY, baseName: requestId || 'render' };
  }
  const raw = value as Partial<ProductionDeliveryPolicyV1>;
  const baseName = typeof raw.baseName === 'string' ? raw.baseName : (requestId || 'render');
  if (!DELIVERY_BASE_NAME_REGEX.test(baseName) || baseName.includes('/') || baseName.includes('\\') || baseName.includes('..')) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_PATH_TRAVERSAL', 'Invalid delivery.baseName', {
      path: 'delivery.baseName',
      recovery: 'Use a filename slug without path separators',
    }));
  }
  return {
    ...DEFAULT_PRODUCTION_DELIVERY_POLICY,
    ...raw,
    baseName,
  };
}
