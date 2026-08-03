/**
 * Semantic publishing contract revision.
 * Bump when request/metadata/thumbnail/package/upload/reconciliation/release semantics change.
 */
export const PUBLISHING_REVISION = '1.0.0';

export function getPublishingRevision(): string {
  return PUBLISHING_REVISION;
}

export function computePublishingRevision(): string {
  return PUBLISHING_REVISION;
}
