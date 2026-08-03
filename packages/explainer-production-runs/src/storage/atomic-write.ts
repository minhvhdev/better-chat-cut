import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ProductionRunError } from '../contracts/production-run-errors.ts';

export const PRODUCTION_RUN_LOCK_TIMEOUT_MS = 10_000;
export const PRODUCTION_RUN_LOCK_POLL_MS = 50;

export async function withProductionRunLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? PRODUCTION_RUN_LOCK_TIMEOUT_MS;
  const pollMs = options?.pollMs ?? PRODUCTION_RUN_LOCK_POLL_MS;
  await mkdir(dirname(lockPath), { recursive: true });
  const started = Date.now();
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  while (!handle) {
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(`${process.pid}\n`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw new ProductionRunError('PRODUCTION_RUN_LOCK_TIMEOUT', 'Failed to acquire run lock', {
          cause: error,
          recovery: 'Retry shortly',
        });
      }
      if (Date.now() - started >= timeoutMs) {
        throw new ProductionRunError('PRODUCTION_RUN_LOCK_TIMEOUT', 'Timed out waiting for production run lock', {
          recovery: 'Retry after concurrent writers finish',
        });
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
  try {
    return await fn();
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}
