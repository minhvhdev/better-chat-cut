/**
 * Explicit update policy for M7B. Automatic updater is intentionally not implemented.
 * releaseFeedConfigured / automaticDownload / automaticInstall are fixed false.
 */
export type DesktopUpdatePolicyV1 = {
  mode: 'disabled' | 'manual-download';
  releaseFeedConfigured: false;
  automaticDownload: false;
  automaticInstall: false;
};

export function defaultUpdatePolicy(
  mode: DesktopUpdatePolicyV1['mode'] = 'disabled',
): DesktopUpdatePolicyV1 {
  return {
    mode,
    releaseFeedConfigured: false,
    automaticDownload: false,
    automaticInstall: false,
  };
}
