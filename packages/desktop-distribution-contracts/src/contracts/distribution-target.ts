export type DesktopDistributionPlatform = 'macos' | 'windows' | 'linux';
export type DesktopDistributionArch = 'x64' | 'arm64';

export type DesktopDistributionTargetV1 = {
  platform: DesktopDistributionPlatform;
  arch: DesktopDistributionArch;
  /** Formats must be published by the capability registry / electron-builder adapter. */
  formats: string[];
  required: boolean;
};
