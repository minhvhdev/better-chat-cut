export type MotionSourceValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file: 'index.tsx';
  line?: number;
  column?: number;
  recovery?: string;
};

export type MotionSourceValidationResult = {
  valid: boolean;
  sourceHash: string;
  manifestContentHash: string;
  exportName?: string;
  imports: string[];
  errors: MotionSourceValidationIssue[];
  warnings: MotionSourceValidationIssue[];
  buildable: boolean;
};

export type UserMotionRuntimeDescriptor = {
  schemaVersion: '1.0.0';
  assetId: string;
  assetVersion: string;
  exportName: string;
  sourceHash: string;
  buildHash: string;
  manifestContentHash: string;
  implementationFingerprint: string;
  sdkVersion: string;
  compilerVersion: string;
  sandboxContractVersion: string;
  runtimeContractVersion: string;
  bundleRelativePath: string;
  bundleByteLength: number;
  createdAt: string;
};

export type MotionSourceOperationReceipt = {
  requestId: string;
  inputHash: string;
  operation: 'source-created' | 'source-updated';
  assetId: string;
  assetVersion: string;
  previousSourceHash?: string;
  resultingSourceHash: string;
  manifestContentHash: string;
  completedAt: string;
};

export type MotionSourceEvent = {
  eventId: string;
  requestId: string;
  eventType:
    | 'motion-source.created'
    | 'motion-source.updated'
    | 'motion-source.validated'
    | 'motion-source.built'
    | 'motion-source.previewed'
    | 'motion-source.prepared-for-staging';
  assetId: string;
  assetVersion: string;
  sourceHash: string;
  buildHash?: string;
  manifestContentHash: string;
  occurredAt: string;
};

export type MotionSourceBuildResult = {
  assetId: string;
  assetVersion: string;
  sourceHash: string;
  buildHash: string;
  cacheHit: boolean;
  bundleByteLength: number;
  runtimeDescriptor: UserMotionRuntimeDescriptor;
  warnings: MotionSourceValidationIssue[];
};
