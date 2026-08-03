import { access, readFile } from 'node:fs/promises';
import type { SceneDraftOperationReceiptV1 } from '../contracts/scene-draft-receipt.ts';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';
import { atomicWriteJson } from './scene-draft-atomic-write.ts';
import type { SceneDraftPaths } from './scene-draft-paths.ts';

export async function readReceipt(
  paths: SceneDraftPaths,
  requestId: string,
): Promise<SceneDraftOperationReceiptV1 | undefined> {
  try {
    const raw = await readFile(paths.receiptFile(requestId), 'utf8');
    return JSON.parse(raw) as SceneDraftOperationReceiptV1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeReceipt(
  paths: SceneDraftPaths,
  receipt: SceneDraftOperationReceiptV1,
): Promise<void> {
  try {
    await atomicWriteJson(paths.receiptFile(receipt.requestId), receipt);
  } catch (error) {
    if (error instanceof SceneDraftError) {
      throw new SceneDraftError('SCENE_DRAFT_RECEIPT_WRITE_FAILED', error.message, {
        cause: error,
        recovery: error.recovery,
      });
    }
    throw new SceneDraftError('SCENE_DRAFT_RECEIPT_WRITE_FAILED', 'Failed to write operation receipt', {
      cause: error,
      recovery: 'Retry the operation',
    });
  }
}

export async function assertReceiptReplayOrConflict(
  paths: SceneDraftPaths,
  requestId: string,
  inputHash: string,
): Promise<SceneDraftOperationReceiptV1 | undefined> {
  const existing = await readReceipt(paths, requestId);
  if (!existing) return undefined;
  if (existing.inputHash !== inputHash) {
    throw new SceneDraftError(
      'SCENE_DRAFT_REQUEST_ID_REUSE_CONFLICT',
      'requestId was reused with different input',
      {
        recovery: 'Use a new requestId or replay the original identical request',
        details: { requestId },
      },
    );
  }
  return existing;
}

export async function receiptExists(paths: SceneDraftPaths, requestId: string): Promise<boolean> {
  try {
    await access(paths.receiptFile(requestId));
    return true;
  } catch {
    return false;
  }
}
