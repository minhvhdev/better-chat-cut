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
  /**
   * Evidence markers (M7B.1):
   * - stub/dry-run artifacts must never satisfy roadmap-closure / production-release targets
   * - real current-host packages use buildMode=real, dryRun=false, stub=false
   */
  buildMode?: 'real' | 'stub';
  dryRun?: boolean;
  stub?: boolean;
};
