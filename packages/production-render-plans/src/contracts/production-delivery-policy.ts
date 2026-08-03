export type ProductionDeliveryPolicyV1 = {
  baseName?: string;
  includeManifest: boolean;
  includeQaReport: boolean;
  includeContactSheet: boolean;
  reuseCompletedBundle: boolean;
};

export const DEFAULT_PRODUCTION_DELIVERY_POLICY: ProductionDeliveryPolicyV1 = {
  includeManifest: true,
  includeQaReport: true,
  includeContactSheet: true,
  reuseCompletedBundle: true,
};

export const DELIVERY_BASE_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
