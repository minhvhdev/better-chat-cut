import { readFile } from 'node:fs/promises';
import type { SceneDraftHistoryEntryV1 } from '../contracts/scene-draft-history.ts';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';
import { computeInputHash } from '../schema/patch-serialization.ts';
import { atomicWriteJson } from './scene-draft-atomic-write.ts';
import type { SceneDraftPaths } from './scene-draft-paths.ts';

export function computeHistoryEntryId(input: {
  sceneContentHash: string;
  operationInputHash: string;
  previousEntryId: string | null;
}): string {
  return computeInputHash({
    sceneContentHash: input.sceneContentHash,
    operationInputHash: input.operationInputHash,
    previousEntryId: input.previousEntryId,
  }).slice(0, 32);
}

export async function writeHistoryEntry(
  paths: SceneDraftPaths,
  entry: SceneDraftHistoryEntryV1,
): Promise<void> {
  await atomicWriteJson(paths.revisionFile(entry.entryId), entry);
}

export async function readHistoryEntry(
  paths: SceneDraftPaths,
  entryId: string,
): Promise<SceneDraftHistoryEntryV1> {
  try {
    const raw = await readFile(paths.revisionFile(entryId), 'utf8');
    return JSON.parse(raw) as SceneDraftHistoryEntryV1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SceneDraftError(
        'SCENE_DRAFT_HISTORY_ENTRY_NOT_FOUND',
        `History entry ${entryId} not found`,
        { recovery: 'Call scene_draft_get and use an active history entry id' },
      );
    }
    throw error;
  }
}
