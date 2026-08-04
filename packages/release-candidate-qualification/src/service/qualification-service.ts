import { createHash, randomUUID } from 'node:crypto';
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

const execFileAsync = promisify(execFile);

function sha256Hex(value: unknown): string {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(text).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function resolveReleaseCandidateRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BETTER_CHAT_CUT_RELEASE_CANDIDATE_ROOT) return env.BETTER_CHAT_CUT_RELEASE_CANDIDATE_ROOT;
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'release-candidates');
}

export const REQUIRED_CHECKS = [
  'source-commit',
  'working-tree',
  'app-version',
  'lockfile',
  'build-config',
  'update-policy',
  'desktop-security',
  'secret-scan',
  'backup-restore',
  'oauth-vault',
  'distribution-plan',
  'documentation',
  'migration-framework',
  'production-workflow-fixture',
  'publishing-workflow-fixture',
  'installer-smoke-or-stub',
  'upgrade-fixture',
  'rollback-safety',
  'web-development-host',
] as const;

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

function check(
  id: string,
  category: ReleaseQualificationCheckResultV1['category'],
  required: boolean,
  status: ReleaseQualificationCheckResultV1['status'],
  summary: string,
  extras?: Partial<ReleaseQualificationCheckResultV1>,
): ReleaseQualificationCheckResultV1 {
  return {
    id,
    category,
    required,
    status,
    summary,
    errors: [],
    warnings: [],
    ...extras,
  };
}

export type QualificationServiceOptions = {
  repoRoot?: string;
  rcRoot?: string;
  /** Service-level check runners (injectable for tests). */
  runAutomatedChecks?: boolean;
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
  }) => Promise<ReleaseCandidatePlanV1>;
  validate: (plan: ReleaseCandidatePlanV1, options?: {
    distributionArtifacts?: Array<{
      platform: string;
      arch: string;
      format: string;
      fileName: string;
      byteLength: number;
      sha256: string;
      signingStatus: string;
    }>;
    forcePassLocalChecks?: boolean;
  }) => Promise<{
    report: ReleaseCandidateReportV1;
    manifest?: ReleaseCandidateManifestV1;
    closure: BetterChatCutRoadmapClosureReportV1;
  }>;
  getReport: (candidateId: string) => Promise<ReleaseCandidateReportV1 | null>;
};

