import { mkdirSync, renameSync, existsSync, rmSync, cpSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { ProductionRenderError } from '../../../production-render-plans/src/contracts/production-render-errors.ts';
import { assertPathInsideRoot } from './delivery-paths.ts';

export function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  try {
    renameSync(tmp, path);
  } catch {
    try { unlinkSync(path); } catch { /* ignore */ }
    renameSync(tmp, path);
  }
}

export function atomicFinalizeBundle(input: {
  deliveryRoot: string;
  stagingDir: string;
  finalDir: string;
}): void {
  assertPathInsideRoot(input.deliveryRoot, input.stagingDir);
  assertPathInsideRoot(input.deliveryRoot, input.finalDir);
  if (existsSync(input.finalDir)) {
    throw new ProductionRenderError('PRODUCTION_RENDER_BUNDLE_ALREADY_EXISTS', 'Completed bundle already exists', {
      recovery: 'Reuse the completed bundle or prepare a new plan hash',
    });
  }
  mkdirSync(dirname(input.finalDir), { recursive: true });
  try {
    renameSync(input.stagingDir, input.finalDir);
  } catch {
    try {
      cpSync(input.stagingDir, input.finalDir, { recursive: true });
      rmSync(input.stagingDir, { recursive: true, force: true });
    } catch (error) {
      try { rmSync(input.finalDir, { recursive: true, force: true }); } catch { /* ignore */ }
      throw new ProductionRenderError('PRODUCTION_RENDER_ATOMIC_FINALIZE_FAILED', 'Failed to finalize delivery bundle', {
        cause: error,
        recovery: 'Retry the operation; temporary artifacts remain under the operation directory',
      });
    }
  }
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}
