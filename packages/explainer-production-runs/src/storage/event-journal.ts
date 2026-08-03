import { mkdirSync, renameSync, writeFileSync, unlinkSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ProductionRunError } from '../contracts/production-run-errors.ts';

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
    throw new ProductionRunError('PRODUCTION_RUN_ATOMIC_WRITE_FAILED', `Failed atomic write: ${path}`, {
      cause: error,
      recovery: 'Retry the mutation',
    });
  }
}

export function writeImmutableJson(path: string, value: unknown): void {
  if (existsSync(path)) {
    // Idempotent: content must match
    const existing = readFileSync(path, 'utf8');
    const next = JSON.stringify(value, null, 2);
    if (existing === next) return;
    throw new ProductionRunError('PRODUCTION_RUN_ATOMIC_WRITE_FAILED', 'Immutable artifact already exists with different content', {
      recovery: 'Use a new artifact hash; do not overwrite immutable artifacts',
    });
  }
  atomicWriteJson(path, value);
}

export function appendJsonl(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
  } catch (error) {
    throw new ProductionRunError('PRODUCTION_RUN_EVENT_WRITE_FAILED', 'Failed to append event journal', {
      cause: error,
      recovery: 'Retry the mutation',
    });
  }
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
