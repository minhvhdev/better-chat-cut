import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';
import type { WorkspaceHealthReportV1 } from './workspace-health.ts';
import type { WorkspaceOperationViewV1 } from './workspace-operation-view.ts';
import type { WorkspaceRunSummaryV1 } from './workspace-run-summary.ts';

export type WorkspaceDiagnosticBundleV1 = {
  schemaVersion: '1.0.0';
  app: {
    version: string;
    runtime: string;
    desktop: boolean;
  };
  health: WorkspaceHealthReportV1;
  runs: {
    production: WorkspaceRunSummaryV1[];
    publishing: WorkspaceRunSummaryV1[];
  };
  failedOperations: WorkspaceOperationViewV1[];
  recentDiagnostics: WorkspaceDiagnostic[];
  dataVersions: {
    area: string;
    version: string;
  }[];
  redaction: {
    credentialsRemoved: true;
    absolutePathsRemoved: true;
    sourceCodeRemoved: true;
    projectContentRemoved: true;
  };
  bundleHash: string;
  generatedAt: string;
};
