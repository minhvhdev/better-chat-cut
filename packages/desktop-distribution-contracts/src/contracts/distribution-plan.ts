import type { DesktopDistributionTargetV1 } from './distribution-target.ts';
import type { DesktopSigningPolicyV1 } from './signing-policy.ts';
import type { DesktopUpdatePolicyV1 } from './update-policy.ts';

export type DesktopDistributionQualificationProfile =
  | 'development'
  | 'release-candidate'
  | 'production';

export type DesktopDistributionPlanV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  description?: string;
  source: {
    commit: string;
    requireCleanTree: boolean;
    appVersion: string;
    packageLockSha256: string;
    buildConfigSha256: string;
  };
  targets: DesktopDistributionTargetV1[];
  signing: DesktopSigningPolicyV1;
  updatePolicy: DesktopUpdatePolicyV1;
  qualificationProfile: DesktopDistributionQualificationProfile;
  planHash: string;
  /** Excluded from plan hash. */
  preparedAt: string;
};

export type DesktopDistributionPlanWithoutHash = Omit<
  DesktopDistributionPlanV1,
  'planHash' | 'preparedAt'
>;
