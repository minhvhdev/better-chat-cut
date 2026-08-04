import { sha256Hex, stableStringify } from './serialization.ts';
import { DISTRIBUTION_REVISION } from './distribution-revision.ts';
import type { DesktopDistributionPlanWithoutHash } from '../contracts/distribution-plan.ts';
import type { DesktopDistributionManifestV1 } from '../contracts/distribution-manifest.ts';
import type { DesktopBuildProvenanceV1 } from '../contracts/build-provenance.ts';

export function computeDesktopDistributionPlanHash(
  plan: DesktopDistributionPlanWithoutHash,
): string {
  return sha256Hex(stableStringify({
    schemaVersion: plan.schemaVersion,
    id: plan.id,
    name: plan.name,
    description: plan.description,
    source: plan.source,
    targets: plan.targets,
    signing: plan.signing,
    updatePolicy: plan.updatePolicy,
    qualificationProfile: plan.qualificationProfile,
    distributionRevision: DISTRIBUTION_REVISION,
  }));
}

export function computeDesktopBuildProvenanceHash(
  provenance: Omit<DesktopBuildProvenanceV1, 'generatedAt'>,
): string {
  return sha256Hex(stableStringify(provenance));
}

export function computeDesktopDistributionManifestHash(
  manifest: Omit<DesktopDistributionManifestV1, 'manifestHash' | 'createdAt'>,
): string {
  return sha256Hex(stableStringify({
    schemaVersion: manifest.schemaVersion,
    distributionId: manifest.distributionId,
    planId: manifest.planId,
    planHash: manifest.planHash,
    provenance: {
      ...manifest.provenance,
      generatedAt: undefined,
    },
    artifacts: manifest.artifacts,
    updatePolicy: manifest.updatePolicy,
  }));
}
