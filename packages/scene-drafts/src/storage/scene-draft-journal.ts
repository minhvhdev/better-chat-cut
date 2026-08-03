import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SceneDraftEventV1 } from '../contracts/scene-draft-event.ts';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';

export async function appendSceneDraftEvent(eventsPath: string, event: SceneDraftEventV1): Promise<void> {
  try {
    await mkdir(dirname(eventsPath), { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (error) {
    throw new SceneDraftError('SCENE_DRAFT_JOURNAL_WRITE_FAILED', 'Failed to append audit journal event', {
      cause: error,
      recovery: 'Retry the operation; draft metadata may not have advanced',
    });
  }
}
