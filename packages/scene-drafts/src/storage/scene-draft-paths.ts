import { realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';
import { assertSafeDraftId, assertSafeRequestId } from '../schema/draft-validator.ts';

export function ensureInsideRoot(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const rootWithSep = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(rootWithSep)) {
    throw new SceneDraftError('SCENE_DRAFT_INVALID_ID', 'Resolved path escapes scene draft root', {
      recovery: 'Do not pass filesystem paths; use draftId only',
    });
  }
  try {
    const realRoot = realpathSync(resolvedRoot);
    let probe = resolvedCandidate;
    while (true) {
      try {
        const realProbe = realpathSync(probe);
        const realRootSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
        if (realProbe !== realRoot && !realProbe.startsWith(realRootSep)) {
          throw new SceneDraftError('SCENE_DRAFT_INVALID_ID', 'Symlink escape outside scene draft root');
        }
        break;
      } catch (error) {
        if (error instanceof SceneDraftError) throw error;
        const parent = dirname(probe);
        if (parent === probe) break;
        probe = parent;
      }
    }
  } catch (error) {
    if (error instanceof SceneDraftError) throw error;
  }
  return resolvedCandidate;
}

export type SceneDraftPaths = {
  root: string;
  draftDir: string;
  draftJson: string;
  revisionsDir: string;
  operationsDir: string;
  eventsJsonl: string;
  lockFile: string;
  revisionFile: (entryId: string) => string;
  receiptFile: (requestId: string) => string;
};

export function resolveSceneDraftPaths(root: string, draftId: string): SceneDraftPaths {
  const safeId = assertSafeDraftId(draftId);
  const draftDir = ensureInsideRoot(root, join(root, safeId));
  return {
    root,
    draftDir,
    draftJson: join(draftDir, 'draft.json'),
    revisionsDir: join(draftDir, 'revisions'),
    operationsDir: join(draftDir, 'operations'),
    eventsJsonl: join(draftDir, 'events.jsonl'),
    lockFile: join(draftDir, 'draft.lock'),
    revisionFile: (entryId: string) => {
      if (!/^[a-f0-9]{16,128}$/.test(entryId) && !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(entryId)) {
        throw new SceneDraftError('SCENE_DRAFT_HISTORY_ENTRY_NOT_FOUND', `Unsafe history entry id ${entryId}`);
      }
      return ensureInsideRoot(root, join(draftDir, 'revisions', `${entryId}.scene.json`));
    },
    receiptFile: (requestId: string) => {
      const safe = assertSafeRequestId(requestId);
      return ensureInsideRoot(root, join(draftDir, 'operations', `${safe}.json`));
    },
  };
}
