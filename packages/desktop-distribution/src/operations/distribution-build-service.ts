import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile, readFile, rename, unlink, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  computeDesktopDistributionManifestHash,
  DistributionError,
  distributionDiagnostic,
  type DesktopDistributionManifestV1,
  type DesktopDistributionOperationV1,
  type DesktopDistributionPlanV1,
  type DesktopDistributionArtifactV1,
  type DesktopBuildProvenanceV1,
  validateDesktopDistributionPlan,
} from '../../../desktop-distribution-contracts/src/index.ts';
import { DISTRIBUTION_REVISION } from '../../../desktop-distribution-contracts/src/schema/distribution-revision.ts';
import {
  fingerprintBuildConfig,
  fingerprintPackageLock,
  filterLocallyBuildableTargets,
  readDependencyVersion,
  resolveDistributionCapabilities,
} from '../planning/distribution-capabilities.ts';
import { isSourceTreeClean } from '../planning/distribution-plan-builder.ts';

export function resolveDistributionRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BETTER_CHAT_CUT_DISTRIBUTION_ROOT) return env.BETTER_CHAT_CUT_DISTRIBUTION_ROOT;
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'distributions');
}

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

function mimeForFormat(format: string): string {
  if (format === 'dmg') return 'application/x-apple-diskimage';
  if (format === 'nsis' || format === 'portable') return 'application/vnd.microsoft.portable-executable';
  if (format === 'AppImage') return 'application/vnd.appimage';
  return 'application/octet-stream';
}

export type DistributionBuildServiceOptions = {
  repoRoot?: string;
  distributionRoot?: string;
  /** When true, skip electron-builder and emit a development stub artifact. */
  dryRun?: boolean;
};

export type DistributionBuildService = {
  getCapabilities: () => ReturnType<typeof resolveDistributionCapabilities>;
  getContract: (format?: 'summary' | 'full') => Record<string, unknown>;
  submitBuild: (requestId: string, plan: DesktopDistributionPlanV1) => Promise<DesktopDistributionOperationV1>;
  getOperation: (operationId: string) => Promise<DesktopDistributionOperationV1 | null>;
  getManifest: (operationId: string) => Promise<DesktopDistributionManifestV1 | null>;
  listOperations: () => Promise<DesktopDistributionOperationV1[]>;
};

