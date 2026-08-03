import type { PublishingDiagnostic } from '../contracts/publishing-diagnostic.ts';
import { publishingDiagnostic } from '../contracts/publishing-errors.ts';
import type { PublishingPackageV1, PublishingPackageWithoutHash } from '../contracts/publishing-package.ts';
import { computePublishingPackageHash } from './artifact-hash.ts';
import { asRecord, deepCloneJson, isJsonSerializable } from './serialization.ts';
import { validatePublishingMetadata } from './publishing-metadata-validator.ts';
import { validatePublishingCompliance } from './publishing-compliance-validator.ts';
import { validateReleasePlan } from './release-plan-validator.ts';

export type PackageValidationResult = {
  valid: boolean;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
  normalized?: PublishingPackageV1;
  packageHash?: string;
};

export function validatePublishingPackage(raw: unknown): PackageValidationResult {
  const errors: PublishingDiagnostic[] = [];
  const warnings: PublishingDiagnostic[] = [];
  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_NON_SERIALIZABLE', 'Package not serializable')],
      warnings,
    };
  }
  const rec = asRecord(raw);
  if (!rec || rec.schemaVersion !== '1.0.0') {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'Invalid package schema')],
      warnings,
    };
  }

  // reject secrets and paths
  const dump = JSON.stringify(rec);
  if (/"accessToken"|"refreshToken"|"clientSecret"|"authorization"/i.test(dump)) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'Package must not contain credentials'));
  }
  if (/"[A-Za-z]:\\\\|\/home\/|\/Users\//.test(dump)) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'Package must not contain physical paths'));
  }

  const meta = validatePublishingMetadata(rec.metadata);
  if (!meta.valid) errors.push(...meta.errors);
  else if (meta.metadataHash !== rec.metadataHash) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_HASH_INVALID', 'metadataHash mismatch'));
  }

  const compliance = validatePublishingCompliance(rec.compliance);
  if (!compliance.valid) errors.push(...compliance.errors);
  else if (compliance.complianceHash !== rec.complianceHash) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_HASH_INVALID', 'complianceHash mismatch'));
  }

  const release = validateReleasePlan(rec.release);
  if (!release.valid) errors.push(...release.errors);

  const source = asRecord(rec.source);
  if (!source || typeof source.bundleId !== 'string' || typeof source.deliveryManifestHash !== 'string') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'source incomplete'));
  }
  const video = asRecord(source?.videoArtifact);
  if (!video || typeof video.sha256 !== 'string' || typeof video.fileName !== 'string') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_INVALID', 'video artifact required'));
  }

  if (errors.length) return { valid: false, errors, warnings };

  const withoutHash: PublishingPackageWithoutHash = {
    schemaVersion: '1.0.0',
    id: String(rec.id),
    name: String(rec.name),
    source: deepCloneJson(rec.source) as PublishingPackageV1['source'],
    target: deepCloneJson(rec.target) as PublishingPackageV1['target'],
    metadata: meta.normalized!,
    metadataHash: String(rec.metadataHash),
    compliance: compliance.normalized!,
    complianceHash: String(rec.complianceHash),
    thumbnail: rec.thumbnail ? deepCloneJson(rec.thumbnail) as PublishingPackageV1['thumbnail'] : undefined,
    subtitles: deepCloneJson(rec.subtitles) as PublishingPackageV1['subtitles'],
    release: release.normalized!,
  };
  const expectedHash = computePublishingPackageHash(withoutHash);
  if (typeof rec.packageHash === 'string' && rec.packageHash !== expectedHash) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_PACKAGE_HASH_INVALID', 'packageHash mismatch', {
      details: { expected: expectedHash, actual: rec.packageHash },
    }));
  }

  if (errors.length) return { valid: false, errors, warnings };

  const normalized: PublishingPackageV1 = {
    ...withoutHash,
    packageHash: expectedHash,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : '1970-01-01T00:00:00.000Z',
  };

  return {
    valid: true,
    errors,
    warnings,
    normalized: deepCloneJson(normalized),
    packageHash: expectedHash,
  };
}
