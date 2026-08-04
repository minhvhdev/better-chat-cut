import type { DesktopArtifactSigningResultV1 } from './signing-policy.ts';
import type { DesktopDistributionArch, DesktopDistributionPlatform } from './distribution-target.ts';

export type DesktopDistributionArtifactV1 = {
  artifactId: string;
  platform: DesktopDistributionPlatform;
  arch: DesktopDistributionArch;
  format: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  /** Optional unsigned payload identity when distinguishable from final package. */
  unsignedPayloadHash?: string;
  signing: DesktopArtifactSigningResultV1;
  /** Opaque download URL for same-origin API (no physical path). */
  downloadUrl: string;
};
