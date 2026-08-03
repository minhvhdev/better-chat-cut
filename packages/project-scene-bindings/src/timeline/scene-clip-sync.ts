import type { SceneClipBindingV1 } from '../contracts/scene-clip-binding.ts';
import type { SceneClipComparisonResult, SceneClipSyncStatus } from '../contracts/scene-clip-status.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import { sceneClipDiagnostic } from '../contracts/scene-clip-errors.ts';
import { parseSceneClipBinding } from '../schema/scene-clip-props-validator.ts';

export function compareSceneClipWithBinding(input: {
  item: SceneClipTimelineItemLike;
  currentDraftBinding?: SceneClipBindingV1;
}): SceneClipComparisonResult {
  const parsed = parseSceneClipBinding(input.item);
  if (!parsed.binding) {
    return {
      status: 'binding-invalid',
      itemId: input.item.id,
      diagnostics: parsed.errors,
    };
  }

  const clip = parsed.binding;
  if (!input.currentDraftBinding) {
    return {
      status: 'source-unavailable',
      itemId: input.item.id,
      clipBindingHash: clip.bindingPayloadHash,
      clipDraftRevision: clip.sourceDraft.draftRevision,
      clipSceneContentHash: clip.sceneContentHash,
      diagnostics: [
        ...parsed.warnings,
        sceneClipDiagnostic('info', 'SCENE_CLIP_SOURCE_UNAVAILABLE', 'No current draft binding provided for comparison', {
          itemId: input.item.id,
          recovery: 'Pass currentDraftBinding from scene_draft_get_binding_payload',
        }),
      ],
    };
  }

  const source = input.currentDraftBinding;
  if (source.sourceDraft.draftId !== clip.sourceDraft.draftId) {
    return {
      status: 'detached-snapshot',
      itemId: input.item.id,
      clipBindingHash: clip.bindingPayloadHash,
      sourceBindingHash: source.bindingPayloadHash,
      clipDraftRevision: clip.sourceDraft.draftRevision,
      sourceDraftRevision: source.sourceDraft.draftRevision,
      clipSceneContentHash: clip.sceneContentHash,
      sourceSceneContentHash: source.sceneContentHash,
      diagnostics: [
        sceneClipDiagnostic('error', 'SCENE_CLIP_SOURCE_DRAFT_MISMATCH', 'Source draft id differs from clip binding', {
          itemId: input.item.id,
          draftId: source.sourceDraft.draftId,
          recovery: 'M4B sync does not rebind to a different draft',
        }),
      ],
    };
  }

  let status: SceneClipSyncStatus = 'synced';
  if (source.bindingPayloadHash === clip.bindingPayloadHash
    && source.sceneContentHash === clip.sceneContentHash
    && source.sourceDraft.draftRevision === clip.sourceDraft.draftRevision) {
    status = 'synced';
  } else if (source.sourceDraft.draftRevision > clip.sourceDraft.draftRevision
    || (source.sourceDraft.draftRevision === clip.sourceDraft.draftRevision
      && source.sceneContentHash !== clip.sceneContentHash)) {
    status = 'source-newer';
  } else if (source.sourceDraft.draftRevision < clip.sourceDraft.draftRevision) {
    status = 'source-older';
  } else {
    status = 'source-newer';
  }

  return {
    status,
    itemId: input.item.id,
    clipBindingHash: clip.bindingPayloadHash,
    sourceBindingHash: source.bindingPayloadHash,
    clipDraftRevision: clip.sourceDraft.draftRevision,
    sourceDraftRevision: source.sourceDraft.draftRevision,
    clipSceneContentHash: clip.sceneContentHash,
    sourceSceneContentHash: source.sceneContentHash,
    diagnostics: parsed.warnings,
  };
}
