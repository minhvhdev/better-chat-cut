import type { PublishingTargetV1 } from './publishing-target.ts';
import type { PublishingMetadataV1 } from './publishing-metadata.ts';
import type { PublishingComplianceV1 } from './publishing-compliance.ts';
import type { ReleasePlanV1 } from './release-plan.ts';

export type PublishingPackageVideoRefV1 = {
  fileName: string;
  sha256: string;
  byteLength: number;
};

export type PublishingPackageV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  source: {
    productionRunId: string;
    bundleId: string;
    deliveryManifestHash: string;
    videoArtifact: PublishingPackageVideoRefV1;
    srtArtifact?: PublishingPackageVideoRefV1;
    vttArtifact?: PublishingPackageVideoRefV1;
    qaReportHash: string;
  };
  target: PublishingTargetV1;
  metadata: PublishingMetadataV1;
  metadataHash: string;
  compliance: PublishingComplianceV1;
  complianceHash: string;
  thumbnail?: {
    artifactId: string;
    sha256: string;
    mimeType: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
    byteLength: number;
    artifactHash: string;
    downloadUrl: string;
  };
  subtitles: {
    uploadSrt: boolean;
    uploadVtt: boolean;
    language: string;
    name?: string;
  };
  release: ReleasePlanV1;
  packageHash: string;
  createdAt: string;
};

export type PublishingPackageWithoutHash = Omit<PublishingPackageV1, 'packageHash' | 'createdAt'>;