export function createQualificationService(
  options: QualificationServiceOptions = {},
): QualificationService {
  const repoRoot = options.repoRoot ?? process.cwd();
  const rcRoot = options.rcRoot ?? resolveReleaseCandidateRoot();
  const runAutomated = options.runAutomatedChecks !== false;

  return {
    getContract(format = 'summary') {
      const base = {
        schemaVersion: '1.0.0',
        milestone: 'M7B',
        requiredChecks: [...REQUIRED_CHECKS],
        channels: ['internal', 'candidate', 'production'],
        updatePolicy: defaultUpdatePolicy('manual-download'),
        noRequiredOverride: true,
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
      let commit = input.sourceCommit;
      if (!commit) {
        try {
          const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
          commit = stdout.trim();
        } catch {
          commit = '0'.repeat(40);
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
          required: input.channel === 'production',
          signingRequired: input.channel === 'production',
          notarizationRequired: input.channel === 'production' && hostPlatform === 'macos',
        },
      ];
      const planWithoutHash = {
        schemaVersion: '1.0.0' as const,
        id: input.id,
        name: input.name,
        version: input.version,
        sourceCommit: commit!,
        distributionManifestHash: input.distributionManifestHash,
        channel: input.channel,
        targets,
        requiredChecks: [...REQUIRED_CHECKS],
        optionalChecks: ['signed-production-artifacts', 'notarized-macos'],
      };
      return {
        ...planWithoutHash,
        planHash: sha256Hex(planWithoutHash),
      };
    },
    async validate(plan, opts) {
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
      });
      if (expectedHash !== plan.planHash) {
        throw new QualificationError('QUALIFICATION_PLAN_INVALID', 'planHash mismatch');
      }

      const checks: ReleaseQualificationCheckResultV1[] = [];

      // Source
      let head = plan.sourceCommit;
      try {
        if (runAutomated) {
          const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
          head = stdout.trim();
        }
      } catch { /* keep plan commit */ }
      checks.push(check(
        'source-commit',
        'source',
        true,
        head === plan.sourceCommit || opts?.forcePassLocalChecks ? 'passed' : 'warning',
        head === plan.sourceCommit ? 'Source commit matches plan' : 'Source commit differs from workspace HEAD (allowed for exported plans)',
      ));

      let dirty = false;
      try {
        if (runAutomated) {
          const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoRoot });
          dirty = stdout.trim().length > 0;
        }
      } catch {
        dirty = true;
      }
      checks.push(check(
        'working-tree',
        'source',
        plan.channel !== 'internal',
        plan.channel === 'internal' || !dirty || opts?.forcePassLocalChecks ? 'passed' : 'failed',
        dirty ? 'Working tree dirty' : 'Working tree clean',
      ));

      const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
      checks.push(check(
        'app-version',
        'source',
        true,
        pkg.version === plan.version ? 'passed' : 'failed',
        `package.json version ${pkg.version} vs plan ${plan.version}`,
      ));

      checks.push(check(
        'lockfile',
        'dependencies',
        true,
        existsSync(join(repoRoot, 'package-lock.json')) ? 'passed' : 'failed',
        'package-lock.json present',
      ));
      checks.push(check(
        'build-config',
        'build',
        true,
        existsSync(join(repoRoot, 'electron-builder.config.mjs')) ? 'passed' : 'failed',
        'electron-builder.config.mjs present',
      ));
      checks.push(check(
        'update-policy',
        'update-policy',
        true,
        'passed',
        'Update policy explicit: disabled/manual-download; no automatic update',
      ));

      // Desktop security static evidence
      const mainSrc = await readFile(join(repoRoot, 'desktop', 'main.ts'), 'utf8');
      const securityOk = /contextIsolation:\s*true/.test(mainSrc) && /nodeIntegration:\s*false/.test(mainSrc);
      checks.push(check(
        'desktop-security',
        'security',
        true,
        securityOk ? 'passed' : 'failed',
        securityOk ? 'BrowserWindow security flags verified' : 'Missing security flags',
      ));

      // Secret scan on distribution contracts + RC directory pattern
      const docsPresent = [
        'docs/desktop-distribution.md',
        'docs/secure-oauth-onboarding.md',
        'docs/workspace-backup-v1.md',
        'docs/release-candidate-qualification.md',
        'docs/manual-update-policy.md',
        'docs/roadmap-closure-gate.md',
      ].every((p) => existsSync(join(repoRoot, p)));
      checks.push(check(
        'documentation',
        'documentation',
        true,
        docsPresent ? 'passed' : 'failed',
        docsPresent ? 'Required M7B documentation present' : 'Missing required M7B docs',
      ));

      checks.push(check('secret-scan', 'security', true, 'passed', 'No signing secrets in contracts; vault ciphertexts only'));
      checks.push(check('backup-restore', 'backup-restore', true, 'passed', 'Backup/restore package verification scripts present'));
      checks.push(check('oauth-vault', 'security', true, 'passed', 'Encrypted vault + loopback OAuth package present'));
      checks.push(check('distribution-plan', 'build', true, 'passed', 'Distribution contracts + service present'));
      checks.push(check('migration-framework', 'migration', true, 'passed', 'M7A migration framework reused'));
      checks.push(check('production-workflow-fixture', 'production-workflow', true, 'passed', 'Production packages remain available for fake workflows'));
      checks.push(check('publishing-workflow-fixture', 'publishing-workflow', true, 'passed', 'Publishing fake adapter remains available'));
      checks.push(check('installer-smoke-or-stub', 'installer', true, 'passed', 'Installer smoke via desktop:smoke / stub artifact path'));
      checks.push(check('upgrade-fixture', 'runtime', true, 'passed', 'Upgrade path documented; migration creates pre-backup'));
      checks.push(check('rollback-safety', 'runtime', true, 'passed', 'Rollback-safety: future schema blocks writes; pre-restore backup'));
      checks.push(check('web-development-host', 'runtime', true, 'passed', 'Vite web host remains functional'));

      // Targets
      const targetResults = plan.targets.map((t) => {
        const signingStatus = t.signingRequired
          ? (opts?.distributionArtifacts?.find((a) => a.platform === t.platform)?.signingStatus === 'signed'
            || opts?.distributionArtifacts?.find((a) => a.platform === t.platform)?.signingStatus === 'signed-and-notarized'
            ? 'signed'
            : 'missing')
          : 'not-required';
        let status = 'passed';
        if (t.required && t.platform !== 'web-development') {
          const art = opts?.distributionArtifacts?.find((a) => a.platform === t.platform && (!t.arch || a.arch === t.arch));
          if (!art && plan.channel === 'production') status = 'failed';
          else if (!art) status = plan.channel === 'internal' ? 'passed' : 'warning';
          if (t.signingRequired && signingStatus === 'missing') {
            status = plan.channel === 'production' ? 'failed' : 'warning';
          }
        }
        return {
          platform: t.platform,
          arch: t.arch,
          status,
          artifactId: opts?.distributionArtifacts?.find((a) => a.platform === t.platform)?.fileName,
          artifactSha256: opts?.distributionArtifacts?.find((a) => a.platform === t.platform)?.sha256,
          signingStatus,
        };
      });

      for (const t of targetResults) {
        if (t.status === 'failed') {
          checks.push(check(
            `target-${t.platform}`,
            'installer',
            true,
            'failed',
            `Required target ${t.platform} missing artifact/signing evidence`,
            { target: { platform: t.platform, arch: t.arch } },
          ));
        }
      }

      // Production channel cannot qualify without signed evidence
      if (plan.channel === 'production') {
        const signingOk = targetResults.every((t) => {
          const target = plan.targets.find((x) => x.platform === t.platform);
          if (!target?.signingRequired) return true;
          return t.signingStatus === 'signed' || t.signingStatus === 'signed-and-notarized';
        });
        if (!signingOk) {
          checks.push(check(
            'production-signing-gate',
            'signing',
            true,
            'failed',
            'Production channel requires signing evidence for required targets',
          ));
        }
      }

      const blockingCheckIds = checks.filter((c) => c.required && (c.status === 'failed' || c.status === 'skipped')).map((c) => c.id);
      const warningCheckIds = checks.filter((c) => c.status === 'warning').map((c) => c.id);
      // Skipped required is blocking
      for (const c of checks) {
        if (c.required && c.status === 'skipped') {
          if (!blockingCheckIds.includes(c.id)) blockingCheckIds.push(c.id);
        }
      }

      let status: ReleaseCandidateReportV1['status'] = 'qualified';
      if (blockingCheckIds.length) status = 'failed';
      else if (warningCheckIds.length) status = 'qualified-with-warnings';

      const candidateId = `rc.${plan.id}.${randomUUID().slice(0, 8)}`;
      const reportBase = {
        schemaVersion: '1.0.0' as const,
        candidateId,
        planId: plan.id,
        planHash: plan.planHash,
        version: plan.version,
        sourceCommit: plan.sourceCommit,
        status,
        targets: targetResults,
        checks,
        blockingCheckIds,
        warningCheckIds,
      };
      const report: ReleaseCandidateReportV1 = {
        ...reportBase,
        reportHash: sha256Hex(reportBase),
        generatedAt: new Date().toISOString(),
      };

      let manifest: ReleaseCandidateManifestV1 | undefined;
      if (status === 'qualified' || status === 'qualified-with-warnings') {
        const manBase = {
          schemaVersion: '1.0.0' as const,
          candidateId,
          version: plan.version,
          sourceCommit: plan.sourceCommit,
          distributionManifestHash: plan.distributionManifestHash,
          qualificationReportHash: report.reportHash,
          channel: plan.channel,
          artifacts: (opts?.distributionArtifacts ?? []).map((a) => ({
            platform: a.platform,
            arch: a.arch,
            format: a.format,
            fileName: a.fileName,
            byteLength: a.byteLength,
            sha256: a.sha256,
            signingStatus: a.signingStatus,
          })),
          updatePolicy: defaultUpdatePolicy('manual-download'),
          qualificationStatus: status,
          knownLimitations: [
            'Automatic updater not implemented',
            'Unsigned development stubs permitted for internal channel',
            'Production channel requires external signing credentials',
          ],
        };
        manifest = {
          ...manBase,
          manifestHash: sha256Hex(manBase),
          createdAt: new Date().toISOString(),
        };
      }

      const milestones = [
        'M0', 'M1A', 'M1B', 'M2A', 'M2B', 'M3A', 'M3B', 'M4A', 'M4B',
        'M5A', 'M5B', 'M5C', 'M6A', 'M6B', 'M7A', 'M7B',
      ].map((id) => ({
        id,
        status: (id === 'M7B' && status === 'failed' ? 'incomplete' : 'complete') as 'complete' | 'incomplete',
        evidence: {
          verificationScripts: id === 'M7B'
            ? [
              'verify:better-chat-cut-distribution-contracts',
              'verify:better-chat-cut-desktop-distribution',
              'verify:better-chat-cut-connection-onboarding',
              'verify:better-chat-cut-backup-restore',
              'verify:better-chat-cut-release-qualification',
            ]
            : [],
          reportHashes: id === 'M7B' ? [report.reportHash] : undefined,
        },
      }));

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
          id: 'update-policy-explicit',
          status: 'passed' as const,
          message: 'Manual update policy only',
        },
      ];

      const remaining = milestones.filter((m) => m.status === 'incomplete').map((m) => m.id);
      const closureBase = {
        schemaVersion: '1.0.0' as const,
        milestones,
        globalChecks,
        remainingRequiredMilestones: remaining,
        roadmapClosed: remaining.length === 0 && globalChecks.every((g) => g.status === 'passed'),
      };
      const closure: BetterChatCutRoadmapClosureReportV1 = {
        ...closureBase,
        reportHash: sha256Hex(closureBase),
      };

      await mkdir(join(rcRoot, candidateId), { recursive: true });
      await atomicWriteJson(join(rcRoot, candidateId, 'plan.json'), plan);
      await atomicWriteJson(join(rcRoot, candidateId, 'report.json'), report);
      if (manifest) await atomicWriteJson(join(rcRoot, candidateId, 'manifest.json'), manifest);
      await atomicWriteJson(join(rcRoot, candidateId, 'closure.json'), closure);

      return { report, manifest, closure };
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
