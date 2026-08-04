import type { QualificationCheckDefinitionV1, ReleaseQualificationProfile } from '../contracts/evidence-types.ts';
import { CHECK_REGISTRY_REVISION } from '../contracts/evidence-types.ts';

const allProfiles: ReleaseQualificationProfile[] = [
  'unit-test',
  'internal-development',
  'roadmap-closure',
  'production-release',
];

const closureProfiles: ReleaseQualificationProfile[] = [
  'roadmap-closure',
  'production-release',
];

const lightAndClosure: ReleaseQualificationProfile[] = [
  'internal-development',
  'roadmap-closure',
  'production-release',
];

function cmd(
  id: string,
  category: string,
  commandId: string,
  requiredFor: ReleaseQualificationProfile[],
  deps: string[] = [],
): QualificationCheckDefinitionV1 {
  return {
    id,
    category,
    requiredFor,
    acceptedEvidenceProviders: ['local-command', 'service-verification', 'fake-test'],
    dependencies: deps,
    commandId,
    kind: 'command',
  };
}

/**
 * Required check registry — authority for required/optional + accepted providers.
 * Plan must not delete required checks for a profile; registry revision is canonical.
 */
export const QUALIFICATION_CHECK_REGISTRY: QualificationCheckDefinitionV1[] = [
  {
    id: 'source-commit',
    category: 'source',
    requiredFor: allProfiles,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'source-commit',
  },
  {
    id: 'working-tree-clean',
    category: 'source',
    requiredFor: closureProfiles,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'working-tree-clean',
  },
  {
    id: 'app-version',
    category: 'source',
    requiredFor: allProfiles,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'app-version',
  },
  {
    id: 'package-lock-integrity',
    category: 'dependencies',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'package-lock-integrity',
  },
  {
    id: 'build-config-integrity',
    category: 'build',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'build-config-integrity',
  },
  cmd('typescript', 'build', 'typescript', closureProfiles),
  cmd('unit-tests', 'build', 'unit-tests', closureProfiles),
  cmd('lint', 'build', 'lint', closureProfiles),
  cmd('web-build', 'build', 'web-build', closureProfiles),
  cmd('m1-m2-regression', 'build', 'm1-m2-regression', closureProfiles),
  cmd('m3-regression', 'build', 'm3-regression', closureProfiles),
  cmd('m4-regression', 'build', 'm4-regression', closureProfiles),
  cmd('m5-regression', 'build', 'm5-regression', closureProfiles),
  cmd('m6-regression', 'build', 'm6-regression', closureProfiles),
  cmd('m7a-regression', 'build', 'm7a-regression', closureProfiles),
  cmd('m7b-regression', 'build', 'm7b-regression', lightAndClosure),
  cmd('workspace-web-e2e', 'runtime', 'workspace-web-e2e', closureProfiles),
  cmd('workspace-desktop', 'runtime', 'workspace-desktop', closureProfiles),
  cmd('production-orchestrator-e2e', 'production-workflow', 'production-orchestrator-e2e', closureProfiles),
  cmd('production-render-e2e', 'production-workflow', 'production-render-e2e', closureProfiles),
  cmd('publishing-e2e', 'publishing-workflow', 'publishing-e2e', closureProfiles),
  cmd('oauth-vault', 'security', 'oauth-vault', lightAndClosure),
  cmd('oauth-loopback-security', 'security', 'oauth-loopback-security', closureProfiles),
  cmd('backup-restore-e2e', 'backup-restore', 'backup-restore-e2e', lightAndClosure),
  cmd('desktop-security', 'security', 'desktop-security', lightAndClosure),
  {
    id: 'secret-scan',
    category: 'security',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'secret-scan',
  },
  cmd('current-host-desktop-build', 'installer', 'current-host-desktop-build', closureProfiles),
  {
    id: 'current-host-installer-artifact',
    category: 'installer',
    requiredFor: closureProfiles,
    acceptedEvidenceProviders: ['artifact-validation', 'service-verification'],
    dependencies: ['current-host-desktop-build', 'distribution-manifest'],
    kind: 'distribution-artifact-hashes',
  },
  cmd('current-host-desktop-smoke', 'installer', 'current-host-desktop-smoke', closureProfiles),
  {
    id: 'distribution-manifest',
    category: 'build',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['artifact-validation', 'service-verification', 'fake-test'],
    dependencies: [],
    kind: 'distribution-manifest',
  },
  {
    id: 'distribution-artifact-hashes',
    category: 'build',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['artifact-validation', 'service-verification', 'fake-test'],
    dependencies: ['distribution-manifest'],
    kind: 'distribution-artifact-hashes',
  },
  {
    id: 'required-target-evidence',
    category: 'installer',
    requiredFor: closureProfiles,
    acceptedEvidenceProviders: ['artifact-validation', 'service-verification'],
    dependencies: ['distribution-artifact-hashes'],
    kind: 'required-target-evidence',
  },
  cmd('migration-framework', 'migration', 'migration-framework', lightAndClosure),
  cmd('upgrade-fixture', 'runtime', 'upgrade-fixture', lightAndClosure),
  cmd('rollback-safety', 'runtime', 'rollback-safety', lightAndClosure),
  {
    id: 'documentation',
    category: 'documentation',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'documentation',
  },
  {
    id: 'manual-update-policy',
    category: 'update-policy',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'manual-update-policy',
  },
  {
    id: 'roadmap-current',
    category: 'documentation',
    requiredFor: lightAndClosure,
    acceptedEvidenceProviders: ['service-verification', 'fake-test'],
    dependencies: [],
    kind: 'roadmap-current',
  },
];

