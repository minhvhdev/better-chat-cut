import type { DistributionDiagnostic } from './distribution-diagnostic.ts';

export type DesktopSigningPolicyV1 = {
  mode: 'unsigned' | 'sign-when-configured' | 'require-signed';
  macos?: {
    signingProfileId?: string;
    requireNotarization: boolean;
  };
  windows?: {
    signingProfileId?: string;
    requireTimestamp: boolean;
  };
  linux?: {
    packageSigningProfileId?: string;
  };
};

export type DesktopArtifactSigningResultV1 = {
  status:
    | 'not-requested'
    | 'not-configured'
    | 'signed'
    | 'signed-and-notarized'
    | 'failed';
  profileId?: string;
  /** Non-secret identity summary only (e.g. team id, common name). */
  identitySummary?: string;
  notarizationRequestId?: string;
  errors: DistributionDiagnostic[];
  warnings: DistributionDiagnostic[];
};

export function defaultSigningPolicy(
  mode: DesktopSigningPolicyV1['mode'] = 'unsigned',
): DesktopSigningPolicyV1 {
  return {
    mode,
    macos: { requireNotarization: false },
    windows: { requireTimestamp: false },
  };
}
