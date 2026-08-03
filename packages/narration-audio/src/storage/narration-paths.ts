import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { NarrationError } from '../contracts/narration-audio-errors.ts';

export function resolveNarrationRoot(override?: string): string {
  const env = override
    ?? process.env.BETTER_CHAT_CUT_NARRATION_ROOT
    ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'narration');
  return resolve(env);
}

export function narrationPlanDir(root: string, planHash: string): string {
  assertSafeSegment(planHash, 'planHash');
  return join(root, 'plans', planHash);
}

export function segmentArtifactPath(
  root: string,
  planHash: string,
  segmentId: string,
  synthesisInputHash: string,
): string {
  assertSafeSegment(planHash, 'planHash');
  assertSafeSegment(segmentId, 'segmentId');
  assertSafeSegment(synthesisInputHash, 'synthesisInputHash');
  return join(root, 'plans', planHash, 'segments', segmentId, 'artifacts', synthesisInputHash, 'artifact.json');
}

export function segmentOperationPath(
  root: string,
  planHash: string,
  segmentId: string,
  requestId: string,
): string {
  assertSafeSegment(planHash, 'planHash');
  assertSafeSegment(segmentId, 'segmentId');
  assertSafeSegment(requestId, 'requestId');
  return join(root, 'plans', planHash, 'segments', segmentId, 'operations', `${requestId}.json`);
}

export function sceneAudioArtifactPath(
  root: string,
  planHash: string,
  sceneEntryId: string,
  sceneAudioHash: string,
): string {
  assertSafeSegment(planHash, 'planHash');
  assertSafeSegment(sceneEntryId, 'sceneEntryId');
  assertSafeSegment(sceneAudioHash, 'sceneAudioHash');
  return join(root, 'plans', planHash, 'scenes', sceneEntryId, sceneAudioHash, 'artifact.json');
}

export function timingSnapshotPath(root: string, planHash: string, timingHash: string): string {
  assertSafeSegment(planHash, 'planHash');
  assertSafeSegment(timingHash, 'timingHash');
  return join(root, 'plans', planHash, 'timing', `${timingHash}.json`);
}

export function subtitleArtifactDir(root: string, subtitleHash: string): string {
  assertSafeSegment(subtitleHash, 'subtitleHash');
  return join(root, 'subtitle-artifacts', subtitleHash);
}

export function assertSafeSegment(value: string, label: string): void {
  if (!value || value.includes('..') || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new NarrationError('NARRATION_PATH_TRAVERSAL', `Unsafe ${label}`, {
      recovery: 'Use opaque hashes/ids without path separators',
    });
  }
}

export function assertPathInsideRoot(root: string, target: string): void {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + '\\') && !resolvedTarget.startsWith(resolvedRoot + '/')) {
    throw new NarrationError('NARRATION_PATH_TRAVERSAL', 'Path escapes narration root', {
      recovery: 'Keep artifacts under BETTER_CHAT_CUT_NARRATION_ROOT',
    });
  }
}

export function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  try {
    renameSync(tmp, path);
  } catch {
    try { unlinkSync(path); } catch { /* ignore */ }
    renameSync(tmp, path);
  }
}

export function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function sha256Bytes(bytes: Uint8Array | Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function mediaSrcForHash(audioContentHash: string): string {
  return `/media/narration/${audioContentHash}.wav`;
}
