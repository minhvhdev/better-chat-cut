import { mkdirSync, renameSync, writeFileSync, unlinkSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PublishingOperationError } from '../contracts/publishing-operation-errors.ts';

export function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    try {
      renameSync(tmp, path);
    } catch {
      try { unlinkSync(path); } catch { /* ignore */ }
      renameSync(tmp, path);
    }
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw new PublishingOperationError('PUBLISHING_RUN_ATOMIC_WRITE_FAILED', `Failed atomic write: ${path}`, {
      cause: error,
    });
  }
}

export function writeImmutableJson(path: string, value: unknown): void {
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8');
    const next = JSON.stringify(value, null, 2);
    if (existing === next) return;
    throw new PublishingOperationError('PUBLISHING_RUN_ATOMIC_WRITE_FAILED', 'Immutable artifact already exists with different content');
  }
  atomicWriteJson(path, value);
}

export function appendJsonl(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
}

export function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function readJsonlIfExists<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
