import type { PublishingDiagnostic } from '../contracts/publishing-diagnostic.ts';
import { publishingDiagnostic } from '../contracts/publishing-errors.ts';
import type { ReleasePlanV1 } from '../contracts/release-plan.ts';
import { asRecord, deepCloneJson, isJsonSerializable } from './serialization.ts';
import { computeReleasePlanHash } from './artifact-hash.ts';

export type ReleasePlanValidationResult = {
  valid: boolean;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
  normalized?: ReleasePlanV1;
  releasePlanHash?: string;
};

export function validateReleasePlan(raw: unknown, options?: { nowIso?: string }): ReleasePlanValidationResult {
  const errors: PublishingDiagnostic[] = [];
  const warnings: PublishingDiagnostic[] = [];
  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_NON_SERIALIZABLE', 'Release plan not serializable')],
      warnings,
    };
  }
  const rec = asRecord(raw);
  if (!rec || rec.schemaVersion !== '1.0.0') {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_SCHEMA_UNSUPPORTED', 'Invalid release plan schema')],
      warnings,
    };
  }
  const vis = rec.desiredVisibility;
  if (vis !== 'private' && vis !== 'unlisted' && vis !== 'public') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'invalid desiredVisibility', { path: 'desiredVisibility' }));
  }
  const mode = rec.mode;
  if (mode !== 'manual' && mode !== 'immediate' && mode !== 'scheduled') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'invalid mode', { path: 'mode' }));
  }
  if (mode === 'scheduled') {
    if (typeof rec.scheduledAt !== 'string' || Number.isNaN(Date.parse(rec.scheduledAt))) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_RELEASE_SCHEDULE_INVALID', 'scheduledAt required', { path: 'scheduledAt' }));
    } else if (options?.nowIso && Date.parse(rec.scheduledAt) <= Date.parse(options.nowIso)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_RELEASE_SCHEDULE_INVALID', 'scheduledAt must be future', { path: 'scheduledAt' }));
    }
  }
  if (rec.playlistIds !== undefined) {
    if (!Array.isArray(rec.playlistIds) || !rec.playlistIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id))) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'playlistIds invalid'));
    }
  }
  if (errors.length) return { valid: false, errors, warnings };

  const normalized: ReleasePlanV1 = {
    schemaVersion: '1.0.0',
    desiredVisibility: vis as ReleasePlanV1['desiredVisibility'],
    mode: mode as ReleasePlanV1['mode'],
    scheduledAt: typeof rec.scheduledAt === 'string' ? rec.scheduledAt : undefined,
    notifySubscribers: typeof rec.notifySubscribers === 'boolean' ? rec.notifySubscribers : undefined,
    playlistIds: Array.isArray(rec.playlistIds) ? rec.playlistIds as string[] : undefined,
  };
  const clone = deepCloneJson(normalized);
  return {
    valid: true,
    errors,
    warnings,
    normalized: clone,
    releasePlanHash: computeReleasePlanHash(clone),
  };
}
