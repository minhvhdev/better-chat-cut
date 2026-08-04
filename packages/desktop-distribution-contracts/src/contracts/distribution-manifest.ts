import type { DesktopBuildProvenanceV1 } from './build-provenance.ts';
import type { DesktopDistributionArtifactV1 } from './distribution-artifact.ts';
import type { DesktopUpdatePolicyV1 } from './update-policy.ts';

export type DesktopDistributionManifestV1 = {
  schemaVersion: '1.0.0';
  distributionId: string;
  planId: string;
  planHash: string;
  provenance: DesktopBuildProvenanceV1;
  artifacts: DesktopDistributionArtifactV1[];
  updatePolicy: DesktopUpdatePolicyV1;
  manifestHash: string;
  /** Excluded from manifest hash. */
  createdAt: string;
};
