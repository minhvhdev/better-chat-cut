export type SceneDraftAssetBindingV1 = {
  requirementId: string;
  strategy: 'exact' | 'reuse' | 'variant' | 'composition';
  nodeIds: string[];
  assets: {
    id: string;
    version: string;
    contentHash: string;
    implementationFingerprint?: string;
  }[];
};

export type SceneDraftAssetPlanReferenceV1 = {
  planId: string;
  planHash: string;
  requirementSetId: string;
  requirementSetHash: string;
  catalogRevision: string;
  motionRuntimeRevision: string;
  resolverRevision: string;
  validationAtComposition: {
    valid: boolean;
    stale: boolean;
    reusable: boolean;
  };
  bindings: SceneDraftAssetBindingV1[];
};
