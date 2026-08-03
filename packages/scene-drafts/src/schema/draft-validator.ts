import {
  DRAFT_ID_PATTERN,
  REQUEST_ID_PATTERN,
  type CreateSceneDraftInput,
} from '../contracts/scene-draft.ts';
import { SceneDraftError, draftDiagnostic } from '../contracts/scene-draft-errors.ts';

export function assertSafeDraftId(draftId: unknown): string {
  if (typeof draftId !== 'string' || !DRAFT_ID_PATTERN.test(draftId)) {
    throw new SceneDraftError(
      'SCENE_DRAFT_INVALID_ID',
      `Invalid draftId: ${String(draftId)}`,
      { recovery: 'Use lowercase alphanumerics with optional . or - separators' },
    );
  }
  if (draftId.includes('..') || draftId.includes('/') || draftId.includes('\\')) {
    throw new SceneDraftError(
      'SCENE_DRAFT_INVALID_ID',
      'draftId must not contain path separators',
      { recovery: 'Pass a logical draft id only' },
    );
  }
  return draftId;
}

export function assertSafeRequestId(requestId: unknown): string {
  if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new SceneDraftError(
      'SCENE_DRAFT_INVALID_ID',
      `Invalid requestId: ${String(requestId)}`,
      { recovery: 'Use a safe requestId without path separators (1..128 chars)' },
    );
  }
  if (requestId.includes('..') || requestId.includes('/') || requestId.includes('\\')) {
    throw new SceneDraftError(
      'SCENE_DRAFT_INVALID_ID',
      'requestId must not contain path separators',
      { recovery: 'Pass a logical request id only' },
    );
  }
  return requestId;
}

export function validateCreateDraftInput(input: CreateSceneDraftInput): {
  draftId: string;
  requestId: string;
  name: string;
  description?: string;
} {
  const draftId = assertSafeDraftId(input.draftId);
  const requestId = assertSafeRequestId(input.requestId);
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new SceneDraftError('SCENE_DRAFT_INVALID_ID', 'name is required', {
      recovery: 'Provide a non-empty draft name',
      diagnostics: [draftDiagnostic('error', 'SCENE_DRAFT_INVALID_ID', 'name is required')],
    });
  }
  return {
    draftId,
    requestId,
    name: input.name.trim(),
    description: typeof input.description === 'string' ? input.description : undefined,
  };
}
