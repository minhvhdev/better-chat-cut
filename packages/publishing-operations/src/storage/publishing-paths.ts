import { join } from 'node:path';

const SAFE_RUN_ID = /^publishing-run\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-f0-9]{6,16}$/i;
const SAFE_HASH = /^[a-f0-9]{16,128}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function assertSafeRunId(runId: string): void {
  if (!SAFE_RUN_ID.test(runId) || runId.includes('..') || runId.includes('/') || runId.includes('\\')) {
    throw new Error(`Unsafe publishing run id: ${runId}`);
  }
}

export function assertSafeHash(hash: string): void {
  if (!SAFE_HASH.test(hash) || hash.includes('..')) {
    throw new Error(`Unsafe artifact hash: ${hash}`);
  }
}

export function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id) || id.includes('..')) {
    throw new Error(`Unsafe id: ${id}`);
  }
}

export function runDir(root: string, runId: string): string {
  assertSafeRunId(runId);
  return join(root, 'runs', runId);
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

export function artifactPath(root: string, runId: string, artifactType: string, hash: string): string {
  assertSafeHash(hash);
  return join(runDir(root, runId), 'artifacts', artifactType, `${hash}.json`);
}

export function reviewPath(root: string, runId: string, reviewId: string): string {
  assertSafeId(reviewId);
  return join(runDir(root, runId), 'artifacts', 'reviews', `${reviewId}.json`);
}

export function receiptPath(root: string, runId: string, requestId: string): string {
  assertSafeId(requestId);
  return join(runDir(root, runId), 'receipts', `${requestId}.json`);
}

export function uploadOpPath(root: string, runId: string, operationId: string): string {
  assertSafeId(operationId);
  return join(runDir(root, runId), 'operations', 'upload', `${operationId}.json`);
}

export function releaseOpPath(root: string, runId: string, operationId: string): string {
  assertSafeId(operationId);
  return join(runDir(root, runId), 'operations', 'release', `${operationId}.json`);
}

export function thumbnailArtifactDir(root: string, runId: string, artifactHash: string): string {
  assertSafeHash(artifactHash);
  return join(runDir(root, runId), 'artifacts', 'thumbnails', artifactHash);
}
