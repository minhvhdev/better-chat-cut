import type { WorkspaceDiagnosticBundleV1 } from '../../../production-workspace-contracts/src/index.ts';

export function buildDiagnosticManifest(bundle: WorkspaceDiagnosticBundleV1): {
  schemaVersion: '1.0.0';
  bundleHash: string;
  sections: string[];
  excluded: string[];
} {
  return {
    schemaVersion: '1.0.0',
    bundleHash: bundle.bundleHash,
    sections: ['app', 'health', 'runs', 'failedOperations', 'recentDiagnostics', 'dataVersions'],
    excluded: ['credentials', 'absolute-paths', 'source-code', 'project-content', 'media-bytes'],
  };
}

export { redactDiagnosticValue, redactString } from './diagnostic-redaction.ts';
