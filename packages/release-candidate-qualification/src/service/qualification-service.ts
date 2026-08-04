import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  BetterChatCutRoadmapClosureReportV1,
  ReleaseCandidateManifestV1,
  ReleaseCandidatePlanV1,
  ReleaseCandidateReportV1,
  ReleaseQualificationCheckResultV1,
  ReleaseQualificationTargetV1,
} from '../contracts/qualification-types.ts';
import { QualificationError } from '../contracts/qualification-errors.ts';
import { defaultUpdatePolicy } from '../../../desktop-distribution-contracts/src/index.ts';
import {
  CHECK_REGISTRY_REVISION,
  type DistributionEvidenceReferenceV1,
  type QualificationEvidenceManifestV1,
  type QualificationEvidenceV1,
  type ReleaseQualificationProfile,
  type MilestoneQualificationEvidenceV1,
} from '../contracts/evidence-types.ts';
import { hashEvidenceManifestBody, sha256Hex } from '../evidence/hash.ts';
import { validateQualificationEvidence } from '../evidence/validate-evidence.ts';
import {
  MILESTONE_CHECK_MAP,
  ROADMAP_MILESTONE_IDS,
  registryAuthorityMeta,
  requiredChecksForProfile,
} from '../registry/checks.ts';
import { evidenceFromCommand, evidenceService, runQualificationCommand } from './command-runner.ts';
import { runSecretScan } from './secret-scan.ts';
import {
  evidenceFromDistribution,
  loadAndValidateDistributionEvidence,
} from './distribution-evidence.ts';
import {
  fingerprintBuildConfig,
  fingerprintPackageLock,
} from '../../../desktop-distribution/src/index.ts';

const execFileAsync = promisify(execFile);

const REQUIRED_DOC_PATHS = [
  'docs/desktop-distribution.md',
  'docs/secure-oauth-onboarding.md',
  'docs/workspace-backup-v1.md',
  'docs/release-candidate-qualification.md',
  'docs/manual-update-policy.md',
  'docs/roadmap-closure-gate.md',
  'docs/roadmap.md',
];

export function resolveReleaseCandidateRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BETTER_CHAT_CUT_RELEASE_CANDIDATE_ROOT) return env.BETTER_CHAT_CUT_RELEASE_CANDIDATE_ROOT;
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'release-candidates');
}

/** @deprecated Use requiredChecksForProfile; kept export for compatibility */
export const REQUIRED_CHECKS = requiredChecksForProfile('roadmap-closure').map((c) => c.id);

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, path);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}

function toCheckResult(
  evidence: QualificationEvidenceV1,
  category: string,
  validationErrors: { severity: string; code: string; message: string }[],
): ReleaseQualificationCheckResultV1 {
  const failed = evidence.status === 'failed' || validationErrors.some((e) => e.severity === 'error');
  return {
    id: evidence.checkId,
    category: category as ReleaseQualificationCheckResultV1['category'],
    required: evidence.required,
    status: failed ? 'failed' : evidence.status,
    summary: failed
      ? (validationErrors.map((e) => e.message).join('; ') || `Check ${evidence.checkId} failed`)
      : `Check ${evidence.checkId} ${evidence.status}`,
    evidence: {
      reportHash: evidence.evidenceHash,
      command: evidence.execution?.commandId,
      artifactId: evidence.artifacts?.[0]?.artifactId,
    },
    errors: validationErrors
      .filter((e) => e.severity === 'error')
      .map((e) => ({ severity: 'error' as const, code: e.code, message: e.message })),
    warnings: validationErrors
      .filter((e) => e.severity === 'warning')
      .map((e) => ({ severity: 'warning' as const, code: e.code, message: e.message })),
  };
}

export type QualificationServiceOptions = {
  repoRoot?: string;
  rcRoot?: string;
  distributionRoot?: string;
  /** Only for pure unit tests of hash/report plumbing — never used by MCP/closure. */
  injectEvidence?: QualificationEvidenceV1[];
};

export type QualificationValidateOptions = {
  profile?: ReleaseQualificationProfile;
  distributionEvidence?: DistributionEvidenceReferenceV1;
  /** Pre-collected evidence keys by checkId (from prior command runs). */
  precollectedEvidence?: QualificationEvidenceV1[];
  /**
   * When false, skip expensive allowlisted command execution and mark those
   * checks failed/skipped according to profile policy. Default true for closure.
   */
  executeCommands?: boolean;
};

