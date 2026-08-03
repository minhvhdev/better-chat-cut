import type { PublishingDiagnostic } from '../contracts/publishing-diagnostic.ts';
import { publishingDiagnostic } from '../contracts/publishing-errors.ts';
import {
  PUBLISHING_REQUEST_ID_PATTERN,
  PUBLISHING_REQUEST_LIMITS,
  PUBLISHING_SCHEMA_VERSION,
  type PublishingRequestV1,
} from '../contracts/publishing-request.ts';
import { CONNECTION_ID_PATTERN } from '../contracts/publishing-target.ts';
import { asRecord, deepCloneJson, isJsonSerializable, stableStringify, utf8ByteLength, hasControlChars } from './serialization.ts';
import { computePublishingRequestHash } from './artifact-hash.ts';
import { mergePublishingWorkflowPolicy } from './normalization.ts';
import { getPublishingRevision } from './publishing-revision.ts';

export type PublishingRequestValidationResult = {
  valid: boolean;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
  normalizedRequest?: PublishingRequestV1;
  requestHash?: string;
  publishingRevision?: string;
};

const REQUEST_KEYS = new Set([
  'schemaVersion', 'id', 'name', 'description', 'source', 'target', 'release', 'subtitles', 'workflow',
]);

export function validatePublishingRequest(raw: unknown): PublishingRequestValidationResult {
  const errors: PublishingDiagnostic[] = [];
  const warnings: PublishingDiagnostic[] = [];

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_NON_SERIALIZABLE', 'Request is not JSON-serializable')],
      warnings,
    };
  }

  const serialized = stableStringify(raw);
  if (utf8ByteLength(serialized) > PUBLISHING_REQUEST_LIMITS.MAX_SERIALIZED_BYTES) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_REQUEST_TOO_LARGE', 'Request exceeds max serialized size')],
      warnings,
    };
  }

  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'Request must be an object')],
      warnings,
    };
  }

  for (const key of Object.keys(rec)) {
    if (!REQUEST_KEYS.has(key)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', `Unknown field: ${key}`, { path: key }));
    }
  }

  if (rec.schemaVersion !== PUBLISHING_SCHEMA_VERSION) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion: ${String(rec.schemaVersion)}`));
  }

  if (typeof rec.id !== 'string' || !PUBLISHING_REQUEST_ID_PATTERN.test(rec.id)) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_INVALID_ID', 'Invalid publishing request id', {
      path: 'id',
      recovery: 'Use lowercase IDs like publish.hawking-radiation',
    }));
  }
  if (typeof rec.name !== 'string' || !rec.name.trim() || rec.name.length > PUBLISHING_REQUEST_LIMITS.MAX_NAME_LENGTH) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'name is required and bounded', { path: 'name' }));
  }
  if (rec.description !== undefined) {
    if (typeof rec.description !== 'string' || rec.description.length > PUBLISHING_REQUEST_LIMITS.MAX_DESCRIPTION_LENGTH) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'description invalid', { path: 'description' }));
    } else if (hasControlChars(rec.description)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'description has control characters', { path: 'description' }));
    }
  }

  const source = asRecord(rec.source);
  if (!source
    || typeof source.productionRunId !== 'string' || !source.productionRunId.trim()
    || typeof source.bundleId !== 'string' || !source.bundleId.trim()
    || typeof source.deliveryManifestHash !== 'string' || !/^[a-f0-9]{64}$/i.test(source.deliveryManifestHash)
  ) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'source requires productionRunId, bundleId, deliveryManifestHash(sha256)', {
      path: 'source',
    }));
  }

  const target = asRecord(rec.target);
  if (!target || target.platform !== 'youtube') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'target.platform must be youtube', { path: 'target.platform' }));
  } else if (typeof target.connectionId !== 'string' || !CONNECTION_ID_PATTERN.test(target.connectionId)) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'target.connectionId invalid', { path: 'target.connectionId' }));
  }
  if (target && target.expectedChannelId !== undefined && (typeof target.expectedChannelId !== 'string' || !target.expectedChannelId.trim())) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'expectedChannelId must be non-empty string', { path: 'target.expectedChannelId' }));
  }

  // forbid secret-ish keys anywhere under target
  if (target) {
    for (const forbidden of ['accessToken', 'refreshToken', 'oauthToken', 'clientSecret', 'authorization', 'password']) {
      if (forbidden in target) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', `Secret field forbidden: ${forbidden}`, { path: `target.${forbidden}` }));
      }
    }
  }

  const release = asRecord(rec.release);
  if (!release) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'release is required', { path: 'release' }));
  } else {
    const vis = release.desiredVisibility;
    if (vis !== 'private' && vis !== 'unlisted' && vis !== 'public') {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'invalid desiredVisibility', { path: 'release.desiredVisibility' }));
    }
    const mode = release.mode;
    if (mode !== 'manual' && mode !== 'immediate' && mode !== 'scheduled') {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'invalid release mode', { path: 'release.mode' }));
    }
    if (mode === 'scheduled') {
      if (typeof release.scheduledAt !== 'string' || Number.isNaN(Date.parse(release.scheduledAt))) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'scheduledAt required for scheduled mode', { path: 'release.scheduledAt' }));
      }
    } else if (release.scheduledAt !== undefined) {
      warnings.push(publishingDiagnostic('warning', 'PUBLISHING_REQUEST_INVALID', 'scheduledAt ignored when mode is not scheduled', { path: 'release.scheduledAt' }));
    }
  }

  const subtitles = asRecord(rec.subtitles);
  if (!subtitles
    || typeof subtitles.uploadSrt !== 'boolean'
    || typeof subtitles.uploadVtt !== 'boolean'
    || typeof subtitles.language !== 'string'
    || !subtitles.language.trim()
  ) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_REQUEST_INVALID', 'subtitles policy invalid', { path: 'subtitles' }));
  }

  if (errors.length) {
    return { valid: false, errors, warnings };
  }

  const normalized: PublishingRequestV1 = {
    schemaVersion: '1.0.0',
    id: String(rec.id),
    name: String(rec.name).trim(),
    description: typeof rec.description === 'string' ? rec.description : undefined,
    source: {
      productionRunId: String((source as Record<string, unknown>).productionRunId),
      bundleId: String((source as Record<string, unknown>).bundleId),
      deliveryManifestHash: String((source as Record<string, unknown>).deliveryManifestHash).toLowerCase(),
    },
    target: {
      platform: 'youtube',
      connectionId: String((target as Record<string, unknown>).connectionId),
      expectedChannelId: typeof (target as Record<string, unknown>).expectedChannelId === 'string'
        ? String((target as Record<string, unknown>).expectedChannelId)
        : undefined,
    },
    release: {
      desiredVisibility: (release as Record<string, unknown>).desiredVisibility as PublishingRequestV1['release']['desiredVisibility'],
      mode: (release as Record<string, unknown>).mode as PublishingRequestV1['release']['mode'],
      scheduledAt: typeof (release as Record<string, unknown>).scheduledAt === 'string'
        ? String((release as Record<string, unknown>).scheduledAt)
        : undefined,
    },
    subtitles: {
      uploadSrt: Boolean((subtitles as Record<string, unknown>).uploadSrt),
      uploadVtt: Boolean((subtitles as Record<string, unknown>).uploadVtt),
      language: String((subtitles as Record<string, unknown>).language).trim(),
      name: typeof (subtitles as Record<string, unknown>).name === 'string'
        ? String((subtitles as Record<string, unknown>).name)
        : undefined,
    },
    workflow: mergePublishingWorkflowPolicy(rec.workflow),
  };

  const clone = deepCloneJson(normalized);
  const requestHash = computePublishingRequestHash(clone);

  return {
    valid: true,
    errors,
    warnings,
    normalizedRequest: clone,
    requestHash,
    publishingRevision: getPublishingRevision(),
  };
}
