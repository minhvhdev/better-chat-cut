import {
  DEFAULT_PUBLISHING_WORKFLOW_POLICY,
  type PublishingWorkflowPolicyV1,
} from '../contracts/publishing-request.ts';
import { asRecord } from './serialization.ts';

export function mergePublishingWorkflowPolicy(
  partial?: Partial<PublishingWorkflowPolicyV1> | unknown,
): PublishingWorkflowPolicyV1 {
  const rec = asRecord(partial) ?? {};
  return {
    metadataReview: rec.metadataReview === 'auto' ? 'auto' : 'manual',
    thumbnailReview: rec.thumbnailReview === 'auto' ? 'auto' : 'manual',
    packageReview: rec.packageReview === 'auto' ? 'auto' : 'manual',
    releaseReview: 'manual',
    initialUploadVisibility: 'private',
    allowUnlistedRelease: rec.allowUnlistedRelease !== false,
    allowPublicRelease: rec.allowPublicRelease !== false,
    allowScheduledRelease: rec.allowScheduledRelease !== false,
    uploadCaptions: rec.uploadCaptions !== false,
    uploadThumbnail: rec.uploadThumbnail !== false,
    maximumOperationRetries:
      typeof rec.maximumOperationRetries === 'number' && Number.isFinite(rec.maximumOperationRetries)
        ? Math.max(0, Math.min(10, Math.floor(rec.maximumOperationRetries)))
        : DEFAULT_PUBLISHING_WORKFLOW_POLICY.maximumOperationRetries,
    stopOnWarnings: rec.stopOnWarnings === true,
  };
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
