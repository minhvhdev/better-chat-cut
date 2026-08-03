import { join, relative, resolve, sep } from 'node:path';
import { ProductionRunError } from '../contracts/production-run-errors.ts';
import type { ProductionArtifactType } from '../../../explainer-production-contracts/src/index.ts';

const RUN_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;
const ARTIFACT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_REQUEST_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;

export function assertSafeRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId) || runId.includes('..') || runId.includes('/') || runId.includes('\\')) {
    throw new ProductionRunError('PRODUCTION_RUN_INVALID_ID', `Invalid run id: ${runId}`, {
      recovery: 'Use production-run.<request-id-tail>.<hash>',
    });
  }
}

export function assertSafeRequestId(requestId: string): void {
  if (!SAFE_REQUEST_ID.test(requestId) || requestId.includes('..')) {
    throw new ProductionRunError('PRODUCTION_RUN_INVALID_ID', `Invalid request id: ${requestId}`);
  }
}

export function assertSafeArtifactHash(hash: string): void {
  if (!ARTIFACT_HASH_PATTERN.test(hash)) {
    throw new ProductionRunError('PRODUCTION_RUN_ARTIFACT_HASH_INVALID', `Invalid artifact hash: ${hash}`);
  }
}

export function assertPathInsideRoot(root: string, target: string): void {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(resolvedRoot, rel) !== resolvedTarget) {
    throw new ProductionRunError('PRODUCTION_RUN_INVALID_ID', 'Path escapes production run root', {
      recovery: 'Do not supply filesystem paths; use run/artifact ids only',
    });
  }
}

export function runDir(root: string, runId: string): string {
  assertSafeRunId(runId);
  const dir = join(root, runId);
  assertPathInsideRoot(root, dir);
  return dir;
}

export function runJsonPath(root: string, runId: string): string {
  return join(runDir(root, runId), 'run.json');
}

export function runLockPath(root: string, runId: string): string {
  return join(runDir(root, runId), 'run.lock');
}

export function eventsPath(root: string, runId: string): string {
  return join(runDir(root, runId), 'events.jsonl');
}

export function artifactPath(root: string, runId: string, artifactType: ProductionArtifactType, hash: string): string {
  assertSafeArtifactHash(hash);
  if (artifactType.includes('..') || artifactType.includes('/') || artifactType.includes('\\')) {
    throw new ProductionRunError('PRODUCTION_RUN_INVALID_ID', 'Invalid artifact type path');
  }
  const path = join(runDir(root, runId), 'artifacts', artifactType, `${hash}.json`);
  assertPathInsideRoot(root, path);
  return path;
}

export function receiptPath(root: string, runId: string, requestId: string): string {
  assertSafeRequestId(requestId);
  const path = join(runDir(root, runId), 'operations', `${requestId}.json`);
  assertPathInsideRoot(root, path);
  return path;
}

export function reviewPath(root: string, runId: string, reviewId: string): string {
  if (!SAFE_REQUEST_ID.test(reviewId.replace(/:/g, '.')) && !/^[a-zA-Z0-9._-]+$/.test(reviewId)) {
    throw new ProductionRunError('PRODUCTION_RUN_INVALID_ID', `Invalid review id: ${reviewId}`);
  }
  if (reviewId.includes('..') || reviewId.includes('/') || reviewId.includes('\\')) {
    throw new ProductionRunError('PRODUCTION_RUN_INVALID_ID', 'Invalid review id path');
  }
  const path = join(runDir(root, runId), 'reviews', `${reviewId}.json`);
  assertPathInsideRoot(root, path);
  return path;
}
