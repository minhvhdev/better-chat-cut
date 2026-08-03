import { createHash } from 'node:crypto';
import { stableStringify } from './serialization.ts';
import type { PublishingArtifactType } from '../contracts/publishing-artifact-type.ts';
import type { PublishingPackageWithoutHash } from '../contracts/publishing-package.ts';
import { getPublishingRevision } from './publishing-revision.ts';

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sha256Buffer(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function computePublishingArtifactHash(input: {
  artifactType: PublishingArtifactType;
  artifact: unknown;
}): string {
  return sha256Hex(stableStringify({
    artifactType: input.artifactType,
    artifact: input.artifact,
  }));
}

export function computePublishingRequestHash(request: unknown): string {
  return sha256Hex(stableStringify(request));
}

export function computeMetadataHash(metadata: unknown): string {
  return computePublishingArtifactHash({ artifactType: 'publishing-metadata', artifact: metadata });
}

export function computeComplianceHash(compliance: unknown): string {
  return computePublishingArtifactHash({ artifactType: 'publishing-compliance', artifact: compliance });
}

export function computeReleasePlanHash(plan: unknown): string {
  return computePublishingArtifactHash({ artifactType: 'release-plan', artifact: plan });
}

export function computePublishingPackageHash(pkg: PublishingPackageWithoutHash): string {
  const { createdAt: _c, ...rest } = pkg as PublishingPackageWithoutHash & { createdAt?: string };
  void _c;
  return sha256Hex(stableStringify({
    ...rest,
    packageHash: undefined,
    publishingRevision: getPublishingRevision(),
  }));
}

export function shortHash(hex: string, length = 8): string {
  return hex.slice(0, length);
}
