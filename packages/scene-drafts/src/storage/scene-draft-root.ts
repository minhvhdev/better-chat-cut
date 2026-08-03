import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';

export function resolveSceneDraftRoot(cwd = process.cwd()): string {
  const override = process.env.BETTER_CHAT_CUT_SCENE_DRAFT_ROOT?.trim();
  if (override) {
    // Absolute or ~/ — never depend on cwd for default; env override may be relative to cwd.
    if (override.startsWith('~/') || override === '~') {
      return resolve(join(homedir(), override.slice(2)));
    }
    return resolve(cwd, override);
  }
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'scene-drafts');
}

export function assertSceneDraftRootAvailable(root: string): string {
  if (!root || typeof root !== 'string') {
    throw new SceneDraftError('SCENE_DRAFT_ROOT_UNAVAILABLE', 'Scene draft root is unavailable', {
      recovery: 'Set BETTER_CHAT_CUT_SCENE_DRAFT_ROOT or ensure home directory is writable',
    });
  }
  return root;
}