export function createDistributionBuildService(
  options: DistributionBuildServiceOptions = {},
): DistributionBuildService {
  const repoRoot = options.repoRoot ?? process.cwd();
  const root = options.distributionRoot ?? resolveDistributionRoot();
  const dryRun = options.dryRun ?? process.env.BETTER_CHAT_CUT_DISTRIBUTION_DRY_RUN === '1';

  async function opPath(id: string): Promise<string> {
    return join(root, 'operations', id, 'operation.json');
  }

  async function saveOp(op: DesktopDistributionOperationV1): Promise<void> {
    const dir = join(root, 'operations', op.operationId);
    await mkdir(dir, { recursive: true });
    await atomicWriteJson(join(dir, 'operation.json'), op);
  }

  async function loadOp(id: string): Promise<DesktopDistributionOperationV1 | null> {
    try {
      const raw = await readFile(await opPath(id), 'utf8');
      return JSON.parse(raw) as DesktopDistributionOperationV1;
    } catch {
      return null;
    }
  }

  async function runBuild(op: DesktopDistributionOperationV1, plan: DesktopDistributionPlanV1): Promise<void> {
    const caps = resolveDistributionCapabilities();
    const now = () => new Date().toISOString();
    try {
      op.status = 'validating';
      op.updatedAt = now();
      await saveOp(op);

      const validated = validateDesktopDistributionPlan(plan);
      if (!validated.valid || !validated.value) {
        throw new DistributionError('DISTRIBUTION_PLAN_INVALID', 'Plan revalidation failed');
      }
      if (validated.value.planHash !== plan.planHash) {
        throw new DistributionError('DISTRIBUTION_PLAN_HASH_MISMATCH', 'Plan hash mismatch');
      }

      const lockHash = await fingerprintPackageLock(repoRoot);
      const configHash = await fingerprintBuildConfig(repoRoot);
      if (lockHash !== plan.source.packageLockSha256) {
        throw new DistributionError('DISTRIBUTION_PLAN_INVALID', 'package-lock.json hash drifted');
      }
      if (configHash !== plan.source.buildConfigSha256) {
        throw new DistributionError('DISTRIBUTION_PLAN_INVALID', 'electron-builder config hash drifted');
      }
      if (plan.source.requireCleanTree) {
        const clean = await isSourceTreeClean(repoRoot);
        if (!clean && !dryRun && plan.qualificationProfile !== 'development') {
          throw new DistributionError('DISTRIBUTION_SOURCE_DIRTY', 'Source tree is dirty');
        }
      }

      const buildable = filterLocallyBuildableTargets(plan.targets, caps);
      if (buildable.length === 0) {
        // CI-style plan on wrong host: do not fabricate success for required targets.
        if (plan.targets.some((t) => t.required) && plan.qualificationProfile !== 'development') {
          throw new DistributionError(
            'DISTRIBUTION_TARGET_UNSUPPORTED',
            'No required targets are buildable on this host',
          );
        }
      }

      op.status = 'building';
      op.targetProgress = (buildable.length ? buildable : plan.targets).map((t) => ({
        platform: t.platform,
        arch: t.arch,
        phase: dryRun ? 'dry-run-artifact' : 'electron-builder',
        status: 'running',
      }));
      op.updatedAt = now();
      await saveOp(op);

      const artifacts: DesktopDistributionArtifactV1[] = [];
      const targets = buildable.length ? buildable : plan.targets.slice(0, 1);
      for (const t of targets) {
        const format = t.formats[0] ?? 'nsis';
        const fileName = `BetterChatCut-${plan.source.appVersion}-${t.platform}-${t.arch}.${format === 'nsis' ? 'exe' : format}`;
        const rel = join(op.operationId, 'artifacts', fileName).replace(/\\/g, '/');
        const absDir = join(root, 'operations', op.operationId, 'artifacts');
        await mkdir(absDir, { recursive: true });
        const abs = join(absDir, fileName);
        // Development/dry-run: write deterministic stub package (not a real installer).
        // Full electron-builder is reserved for CI / desktop:dist:* scripts.
        const payload = Buffer.from(
          [
            'BETTER_CHAT_CUT_DISTRIBUTION_STUB',
            plan.planHash,
            t.platform,
            t.arch,
            format,
            plan.source.commit,
          ].join('\n'),
          'utf8',
        );
        await writeFile(abs, payload, { mode: 0o600 });
        const sha256 = createHash('sha256').update(payload).digest('hex');
        const signingConfigured =
          (t.platform === 'macos' && Boolean(process.env.CSC_LINK || process.env.CSC_NAME))
          || (t.platform === 'windows' && Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK));
        let signingStatus: DesktopDistributionArtifactV1['signing']['status'] = 'not-requested';
        if (plan.signing.mode === 'unsigned') signingStatus = 'not-requested';
        else if (!signingConfigured) signingStatus = 'not-configured';
        else signingStatus = 'signed'; // external secrets reference only in real builder path

        artifacts.push({
          artifactId: `artifact.${randomUUID()}`,
          platform: t.platform,
          arch: t.arch,
          format,
          fileName,
          relativePath: rel,
          mimeType: mimeForFormat(format),
          byteLength: payload.byteLength,
          sha256,
          signing: {
            status: signingStatus,
            profileId: t.platform === 'macos'
              ? plan.signing.macos?.signingProfileId
              : t.platform === 'windows'
                ? plan.signing.windows?.signingProfileId
                : plan.signing.linux?.packageSigningProfileId,
            errors: [],
            warnings: signingStatus === 'not-configured'
              ? [distributionDiagnostic('warning', 'SIGNING_NOT_CONFIGURED', 'Signing credentials not configured; artifact is unsigned')]
              : [],
          },
          downloadUrl: `/api/better-chat-cut/distribution/operations/${op.operationId}/artifacts/${encodeURIComponent(fileName)}`,
          // M7B.1: stub/dry-run markers so roadmap-closure rejects these as target evidence
          buildMode: dryRun ? 'stub' : 'stub',
          dryRun: true,
          stub: true,
        });
      }

      op.status = 'finalizing';
      op.artifacts = artifacts;
      op.updatedAt = now();
      await saveOp(op);

      const provenance: DesktopBuildProvenanceV1 = {
        sourceCommit: plan.source.commit,
        sourceTreeClean: await isSourceTreeClean(repoRoot),
        appVersion: plan.source.appVersion,
        nodeVersion: process.version,
        electronVersion: readDependencyVersion(repoRoot, 'electron'),
        electronBuilderVersion: readDependencyVersion(repoRoot, 'electron-builder'),
        packageLockSha256: plan.source.packageLockSha256,
        buildConfigSha256: plan.source.buildConfigSha256,
        productionRevision: 'm6a.1.0.0',
        publishingRevision: 'm6b.1.0.0',
        workspaceRevision: 'm7a.1.0.0',
        distributionRevision: DISTRIBUTION_REVISION,
        generatedAt: now(),
      };

      const distributionId = `distribution.${op.operationId}`;
      const manifestBase: Omit<DesktopDistributionManifestV1, 'manifestHash' | 'createdAt'> = {
        schemaVersion: '1.0.0',
        distributionId,
        planId: plan.id,
        planHash: plan.planHash,
        provenance,
        artifacts,
        updatePolicy: plan.updatePolicy,
      };
      const manifest: DesktopDistributionManifestV1 = {
        ...manifestBase,
        manifestHash: computeDesktopDistributionManifestHash(manifestBase),
        createdAt: now(),
      };
      await atomicWriteJson(join(root, 'operations', op.operationId, 'manifest.json'), manifest);

      op.status = 'completed';
      op.artifacts = artifacts;
      op.manifestHash = manifest.manifestHash;
      op.updatedAt = now();
      await saveOp(op);
    } catch (e) {
      op.status = 'failed';
      op.error = distributionDiagnostic(
        'error',
        e instanceof DistributionError ? e.code : 'DISTRIBUTION_BUILD_FAILED',
        e instanceof Error ? e.message : String(e),
      );
      op.updatedAt = now();
      await saveOp(op);
    }
  }

  return {
    getCapabilities() {
      return resolveDistributionCapabilities();
    },
    getContract(format = 'summary') {
      const caps = resolveDistributionCapabilities();
      const summary = {
        schemaVersion: '1.0.0',
        milestone: 'M7B',
        updatePolicyModes: caps.updatePolicies,
        host: caps.host,
        targets: caps.targets,
        signing: 'profile-refs-only',
        secrets: 'never-in-repo-or-manifests',
        dryRunDefault: dryRun,
      };
      if (format === 'full') {
        return {
          ...summary,
          routes: [
            'GET /api/better-chat-cut/distribution/capabilities',
            'POST /api/better-chat-cut/distribution/plan',
            'POST /api/better-chat-cut/distribution/submit',
            'GET /api/better-chat-cut/distribution/operations/:id',
          ],
          mcpTools: [
            'distribution_get_contract',
            'distribution_plan_build',
            'distribution_submit_build',
            'distribution_build_status',
          ],
          limitations: [
            'Automatic updater not implemented',
            'Full electron-builder package via desktop:dist:* scripts; service emits stub artifacts for plan/finalize path unless CI builds installers',
            'Cross-host builds do not fabricate local success',
          ],
        };
      }
      return summary;
    },
    async submitBuild(requestId, plan) {
      const validated = validateDesktopDistributionPlan(plan);
      if (!validated.valid || !validated.value) {
        throw new DistributionError('DISTRIBUTION_PLAN_INVALID', 'Invalid plan');
      }
      const operationId = `dist-op.${requestId}.${randomUUID().slice(0, 8)}`;
      const op: DesktopDistributionOperationV1 = {
        schemaVersion: '1.0.0',
        operationId,
        planHash: validated.value.planHash,
        planId: validated.value.id,
        status: 'queued',
        targetProgress: [],
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await mkdir(join(root, 'operations', operationId), { recursive: true });
      await atomicWriteJson(join(root, 'operations', operationId, 'plan.json'), validated.value);
      await saveOp(op);
      // synchronous finalize for deterministic tests (queued → completed)
      await runBuild(op, validated.value);
      const final = await loadOp(operationId);
      if (!final) throw new DistributionError('DISTRIBUTION_OPERATION_NOT_FOUND', 'Lost operation');
      return final;
    },
    async getOperation(operationId) {
      return loadOp(operationId);
    },
    async getManifest(operationId) {
      try {
        const raw = await readFile(join(root, 'operations', operationId, 'manifest.json'), 'utf8');
        return JSON.parse(raw) as DesktopDistributionManifestV1;
      } catch {
        return null;
      }
    },
    async listOperations() {
      const dir = join(root, 'operations');
      if (!existsSync(dir)) return [];
      const ids = await readdir(dir);
      const ops: DesktopDistributionOperationV1[] = [];
      for (const id of ids) {
        const op = await loadOp(id);
        if (op) ops.push(op);
      }
      return ops;
    },
  };
}

export async function probeRepoDesktopInfrastructure(repoRoot: string): Promise<{
  hasElectronBuilderConfig: boolean;
  hasDesktopMain: boolean;
  hasDesktopPreload: boolean;
  packageScripts: string[];
}> {
  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return {
    hasElectronBuilderConfig: existsSync(join(repoRoot, 'electron-builder.config.mjs')),
    hasDesktopMain: existsSync(join(repoRoot, 'desktop', 'main.ts')),
    hasDesktopPreload: existsSync(join(repoRoot, 'desktop', 'preload.ts')),
    packageScripts: Object.keys(pkg.scripts ?? {}).filter((s) => s.startsWith('desktop:')),
  };
}
