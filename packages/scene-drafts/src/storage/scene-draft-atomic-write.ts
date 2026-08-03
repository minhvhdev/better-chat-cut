import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';

export async function atomicWriteText(path: string, contents: string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, contents, 'utf8');
    await rename(temp, path);
  } catch (error) {
    throw new SceneDraftError('SCENE_DRAFT_ATOMIC_WRITE_FAILED', `Atomic write failed for ${path.split(/[/\\]/).pop()}`, {
      cause: error,
      recovery: 'Retry the operation; previous draft state should remain readable',
    });
  }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}