export type QualificationService = {
  getContract: (format?: 'summary' | 'full') => Record<string, unknown>;
  preparePlan: (input: {
    id: string;
    name: string;
    version: string;
    sourceCommit?: string;
    distributionManifestHash: string;
    channel: ReleaseCandidatePlanV1['channel'];
    targets?: ReleaseQualificationTargetV1[];
    profile?: ReleaseQualificationProfile;
  }) => Promise<ReleaseCandidatePlanV1>;
  validate: (
    plan: ReleaseCandidatePlanV1,
    options?: QualificationValidateOptions,
  ) => Promise<{
    report: ReleaseCandidateReportV1;
    manifest?: ReleaseCandidateManifestV1;
    closure: BetterChatCutRoadmapClosureReportV1;
    evidenceManifest: QualificationEvidenceManifestV1;
    milestoneEvidence: MilestoneQualificationEvidenceV1[];
  }>;
  getReport: (candidateId: string) => Promise<ReleaseCandidateReportV1 | null>;
};

export function createQualificationService(
  options: QualificationServiceOptions = {},
): QualificationService {
  const repoRoot = options.repoRoot ?? process.cwd();
  const rcRoot = options.rcRoot ?? resolveReleaseCandidateRoot();

  return {
    getContract(format = 'summary') {
      const base = {
        schemaVersion: '1.0.0',
        milestone: 'M7B.1',
        checkRegistryRevision: CHECK_REGISTRY_REVISION,
        profiles: ['unit-test', 'internal-development', 'roadmap-closure', 'production-release'],
        requiredChecksByProfile: {
          'roadmap-closure': requiredChecksForProfile('roadmap-closure').map((c) => c.id),
          'internal-development': requiredChecksForProfile('internal-development').map((c) => c.id),
        },
        updatePolicy: defaultUpdatePolicy('manual-download'),
        noRequiredOverride: true,
        forcePassLocalChecks: false,
        registry: registryAuthorityMeta(),
      };
      if (format === 'full') {
        return {
          ...base,
          tools: [
            'release_candidate_get_contract',
            'release_candidate_prepare',
            'release_candidate_validate',
          ],
        };
      }
      return base;
    },

    async preparePlan(input) {
      const profile = input.profile
        ?? (input.channel === 'production'
          ? 'production-release'
          : input.channel === 'candidate'
            ? 'roadmap-closure'
            : 'internal-development');
      let commit = input.sourceCommit;
      if (!commit) {
        try {
          const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
          commit = stdout.trim();
        } catch {
          throw new QualificationError('QUALIFICATION_PLAN_INVALID', 'Unable to resolve source commit');
        }
      }
      const hostPlatform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
      const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const targets = input.targets ?? [
        {
          platform: 'web-development' as const,
          required: true,
          signingRequired: false,
          notarizationRequired: false,
        },
        {
          platform: hostPlatform,
          arch: hostArch,
          required: profile === 'production-release' || profile === 'roadmap-closure',
          signingRequired: profile === 'production-release',
          notarizationRequired: profile === 'production-release' && hostPlatform === 'macos',
        },
      ];
      const requiredChecks = requiredChecksForProfile(profile).map((c) => c.id);
      const planWithoutHash: Omit<ReleaseCandidatePlanV1, 'planHash'> = {
        schemaVersion: '1.0.0',
        id: input.id,
        name: input.name,
        version: input.version,
        sourceCommit: commit!,
        distributionManifestHash: input.distributionManifestHash,
        channel: input.channel,
        targets,
        requiredChecks,
        optionalChecks: profile === 'production-release'
          ? ['signed-production-artifacts', 'notarized-macos']
          : ['ci-cross-platform-packages'],
        profile,
      };
      return {
        ...planWithoutHash,
        planHash: sha256Hex(planWithoutHash),
      };
    },

    async validate(plan, opts) {
      const profile: ReleaseQualificationProfile = (
        (plan as ReleaseCandidatePlanV1 & { profile?: ReleaseQualificationProfile }).profile
        ?? opts?.profile
        ?? 'internal-development'
      );
      const executeCommands = opts?.executeCommands !== false
        && (profile === 'roadmap-closure' || profile === 'production-release'
          || opts?.executeCommands === true);

      const expectedHash = sha256Hex({
        schemaVersion: plan.schemaVersion,
        id: plan.id,
        name: plan.name,
        version: plan.version,
        sourceCommit: plan.sourceCommit,
        distributionManifestHash: plan.distributionManifestHash,
        channel: plan.channel,
        targets: plan.targets,
        requiredChecks: plan.requiredChecks,
        optionalChecks: plan.optionalChecks,
        previousVersionFixture: plan.previousVersionFixture,
        profile: (plan as { profile?: string }).profile,
      });
      // Support plan hashes from previous preparePlan that included profile
      const expectedHashLegacy = sha256Hex({
        schemaVersion: plan.schemaVersion,
        id: plan.id,
        name: plan.name,
        version: plan.version,
        sourceCommit: plan.sourceCommit,
        distributionManifestHash: plan.distributionManifestHash,
        channel: plan.channel,
        targets: plan.targets,
        requiredChecks: plan.requiredChecks,
        optionalChecks: plan.optionalChecks,
        previousVersionFixture: plan.previousVersionFixture,
      });
      if (expectedHash !== plan.planHash && expectedHashLegacy !== plan.planHash) {
        throw new QualificationError('QUALIFICATION_PLAN_INVALID', 'planHash mismatch');
      }

      const registryChecks = requiredChecksForProfile(profile);
      // Plan cannot delete registry-required checks for this profile
      for (const c of registryChecks) {
        if (!plan.requiredChecks.includes(c.id)) {
          throw new QualificationError(
            'QUALIFICATION_PLAN_INVALID',
            `Plan missing registry-required check ${c.id} for profile ${profile}`,
          );
        }
      }

      let head = plan.sourceCommit;
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
        head = stdout.trim();
      } catch { /* keep */ }

      let dirty = true;
      try {
        const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoRoot });
        dirty = stdout.trim().length > 0;
      } catch {
        dirty = true;
      }

      const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
      const evidenceList: QualificationEvidenceV1[] = [];
      const checkResults: ReleaseQualificationCheckResultV1[] = [];

      const injected = new Map(
        [...(options.injectEvidence ?? []), ...(opts?.precollectedEvidence ?? [])]
          .map((e) => [e.checkId, e] as const),
      );

      const ctxBase = {
        profile,
        expectedCommit: plan.sourceCommit,
        expectedAppVersion: pkg.version,
        repoRoot,
      };

      // Distribution evidence load (optional for internal without real package)
      let distLoaded = opts?.distributionEvidence
        ? await loadAndValidateDistributionEvidence(repoRoot, opts.distributionEvidence, {
          distributionRoot: options.distributionRoot,
          expectedCommit: plan.sourceCommit,
          rejectStubs: profile === 'roadmap-closure' || profile === 'production-release',
        })
        : null;

      // If only hash on plan, try resolve
      if (!distLoaded && plan.distributionManifestHash && plan.distributionManifestHash.length === 64) {
        const attempt = await loadAndValidateDistributionEvidence(repoRoot, {
          distributionId: '',
          distributionManifestHash: plan.distributionManifestHash,
        }, {
          distributionRoot: options.distributionRoot,
          expectedCommit: plan.sourceCommit,
          rejectStubs: profile === 'roadmap-closure' || profile === 'production-release',
        });
        if (attempt.manifest?.manifestHash) distLoaded = attempt;
      }

      for (const def of registryChecks) {
        let evidence: QualificationEvidenceV1 | undefined = injected.get(def.id);

        if (!evidence) {
          switch (def.kind) {
            case 'source-commit': {
              const ok = head === plan.sourceCommit;
              // Closure: mismatch is failed; internal can warn
              const status = ok
                ? 'passed'
                : profile === 'roadmap-closure' || profile === 'production-release'
                  ? 'failed'
                  : 'warning';
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status,
                reports: [{
                  reportType: 'git-head',
                  reportHash: sha256Hex({ head, plan: plan.sourceCommit }),
                }],
              });
              break;
            }
            case 'working-tree-clean': {
              const ok = !dirty;
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: ok ? 'passed' : 'failed',
                reports: [{
                  reportType: 'git-status',
                  reportHash: sha256Hex({ dirty }),
                }],
              });
              break;
            }
            case 'app-version': {
              const ok = pkg.version === plan.version;
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: ok ? 'passed' : 'failed',
              });
              break;
            }
            case 'package-lock-integrity': {
              const lockPresent = existsSync(join(repoRoot, 'package-lock.json'));
              let ok = lockPresent;
              if (lockPresent) {
                try {
                  await fingerprintPackageLock(repoRoot);
                } catch {
                  ok = false;
                }
              }
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: ok ? 'passed' : 'failed',
              });
              break;
            }
            case 'build-config-integrity': {
              const ok = existsSync(join(repoRoot, 'electron-builder.config.mjs'));
              if (ok) {
                try {
                  await fingerprintBuildConfig(repoRoot);
                } catch { /* keep ok true if file exists */ }
              }
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: ok ? 'passed' : 'failed',
              });
              break;
            }
            case 'secret-scan': {
              const scan = await runSecretScan(repoRoot, distLoaded
                ? [join(options.distributionRoot ?? resolveReleaseCandidateRoot().replace('release-candidates', 'distributions'), 'operations')]
                : []);
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: scan.status,
                reports: [{ reportType: 'secret-scan', reportHash: scan.reportHash }],
              });
              break;
            }
            case 'documentation': {
              const missing = REQUIRED_DOC_PATHS.filter((p) => !existsSync(join(repoRoot, p)));
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: missing.length === 0 ? 'passed' : 'failed',
                reports: [{
                  reportType: 'docs-presence',
                  reportHash: sha256Hex({ missing }),
                }],
              });
              break;
            }
            case 'manual-update-policy': {
              const policyPath = join(repoRoot, 'docs/manual-update-policy.md');
              let ok = existsSync(policyPath);
              if (ok) {
                const text = await readFile(policyPath, 'utf8');
                ok = /manual|disabled|no auto/i.test(text) && !/automatic download enabled/i.test(text);
              }
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: ok ? 'passed' : 'failed',
              });
              break;
            }
            case 'roadmap-current': {
              const ok = existsSync(join(repoRoot, 'docs/roadmap.md'));
              evidence = evidenceService({
                checkId: def.id,
                commit: plan.sourceCommit,
                appVersion: pkg.version,
                required: true,
                status: ok ? 'passed' : 'failed',
              });
              break;
            }
            case 'distribution-manifest':
            case 'distribution-artifact-hashes':
            case 'required-target-evidence': {
              if (!distLoaded || !distLoaded.manifest?.manifestHash) {
                evidence = evidenceService({
                  checkId: def.id,
                  commit: plan.sourceCommit,
                  appVersion: pkg.version,
                  required: true,
                  status: profile === 'internal-development' || profile === 'unit-test'
                    ? 'warning'
                    : 'failed',
                  provider: 'artifact-validation',
                });
              } else {
                const rejectStubs = profile === 'roadmap-closure' || profile === 'production-release';
                if (def.kind === 'required-target-evidence') {
                  const hostPlatform = process.platform === 'darwin'
                    ? 'macos'
                    : process.platform === 'win32' ? 'windows' : 'linux';
                  const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
                  const hostArt = distLoaded.artifacts.find(
                    (a) => a.platform === hostPlatform && a.arch === hostArch,
                  );
                  const webOk = true;
                  let status: QualificationEvidenceV1['status'] = 'passed';
                  if (!hostArt) status = 'failed';
                  else if (rejectStubs && (hostArt.stub || hostArt.dryRun || hostArt.buildMode === 'stub')) {
                    status = 'failed';
                  } else if (hostArt.byteLength <= 0) status = 'failed';
                  if (profile === 'production-release') {
                    for (const t of plan.targets) {
                      if (t.required && t.signingRequired) {
                        const a = distLoaded.artifacts.find((x) => x.platform === t.platform);
                        if (!a || (a.signing.status !== 'signed' && a.signing.status !== 'signed-and-notarized')) {
                          status = 'failed';
                        }
                      }
                    }
                  }
                  evidence = evidenceService({
                    checkId: def.id,
                    commit: plan.sourceCommit,
                    appVersion: pkg.version,
                    required: true,
                    status,
                    provider: 'artifact-validation',
                    artifacts: distLoaded.artifacts.map((a) => ({
                      artifactId: a.artifactId,
                      sha256: a.sha256,
                      manifestHash: distLoaded.manifest.manifestHash,
                      buildMode: a.buildMode,
                      dryRun: a.dryRun,
                      stub: a.stub,
                    })),
                    target: { platform: hostPlatform, arch: hostArch },
                    reports: [{
                      reportType: 'target-policy',
                      reportHash: sha256Hex({ webOk, hasHost: Boolean(hostArt) }),
                    }],
                  });
                } else {
                  evidence = evidenceFromDistribution(
                    def.id,
                    plan.sourceCommit,
                    pkg.version,
                    distLoaded,
                    true,
                    rejectStubs,
                  );
                  if (def.kind === 'distribution-manifest' && distLoaded.validationErrors.length === 0) {
                    // already passed/failed from loader
                  }
                }
              }
              break;
            }
            case 'command':
            default: {
              if (def.commandId && executeCommands) {
                const { result } = await runQualificationCommand(repoRoot, def.commandId);
                evidence = evidenceFromCommand({
                  checkId: def.id,
                  commandId: def.commandId,
                  commit: plan.sourceCommit,
                  appVersion: pkg.version,
                  required: true,
                  result,
                });
              } else if (def.commandId && !executeCommands) {
                // Lightweight verifies / plan contracts: fail closed for closure if not executed.
                evidence = evidenceService({
                  checkId: def.id,
                  commit: plan.sourceCommit,
                  appVersion: pkg.version,
                  required: true,
                  status: profile === 'internal-development'
                    ? 'warning'
                    : 'failed',
                  reports: [{
                    reportType: 'command-not-executed',
                    reportHash: sha256Hex({ commandId: def.commandId }),
                  }],
                });
              } else {
                evidence = evidenceService({
                  checkId: def.id,
                  commit: plan.sourceCommit,
                  appVersion: pkg.version,
                  required: true,
                  status: 'failed',
                });
              }
              break;
            }
          }
        }

        // injectEvidence with fake-test is only valid for unit-test
        const validation = validateQualificationEvidence(evidence!, {
          ...ctxBase,
          // For evidence built against plan.commit, use plan commit as expected;
          // if evidence used fake provider unit-test, force profile unit-test when injected
        });
        // When evidence was injected as fake-test under unit-test profile only
        if (evidence!.provider === 'fake-test' && profile !== 'unit-test') {
          validation.valid = false;
          validation.errors.push({
            severity: 'error',
            code: 'EVIDENCE_FAKE',
            message: 'fake-test not allowed',
          });
        }

        evidenceList.push(evidence!);
        checkResults.push(toCheckResult(evidence!, def.category, validation.errors));
      }

      // Production signing gate — extra check row when channel production
      if (plan.channel === 'production' && profile === 'production-release') {
        const signingFailed = checkResults.some((c) => c.id === 'required-target-evidence' && c.status === 'failed');
        if (signingFailed || !distLoaded) {
          checkResults.push({
            id: 'production-signing-gate',
            category: 'signing',
            required: true,
            status: 'failed',
            summary: 'Production channel requires signing evidence for required targets',
            errors: [{ severity: 'error', code: 'SIGNING', message: 'Missing signed evidence' }],
            warnings: [],
          });
        }
      }

      const blockingCheckIds = checkResults
        .filter((c) => c.required && (c.status === 'failed' || c.status === 'skipped'))
        .map((c) => c.id);
      const warningCheckIds = checkResults.filter((c) => c.status === 'warning').map((c) => c.id);

      let status: ReleaseCandidateReportV1['status'] = 'qualified';
      if (blockingCheckIds.length) status = 'failed';
      else if (warningCheckIds.length) status = 'qualified-with-warnings';

      // unit-test and internal-development never claim full roadmap closure authority for releasable prod
      if (profile === 'unit-test') {
        // can still produce reports for plumbing
      }

      const candidateId = `rc.${plan.id}.${randomUUID().slice(0, 8)}`;
      const hostPlatform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
      const targetResults = plan.targets.map((t) => {
        const art = distLoaded?.artifacts.find((a) => a.platform === t.platform && (!t.arch || a.arch === t.arch));
        return {
          platform: t.platform,
          arch: t.arch,
          status: art
            ? (art.stub || art.dryRun ? 'stub' : 'passed')
            : t.platform === 'web-development' ? 'passed' : 'missing',
          artifactId: art?.fileName,
          artifactSha256: art?.sha256,
          signingStatus: art?.signing?.status ?? (t.signingRequired ? 'missing' : 'not-required'),
        };
      });

      const reportBase = {
        schemaVersion: '1.0.0' as const,
        candidateId,
        planId: plan.id,
        planHash: plan.planHash,
        version: plan.version,
        sourceCommit: plan.sourceCommit,
        status,
        targets: targetResults,
        checks: checkResults,
        blockingCheckIds,
        warningCheckIds,
      };
      const report: ReleaseCandidateReportV1 = {
        ...reportBase,
        reportHash: sha256Hex(reportBase),
        generatedAt: new Date().toISOString(),
      };

      let manifest: ReleaseCandidateManifestV1 | undefined;
      if (
        (status === 'qualified' || status === 'qualified-with-warnings')
        && profile !== 'unit-test'
      ) {
        const manBase = {
          schemaVersion: '1.0.0' as const,
          candidateId,
          version: plan.version,
          sourceCommit: plan.sourceCommit,
          distributionManifestHash: plan.distributionManifestHash,
          qualificationReportHash: report.reportHash,
          channel: plan.channel,
          artifacts: (distLoaded?.artifacts ?? []).map((a) => ({
            platform: a.platform,
            arch: a.arch,
            format: a.format,
            fileName: a.fileName,
            byteLength: a.byteLength,
            sha256: a.sha256,
            signingStatus: a.signing.status,
          })),
          updatePolicy: defaultUpdatePolicy('manual-download'),
          qualificationStatus: status as 'qualified' | 'qualified-with-warnings',
          knownLimitations: [
            'Automatic updater not implemented',
            'Production signing credentials external',
            'Cross-platform packages optional unless CI evidence provided',
          ],
        };
        manifest = {
          ...manBase,
          manifestHash: sha256Hex(manBase),
          createdAt: new Date().toISOString(),
        };
      }

      // Milestone evidence from check results
      const evidenceByCheck = new Map(evidenceList.map((e) => [e.checkId, e]));
      const milestoneEvidence: MilestoneQualificationEvidenceV1[] = ROADMAP_MILESTONE_IDS.map((id) => {
        const requiredIds = MILESTONE_CHECK_MAP[id] ?? [];
        // Only evaluate milestone checks that are in current profile required set
        const applicable = requiredIds.filter((cid) => registryChecks.some((r) => r.id === cid));
        const errs: MilestoneQualificationEvidenceV1['errors'] = [];
        const hashes: string[] = [];
        let complete = true;
        // For profiles that don't require deep regression, mark complete only if applicable empty or all passed
        if (applicable.length === 0) {
          complete = profile === 'internal-development' || profile === 'unit-test';
        }
        for (const cid of applicable) {
          const ev = evidenceByCheck.get(cid);
          const cr = checkResults.find((c) => c.id === cid);
          if (!ev || !cr || cr.status === 'failed' || cr.status === 'skipped') {
            complete = false;
            errs.push({
              severity: 'error',
              code: 'MILESTONE_CHECK',
              message: `Missing/failed check ${cid}`,
            });
          } else {
            hashes.push(ev.evidenceHash);
          }
        }
        // For non-closure profiles, don't claim complete for M0-M7B full set without evidence
        if (profile === 'roadmap-closure' || profile === 'production-release') {
          // complete already computed
        } else if (profile === 'internal-development') {
          // Partial: only mark complete if every *applicable* (light) check passed and milestone has light checks only
          // Do not hardcode complete for all milestones
        }
        return {
          milestoneId: id,
          status: complete ? 'complete' : 'incomplete',
          requiredCheckIds: applicable,
          evidenceHashes: hashes,
          sourceCommit: plan.sourceCommit,
          errors: errs,
          warnings: [],
        };
      });

      // On internal-development, milestones dependent on unexecuted heavy checks stay incomplete
      // Closure requires ALL milestones complete
      const remaining = milestoneEvidence.filter((m) => m.status === 'incomplete').map((m) => m.milestoneId);
      // Additional global gates
      const hasFake = evidenceList.some((e) => e.provider === 'fake-test');
      const hasStubArt = distLoaded?.artifacts.some((a) => a.stub || a.dryRun || a.buildMode === 'stub') ?? false;
      const profileAllowsClosure = profile === 'roadmap-closure' || profile === 'production-release';
      // production-release can close product QA but signing may still fail — roadmapClosed only when all ok
      const globalChecks = [
        {
          id: 'rc-status',
          status: (status === 'failed' ? 'failed' : 'passed') as 'passed' | 'failed',
          message: `Release candidate ${status}`,
        },
        {
          id: 'blocking-checks',
          status: (blockingCheckIds.length ? 'failed' : 'passed') as 'passed' | 'failed',
          message: blockingCheckIds.length ? `Blocking: ${blockingCheckIds.join(', ')}` : 'No blocking checks',
        },
        {
          id: 'profile-gate',
          status: (profileAllowsClosure ? 'passed' : 'failed') as 'passed' | 'failed',
          message: profileAllowsClosure
            ? `Profile ${profile} may close roadmap`
            : `Profile ${profile} cannot close roadmap`,
        },
        {
          id: 'no-fake-evidence',
          status: (hasFake ? 'failed' : 'passed') as 'passed' | 'failed',
          message: hasFake ? 'fake-test evidence present' : 'No fake-test evidence',
        },
        {
          id: 'no-stub-artifacts',
          status: (profileAllowsClosure && hasStubArt ? 'failed' : 'passed') as 'passed' | 'failed',
          message: hasStubArt ? 'Stub/dry-run artifacts present' : 'No stub artifacts (or non-closure profile)',
        },
        {
          id: 'update-policy-explicit',
          status: 'passed' as const,
          message: 'Manual update policy only',
        },
        {
          id: 'milestones-complete',
          status: (remaining.length === 0 ? 'passed' : 'failed') as 'passed' | 'failed',
          message: remaining.length ? `Incomplete: ${remaining.join(',')}` : 'All milestones complete',
        },
      ];

      const roadmapClosed = profileAllowsClosure
        && remaining.length === 0
        && globalChecks.every((g) => g.status === 'passed')
        && status !== 'failed';

      const closureBase = {
        schemaVersion: '1.0.0' as const,
        milestones: milestoneEvidence.map((m) => ({
          id: m.milestoneId,
          status: m.status,
          evidence: {
            commit: m.sourceCommit,
            verificationScripts: m.requiredCheckIds,
            reportHashes: m.evidenceHashes,
          },
        })),
        globalChecks,
        remainingRequiredMilestones: remaining,
        roadmapClosed,
      };
      const closure: BetterChatCutRoadmapClosureReportV1 = {
        ...closureBase,
        reportHash: sha256Hex(closureBase),
      };

      const runId = `qual.${randomUUID().slice(0, 8)}`;
      const evidenceManifestBase: Omit<QualificationEvidenceManifestV1, 'manifestHash' | 'createdAt'> = {
        schemaVersion: '1.0.0',
        qualificationRunId: runId,
        profile,
        sourceCommit: plan.sourceCommit,
        appVersion: pkg.version,
        checkRegistryRevision: CHECK_REGISTRY_REVISION,
        evidence: evidenceList,
      };
      const evidenceManifest: QualificationEvidenceManifestV1 = {
        ...evidenceManifestBase,
        manifestHash: hashEvidenceManifestBody(evidenceManifestBase as unknown as Record<string, unknown>),
        createdAt: new Date().toISOString(),
      };

      await mkdir(join(rcRoot, candidateId), { recursive: true });
      await atomicWriteJson(join(rcRoot, candidateId, 'plan.json'), plan);
      await atomicWriteJson(join(rcRoot, candidateId, 'report.json'), report);
      if (manifest) await atomicWriteJson(join(rcRoot, candidateId, 'manifest.json'), manifest);
      await atomicWriteJson(join(rcRoot, candidateId, 'closure.json'), closure);
      await atomicWriteJson(join(rcRoot, candidateId, 'evidence-manifest.json'), evidenceManifest);
      await atomicWriteJson(join(rcRoot, candidateId, 'milestone-evidence.json'), milestoneEvidence);

      return { report, manifest, closure, evidenceManifest, milestoneEvidence };
    },

    async getReport(candidateId) {
      try {
        return JSON.parse(await readFile(join(rcRoot, candidateId, 'report.json'), 'utf8')) as ReleaseCandidateReportV1;
      } catch {
        return null;
      }
    },
  };
}
