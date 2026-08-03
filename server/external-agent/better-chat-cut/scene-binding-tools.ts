import {
  createSceneDraftService,
  resolveSceneDraftRoot,
} from '../../../packages/scene-drafts/src/index.ts';
import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
  SCENE_CLIP_BINDING_SCHEMA_VERSION,
  SceneClipError,
  createSceneDraftBindingService,
} from '../../../packages/project-scene-bindings/src/index.ts';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const SCENE_BINDING_TOOLS = [
  {
    name: 'scene_binding_get_contract',
    description: 'Return Better Chat Cut SceneClipBindingV1 contract: reserved template id, props key, embedded snapshot, frame mapping, sync policies, edit-session workflow. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['summary', 'full'] },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'scene_draft_get_binding_payload',
    description: 'Generate a portable SceneClipBindingV1 payload from a persistent scene draft. Read-only; does not mutate drafts or projects.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        draftId: { type: 'string', minLength: 1, maxLength: 128 },
        historyEntryId: { type: 'string', minLength: 1, maxLength: 128 },
      },
      required: ['draftId'],
    },
    annotations: readOnly,
  },
] as const;

function getContract(format: 'summary' | 'full' = 'summary') {
  const summary = {
    schemaVersion: SCENE_CLIP_BINDING_SCHEMA_VERSION,
    templateId: BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
    reservedPropsKey: BETTER_CHAT_CUT_SCENE_PROPS_KEY,
    bindingMode: 'embedded-snapshot',
    playbackAuthority: 'embedded SceneDocumentV1 snapshot',
    projectSchemaChanged: false,
    editSessionRequired: [
      'scene_clip_list',
      'scene_clip_get',
      'scene_clip_compare',
      'scene_clip_bind',
      'scene_clip_sync',
      'scene_clip_validate',
    ],
    controlTools: ['scene_binding_get_contract', 'scene_draft_get_binding_payload'],
  };
  if (format === 'summary') return summary;
  return {
    ...summary,
    durationConversion: 'ceil(sceneDurationInFrames / sceneFps * timelineFps), min 1',
    frameMapping: 'floor((srcInFrame + itemLocalFrame) * sceneFps / timelineFps) clamped to scene',
    syncPolicies: {
      timingPolicy: ['preserve-timeline', 'match-scene'],
      namePolicy: ['preserve', 'match-draft'],
    },
    workflow: {
      bind: [
        'scene_draft_get_binding_payload',
        'target_project',
        'begin_edit_session',
        'scene_clip_bind',
        'review_edit_session',
        'get_edit_session until applied',
      ],
      sync: [
        'scene_clip_get',
        'scene_draft_get_binding_payload',
        'begin_edit_session',
        'scene_clip_compare',
        'scene_clip_sync',
        'review_edit_session',
      ],
    },
    limitations: [
      'No multi-scene automatic assembly',
      'No auto-sync watcher',
      'No rebind to a different draft',
      'Active timeline only for bind',
    ],
  };
}

let bindingService: ReturnType<typeof createSceneDraftBindingService> | null = null;

function getBindingService() {
  if (!bindingService) {
    const store = createSceneDraftService({ root: resolveSceneDraftRoot() });
    bindingService = createSceneDraftBindingService(store);
  }
  return bindingService;
}

export async function runSceneBindingTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'scene_binding_get_contract') {
    return getContract(args.format === 'full' ? 'full' : 'summary');
  }
  if (name === 'scene_draft_get_binding_payload') {
    return getBindingService().createBindingPayload({
      draftId: String(args.draftId ?? ''),
      historyEntryId: typeof args.historyEntryId === 'string' ? args.historyEntryId : undefined,
    });
  }
  throw new SceneClipError('SCENE_CLIP_NOT_FOUND', `Unknown scene binding tool ${name}`, {
    recovery: 'Use scene_binding_get_contract',
  });
}
