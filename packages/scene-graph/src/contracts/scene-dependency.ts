export type SceneAssetDependency = {
  nodeIds: string[];
  assetId: string;
  assetVersion: string;
  status?: string;
  contentHash?: string;
  implementationFingerprint?: string;
  manifestFound: boolean;
  runtimeAvailable: boolean;
};

export type SceneAnimationDependency = {
  nodeIds: string[];
  animationId: string;
  animationVersion: string;
  manifestFound: boolean;
  runtimeAvailable: boolean;
};

export type SceneDependencyResolution = {
  catalogRevision: string;
  motionRuntimeRevision: string;
  theme: {
    id: string;
    version: string;
    found: boolean;
  };
  assets: SceneAssetDependency[];
  animations: SceneAnimationDependency[];
  dependencyFingerprint?: string;
  errors: import('./scene-errors.ts').SceneDiagnostic[];
  warnings: import('./scene-errors.ts').SceneDiagnostic[];
};
