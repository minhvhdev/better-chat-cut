export type DesktopBuildProvenanceV1 = {
  sourceCommit: string;
  sourceTreeClean: boolean;
  appVersion: string;
  nodeVersion: string;
  electronVersion: string;
  electronBuilderVersion: string;
  packageLockSha256: string;
  buildConfigSha256: string;
  productionRevision: string;
  publishingRevision: string;
  workspaceRevision: string;
  distributionRevision: string;
  /** Excluded from hashes. */
  generatedAt: string;
};
