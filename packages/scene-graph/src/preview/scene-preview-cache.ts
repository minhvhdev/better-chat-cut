import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex } from '../schema/scene-hash.ts';

export function scenePreviewCacheDir(): string {
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'scene-preview-cache');
}

export function buildScenePreviewCacheKey(parts: Record<string, unknown>): string {
  return sha256Hex(JSON.stringify(parts));
}

export async function readScenePreviewCache(cacheKey: string): Promise<Buffer | null> {
  try {
    const path = join(scenePreviewCacheDir(), `${cacheKey}.png`);
    const buffer = await readFile(path);
    // Basic PNG signature check
    if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50) return null;
    return buffer;
  } catch {
    return null;
  }
}

export async function writeScenePreviewCache(cacheKey: string, buffer: Buffer): Promise<void> {
  const dir = scenePreviewCacheDir();
  await mkdir(dir, { recursive: true });
  const finalPath = join(dir, `${cacheKey}.png`);
  const tempPath = join(dir, `${cacheKey}.${process.pid}.tmp`);
  await writeFile(tempPath, buffer);
  await rename(tempPath, finalPath);
}
