import type { PublishingDiagnostic } from '../contracts/publishing-diagnostic.ts';
import { publishingDiagnostic } from '../contracts/publishing-errors.ts';
import type { PublishingComplianceV1 } from '../contracts/publishing-compliance.ts';
import { asRecord, deepCloneJson, isJsonSerializable } from './serialization.ts';
import { computeComplianceHash } from './artifact-hash.ts';

export type ComplianceValidationResult = {
  valid: boolean;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
  normalized?: PublishingComplianceV1;
  complianceHash?: string;
};

const KEYS = new Set(['schemaVersion', 'audience', 'syntheticMedia', 'paidPromotion', 'rights', 'review', 'notes']);

export function validatePublishingCompliance(raw: unknown): ComplianceValidationResult {
  const errors: PublishingDiagnostic[] = [];
  const warnings: PublishingDiagnostic[] = [];

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_NON_SERIALIZABLE', 'Compliance not serializable')],
      warnings,
    };
  }
  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', 'Compliance must be object')],
      warnings,
    };
  }
  for (const key of Object.keys(rec)) {
    if (!KEYS.has(key)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', `Unknown field: ${key}`, { path: key }));
    }
    if (/token|secret|password|authorization/i.test(key)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', 'Credential-like field forbidden', { path: key }));
    }
  }
  if (rec.schemaVersion !== '1.0.0') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_SCHEMA_UNSUPPORTED', 'Unsupported compliance schemaVersion'));
  }
  if (rec.audience !== 'made-for-kids' && rec.audience !== 'not-made-for-kids') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', 'audience required', { path: 'audience' }));
  }
  if (rec.syntheticMedia !== 'none' && rec.syntheticMedia !== 'contains-altered-or-synthetic-content') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', 'syntheticMedia required', { path: 'syntheticMedia' }));
  }
  if (typeof rec.paidPromotion !== 'boolean') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', 'paidPromotion required', { path: 'paidPromotion' }));
  }
  const rights = asRecord(rec.rights);
  if (!rights
    || rights.videoRightsConfirmed !== true
    || rights.audioRightsConfirmed !== true
    || rights.thumbnailRightsConfirmed !== true
    || rights.subtitleRightsConfirmed !== true
  ) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', 'All rights confirmations must be true', { path: 'rights' }));
  }
  const review = asRecord(rec.review);
  if (!review
    || review.metadataReviewed !== true
    || review.captionsReviewed !== true
    || review.thumbnailReviewed !== true
    || review.qaReviewed !== true
  ) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_COMPLIANCE_INCOMPLETE', 'All review flags must be true', { path: 'review' }));
  }

  if (errors.length) return { valid: false, errors, warnings };

  const normalized: PublishingComplianceV1 = {
    schemaVersion: '1.0.0',
    audience: rec.audience as PublishingComplianceV1['audience'],
    syntheticMedia: rec.syntheticMedia as PublishingComplianceV1['syntheticMedia'],
    paidPromotion: Boolean(rec.paidPromotion),
    rights: {
      videoRightsConfirmed: true,
      audioRightsConfirmed: true,
      thumbnailRightsConfirmed: true,
      subtitleRightsConfirmed: true,
    },
    review: {
      metadataReviewed: true,
      captionsReviewed: true,
      thumbnailReviewed: true,
      qaReviewed: true,
    },
    notes: typeof rec.notes === 'string' ? rec.notes : undefined,
  };
  const clone = deepCloneJson(normalized);
  return {
    valid: true,
    errors,
    warnings,
    normalized: clone,
    complianceHash: computeComplianceHash(clone),
  };
}