export function requiredChecksForProfile(profile: ReleaseQualificationProfile): QualificationCheckDefinitionV1[] {
  return QUALIFICATION_CHECK_REGISTRY.filter((c) => c.requiredFor.includes(profile));
}

export function getCheckDefinition(id: string): QualificationCheckDefinitionV1 | undefined {
  return QUALIFICATION_CHECK_REGISTRY.find((c) => c.id === id);
}

export function registryAuthorityMeta() {
  return {
    checkRegistryRevision: CHECK_REGISTRY_REVISION,
    checkIds: QUALIFICATION_CHECK_REGISTRY.map((c) => c.id),
  };
}

/** Milestone → required check IDs for closure evidence mapping. */
export const MILESTONE_CHECK_MAP: Record<string, string[]> = {
  M0: ['typescript', 'unit-tests', 'lint', 'web-build', 'roadmap-current'],
  M1A: ['m1-m2-regression'],
  M1B: ['m1-m2-regression'],
  M2A: ['m1-m2-regression'],
  M2B: ['m1-m2-regression'],
  M3A: ['m3-regression'],
  M3B: ['m3-regression'],
  M4A: ['m4-regression'],
  M4B: ['m4-regression'],
  M5A: ['m5-regression'],
  M5B: ['m5-regression'],
  M5C: ['m5-regression', 'production-render-e2e'],
  M6A: ['m6-regression', 'production-orchestrator-e2e'],
  M6B: ['m6-regression', 'publishing-e2e'],
  M7A: ['m7a-regression', 'workspace-web-e2e', 'workspace-desktop'],
  M7B: [
    'm7b-regression',
    'oauth-vault',
    'oauth-loopback-security',
    'backup-restore-e2e',
    'desktop-security',
    'secret-scan',
    'current-host-desktop-build',
    'current-host-installer-artifact',
    'current-host-desktop-smoke',
    'distribution-manifest',
    'distribution-artifact-hashes',
    'required-target-evidence',
    'manual-update-policy',
    'documentation',
  ],
};

export const ROADMAP_MILESTONE_IDS = Object.keys(MILESTONE_CHECK_MAP);
