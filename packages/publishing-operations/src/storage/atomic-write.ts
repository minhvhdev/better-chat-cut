import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PublishingOperationError } from '../contracts/publishing-operation-errors.ts';

export const PUBLISHING_LOCK_TIMEOUT_MS = 10_000;
export const PUBLISHING_LOCK_POLL_MS = 50;

export async function withPublishingRunLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? PUBLISHING_LOCK_TIMEOUT_MS;
  const pollMs = options?.pollMs ?? PUBLISHING_LOCK_POLL_MS;
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
        throw new PublishingOperationError('PUBLISHING_RUN_LOCK_TIMEOUT', 'Failed to acquire publishing run lock', {
          cause: error,
        });
      }
      if (Date.now() - started >= timeoutMs) {
        throw new PublishingOperationError('PUBLISHING_RUN_LOCK_TIMEOUT', 'Timed out waiting for publishing run lock');
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
