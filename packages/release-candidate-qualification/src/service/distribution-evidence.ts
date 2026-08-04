import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  DesktopDistributionManifestV1,
  DesktopDistributionArtifactV1,
} from '../../../desktop-distribution-contracts/src/index.ts';
import { resolveDistributionRoot } from '../../../desktop-distribution/src/index.ts';
import type { DistributionEvidenceReferenceV1, QualificationEvidenceV1 } from '../contracts/evidence-types.ts';
import { evidenceService } from './command-runner.ts';

export type LoadedDistributionEvidence = {
  ref: DistributionEvidenceReferenceV1;
  operationId: string;
  manifest: DesktopDistributionManifestV1;
  artifacts: DesktopDistributionArtifactV1[];
  validationErrors: string[];
};

function recomputeFileSha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Load + validate distribution from store. Caller metadata is never trusted alone.
 */
export async function loadAndValidateDistributionEvidence(
  repoRoot: string,
  ref: DistributionEvidenceReferenceV1,
  options: {
    distributionRoot?: string;
    expectedCommit?: string;
    rejectStubs?: boolean;
  } = {},
): Promise<LoadedDistributionEvidence> {
  const root = options.distributionRoot ?? resolveDistributionRoot();
  const validationErrors: string[] = [];
  const operationsDir = join(root, 'operations');

  let operationId = ref.operationId;
  let manifest: DesktopDistributionManifestV1 | null = null;

  if (operationId) {
    try {
      manifest = JSON.parse(
        await readFile(join(operationsDir, operationId, 'manifest.json'), 'utf8'),
      ) as DesktopDistributionManifestV1;
    } catch {
      validationErrors.push('manifest load failed for operation');
    }
  } else {
    // Scan operations for matching distributionId / manifestHash
    const { readdir } = await import('node:fs/promises');
    if (!existsSync(operationsDir)) {
      validationErrors.push('distribution operations directory missing');
    } else {
      for (const id of await readdir(operationsDir)) {
        try {
          const man = JSON.parse(
            await readFile(join(operationsDir, id, 'manifest.json'), 'utf8'),
          ) as DesktopDistributionManifestV1;
          if (
            man.distributionId === ref.distributionId
            || man.manifestHash === ref.distributionManifestHash
          ) {
            manifest = man;
            operationId = id;
            break;
          }
        } catch {
          /* continue */
        }
      }
    }
  }

  if (!manifest || !operationId) {
    return {
      ref,
      operationId: operationId ?? '',
      manifest: {} as DesktopDistributionManifestV1,
      artifacts: [],
      validationErrors: [...validationErrors, 'distribution manifest not found'],
    };
  }

  if (manifest.manifestHash !== ref.distributionManifestHash) {
    validationErrors.push('distributionManifestHash mismatch vs loaded manifest');
  }
  if (manifest.distributionId !== ref.distributionId && ref.distributionId) {
    // soft: allow match by hash-only when ids differ intentionally
    if (manifest.manifestHash !== ref.distributionManifestHash) {
      validationErrors.push('distributionId mismatch');
    }
  }
  if (options.expectedCommit && manifest.provenance?.sourceCommit !== options.expectedCommit) {
    validationErrors.push('distribution provenance commit mismatch');
  }

  const artifacts = manifest.artifacts ?? [];
  for (const a of artifacts) {
    const abs = join(operationsDir, operationId, 'artifacts', a.fileName);
    if (!existsSync(abs)) {
      // relativePath might nest under operation
      const alt = join(root, 'operations', a.relativePath);
      if (!existsSync(alt) && !existsSync(join(operationsDir, operationId, a.relativePath))) {
        validationErrors.push(`artifact file missing: ${a.fileName}`);
        continue;
      }
    }
    const pathTry = [
      join(operationsDir, operationId, 'artifacts', a.fileName),
      join(operationsDir, operationId, a.relativePath),
      join(root, 'operations', a.relativePath),
    ].find((p) => existsSync(p));
    if (!pathTry) continue;
    const buf = await readFile(pathTry);
    if (buf.byteLength === 0) validationErrors.push(`zero-byte artifact: ${a.fileName}`);
    if (buf.byteLength !== a.byteLength) validationErrors.push(`byteLength mismatch: ${a.fileName}`);
    const sha = recomputeFileSha256(buf);
    if (sha !== a.sha256) validationErrors.push(`sha256 mismatch: ${a.fileName}`);
    const stubMarker = buf.toString('utf8', 0, Math.min(buf.length, 40)).includes('DISTRIBUTION_STUB');
    if (stubMarker || a.stub === true || a.dryRun === true || a.buildMode === 'stub') {
      if (options.rejectStubs) {
        validationErrors.push(`stub/dry-run artifact rejected: ${a.fileName}`);
      }
    }
  }

  return {
    ref: {
      distributionId: manifest.distributionId,
      distributionManifestHash: manifest.manifestHash,
      operationId,
    },
    operationId,
    manifest,
    artifacts,
    validationErrors,
  };
}

export function evidenceFromDistribution(
  checkId: string,
  commit: string,
  appVersion: string,
  loaded: LoadedDistributionEvidence,
  required: boolean,
  rejectStubs: boolean,
): QualificationEvidenceV1 {
  const failed = loaded.validationErrors.length > 0;
  const hasStub = loaded.artifacts.some(
    (a) => a.stub === true || a.dryRun === true || a.buildMode === 'stub',
  );
  const status = failed || (rejectStubs && hasStub) ? 'failed' : 'passed';
  return evidenceService({
    checkId,
    commit,
    appVersion,
    required,
    status,
    provider: 'artifact-validation',
    artifacts: loaded.artifacts.map((a) => ({
      artifactId: a.artifactId,
      sha256: a.sha256,
      manifestHash: loaded.manifest.manifestHash,
      buildMode: a.buildMode,
      dryRun: a.dryRun,
      stub: a.stub,
    })),
    reports: [
      {
        reportType: 'distribution-validation',
        reportHash: createHash('sha256').update(JSON.stringify({
          errors: loaded.validationErrors,
          manifestHash: loaded.manifest.manifestHash,
        })).digest('hex'),
      },
    ],
  });
}
