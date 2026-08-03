import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  SCENE_DRAFT_LOCK_POLL_MS,
  SCENE_DRAFT_LOCK_TIMEOUT_MS,
} from '../contracts/scene-draft.ts';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';

export async function withSceneDraftLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? SCENE_DRAFT_LOCK_TIMEOUT_MS;
  const pollMs = options?.pollMs ?? SCENE_DRAFT_LOCK_POLL_MS;
  await mkdir(dirname(lockPath), { recursive: true });
  const started = Date.now();
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  while (!handle) {
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw new SceneDraftError('SCENE_DRAFT_LOCK_TIMEOUT', 'Failed to acquire draft lock', {
          cause: error,
          recovery: 'Retry shortly',
        });
      }
      if (Date.now() - started >= timeoutMs) {
        throw new SceneDraftError('SCENE_DRAFT_LOCK_TIMEOUT', 'Timed out waiting for draft lock', {
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
