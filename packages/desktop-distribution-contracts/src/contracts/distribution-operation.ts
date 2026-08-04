import type { DesktopDistributionArtifactV1 } from './distribution-artifact.ts';
import type { DistributionDiagnostic } from './distribution-diagnostic.ts';

export type DesktopDistributionOperationStatus =
  | 'queued'
  | 'validating'
  | 'building'
  | 'signing'
  | 'notarizing'
  | 'probing-artifacts'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DesktopDistributionOperationV1 = {
  schemaVersion: '1.0.0';
  operationId: string;
  planHash: string;
  planId: string;
  status: DesktopDistributionOperationStatus;
  targetProgress: {
    platform: string;
    arch: string;
    phase: string;
    status: string;
    percent?: number;
  }[];
  artifacts: DesktopDistributionArtifactV1[];
  createdAt: string;
  updatedAt: string;
  error?: DistributionDiagnostic;
  manifestHash?: string;
};
