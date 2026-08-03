import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneNodeV1, SceneAssetNodeV1 } from '../contracts/scene-node.ts';
import type { SceneDiagnostic } from '../contracts/scene-errors.ts';
import { diagnostic } from '../contracts/scene-errors.ts';
import {
  NODE_ID_PATTERN,
  SCENE_ID_PATTERN,
  SCENE_LIMITS,
  SCENE_SCHEMA_VERSION,
} from '../contracts/scene-document.ts';
import { DEFAULT_SCENE_TRANSFORM } from '../contracts/scene-transform.ts';
import { isJsonSerializable, stableStringify } from './scene-serialization.ts';
import { sortNodesDeterministic } from '../graph/graph-ordering.ts';

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export type SceneNormalizationResult =
  | {
      success: true;
      scene: SceneDocumentV1;
      warnings: SceneDiagnostic[];
    }
  | {
      success: false;
      errors: SceneDiagnostic[];
      warnings: SceneDiagnostic[];
    };

const KNOWN_ROOT_FIELDS = new Set([
  'schemaVersion',
  'id',
  'name',
  'description',
  'canvas',
  'fps',
  'durationInFrames',
  'theme',
  'safeArea',
  'nodes',
]);

const KNOWN_NODE_FIELDS = new Set([
  'id',
  'type',
  'parentId',
  'order',
  'enabled',
  'startFrame',
  'endFrame',
  'layout',
  'transform',
  'animations',
  'metadata',
  'asset',
  'fit',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Normalize a scene document without mutating input.
 * Applies defaults, sorts nodes deterministically, validates serializability.
 */
export function normalizeSceneDocument(input: unknown): SceneNormalizationResult {
  const errors: SceneDiagnostic[] = [];
  const warnings: SceneDiagnostic[] = [];

  if (!isJsonSerializable(input)) {
    return {
      success: false,
      errors: [diagnostic('error', 'SCENE_NON_SERIALIZABLE', 'Scene must be JSON-serializable', {
        recovery: 'Remove functions, symbols, NaN, Infinity, and cyclic references',
      })],
      warnings,
    };
  }

  const serialized = stableStringify(input);
  if (utf8ByteLength(serialized) > SCENE_LIMITS.MAX_SERIALIZED_BYTES) {
    return {
      success: false,
      errors: [diagnostic('error', 'SCENE_DOCUMENT_TOO_LARGE', `Scene exceeds ${SCENE_LIMITS.MAX_SERIALIZED_BYTES} bytes`, {
        recovery: 'Reduce node count or props size',
      })],
      warnings,
    };
  }

  if (!isPlainObject(input)) {
    return {
      success: false,
      errors: [diagnostic('error', 'SCENE_SCHEMA_UNSUPPORTED', 'Scene must be an object')],
      warnings,
    };
  }

  for (const key of Object.keys(input)) {
    if (!KNOWN_ROOT_FIELDS.has(key)) {
      errors.push(diagnostic('error', 'SCENE_UNKNOWN_FIELD', `Unknown field "${key}"`, { path: key }));
    }
  }

  if (input.schemaVersion !== SCENE_SCHEMA_VERSION) {
    errors.push(diagnostic('error', 'SCENE_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion (expected ${SCENE_SCHEMA_VERSION})`, {
      path: 'schemaVersion',
      recovery: `Set schemaVersion to "${SCENE_SCHEMA_VERSION}"`,
    }));
  }

  if (typeof input.id !== 'string' || !SCENE_ID_PATTERN.test(input.id)) {
    errors.push(diagnostic('error', 'SCENE_INVALID_ID', 'Invalid scene id', {
      path: 'id',
      recovery: 'Use lowercase ids like scene.hawking-intro',
    }));
  }

  if (typeof input.name !== 'string' || !input.name.trim()) {
    errors.push(diagnostic('error', 'SCENE_SCHEMA_UNSUPPORTED', 'name is required', { path: 'name' }));
  }

  if (!isPlainObject(input.canvas)) {
    errors.push(diagnostic('error', 'SCENE_INVALID_LAYOUT', 'canvas is required', { path: 'canvas' }));
  }

  if (!isPlainObject(input.theme)
    || typeof input.theme.id !== 'string'
    || typeof input.theme.version !== 'string') {
    errors.push(diagnostic('error', 'SCENE_THEME_NOT_FOUND', 'theme.id and theme.version are required', {
      path: 'theme',
      recovery: 'Pin exact theme id and version',
    }));
  }

  if (!finiteNumber(input.fps)
    || input.fps < SCENE_LIMITS.MIN_FPS
    || input.fps > SCENE_LIMITS.MAX_FPS) {
    errors.push(diagnostic('error', 'SCENE_INVALID_NUMBER', `fps must be ${SCENE_LIMITS.MIN_FPS}..${SCENE_LIMITS.MAX_FPS}`, {
      path: 'fps',
    }));
  }

  if (!finiteNumber(input.durationInFrames)
    || !Number.isInteger(input.durationInFrames)
    || input.durationInFrames < SCENE_LIMITS.MIN_DURATION_FRAMES
    || input.durationInFrames > SCENE_LIMITS.MAX_DURATION_FRAMES) {
    errors.push(diagnostic('error', 'SCENE_INVALID_TIMING', `durationInFrames must be ${SCENE_LIMITS.MIN_DURATION_FRAMES}..${SCENE_LIMITS.MAX_DURATION_FRAMES}`, {
      path: 'durationInFrames',
    }));
  }

  if (!Array.isArray(input.nodes)) {
    errors.push(diagnostic('error', 'SCENE_SCHEMA_UNSUPPORTED', 'nodes must be an array', { path: 'nodes' }));
  } else if (input.nodes.length > SCENE_LIMITS.MAX_NODES) {
    errors.push(diagnostic('error', 'SCENE_TOO_MANY_NODES', `At most ${SCENE_LIMITS.MAX_NODES} nodes`, {
      path: 'nodes',
    }));
  }

  if (errors.length) {
    return { success: false, errors, warnings };
  }

  const canvas = input.canvas as Record<string, unknown>;
  const width = canvas.width;
  const height = canvas.height;
  const backgroundColor = canvas.backgroundColor;
  if (!finiteNumber(width) || width < SCENE_LIMITS.MIN_CANVAS_WIDTH || width > SCENE_LIMITS.MAX_CANVAS_WIDTH) {
    errors.push(diagnostic('error', 'SCENE_INVALID_LAYOUT', `canvas.width must be ${SCENE_LIMITS.MIN_CANVAS_WIDTH}..${SCENE_LIMITS.MAX_CANVAS_WIDTH}`, {
      path: 'canvas.width',
    }));
  }
  if (!finiteNumber(height) || height < SCENE_LIMITS.MIN_CANVAS_HEIGHT || height > SCENE_LIMITS.MAX_CANVAS_HEIGHT) {
    errors.push(diagnostic('error', 'SCENE_INVALID_LAYOUT', `canvas.height must be ${SCENE_LIMITS.MIN_CANVAS_HEIGHT}..${SCENE_LIMITS.MAX_CANVAS_HEIGHT}`, {
      path: 'canvas.height',
    }));
  }
  if (typeof backgroundColor !== 'string' || !backgroundColor.trim()) {
    errors.push(diagnostic('error', 'SCENE_INVALID_LAYOUT', 'canvas.backgroundColor is required', {
      path: 'canvas.backgroundColor',
    }));
  }

  const nodesRaw = input.nodes as unknown[];
  const normalizedNodes: SceneNodeV1[] = [];

  for (let index = 0; index < nodesRaw.length; index += 1) {
    const raw = nodesRaw[index];
    if (!isPlainObject(raw)) {
      errors.push(diagnostic('error', 'SCENE_INVALID_NODE_TYPE', 'Node must be an object', {
        path: `nodes[${index}]`,
      }));
      continue;
    }
    for (const key of Object.keys(raw)) {
      if (!KNOWN_NODE_FIELDS.has(key)) {
        errors.push(diagnostic('error', 'SCENE_UNKNOWN_FIELD', `Unknown node field "${key}"`, {
          path: `nodes[${index}].${key}`,
          nodeId: typeof raw.id === 'string' ? raw.id : undefined,
        }));
      }
    }
    if (typeof raw.id !== 'string' || !NODE_ID_PATTERN.test(raw.id)) {
      errors.push(diagnostic('error', 'SCENE_INVALID_ID', 'Invalid node id', {
        path: `nodes[${index}].id`,
        recovery: 'Use ids like background or particle-01',
      }));
      continue;
    }
    const nodeId = raw.id;
    if (raw.type !== 'group' && raw.type !== 'asset') {
      errors.push(diagnostic('error', 'SCENE_INVALID_NODE_TYPE', 'Node type must be group or asset', {
        path: `nodes[${index}].type`,
        nodeId,
      }));
      continue;
    }
    if (!finiteNumber(raw.order) || !Number.isInteger(raw.order)) {
      errors.push(diagnostic('error', 'SCENE_INVALID_NUMBER', 'order must be an integer', {
        path: `nodes[${index}].order`,
        nodeId,
      }));
      continue;
    }
    if (!finiteNumber(raw.startFrame) || !Number.isInteger(raw.startFrame)
      || !finiteNumber(raw.endFrame) || !Number.isInteger(raw.endFrame)) {
      errors.push(diagnostic('error', 'SCENE_INVALID_TIMING', 'startFrame/endFrame must be integers', {
        path: `nodes[${index}]`,
        nodeId,
      }));
      continue;
    }
    if (!isPlainObject(raw.layout)
      || !finiteNumber(raw.layout.x)
      || !finiteNumber(raw.layout.y)
      || !finiteNumber(raw.layout.width)
      || !finiteNumber(raw.layout.height)
      || raw.layout.width <= 0
      || raw.layout.height <= 0) {
      errors.push(diagnostic('error', 'SCENE_INVALID_LAYOUT', 'layout requires finite x/y and positive width/height', {
        path: `nodes[${index}].layout`,
        nodeId,
      }));
      continue;
    }

    const transformIn = isPlainObject(raw.transform) ? raw.transform : {};
    const transform = {
      anchorX: typeof transformIn.anchorX === 'number' ? transformIn.anchorX : DEFAULT_SCENE_TRANSFORM.anchorX,
      anchorY: typeof transformIn.anchorY === 'number' ? transformIn.anchorY : DEFAULT_SCENE_TRANSFORM.anchorY,
      scaleX: typeof transformIn.scaleX === 'number' ? transformIn.scaleX : DEFAULT_SCENE_TRANSFORM.scaleX,
      scaleY: typeof transformIn.scaleY === 'number' ? transformIn.scaleY : DEFAULT_SCENE_TRANSFORM.scaleY,
      rotation: typeof transformIn.rotation === 'number' ? transformIn.rotation : DEFAULT_SCENE_TRANSFORM.rotation,
      opacity: typeof transformIn.opacity === 'number' ? transformIn.opacity : DEFAULT_SCENE_TRANSFORM.opacity,
    };

    const animations = Array.isArray(raw.animations) ? raw.animations : [];
    if (animations.length > SCENE_LIMITS.MAX_ANIMATIONS_PER_NODE) {
      errors.push(diagnostic('error', 'SCENE_TOO_MANY_NODES', `At most ${SCENE_LIMITS.MAX_ANIMATIONS_PER_NODE} animations per node`, {
        path: `nodes[${index}].animations`,
        nodeId,
      }));
    }

    const base = {
      id: nodeId,
      parentId: typeof raw.parentId === 'string' ? raw.parentId : undefined,
      order: raw.order,
      enabled: raw.enabled === false ? false : true,
      startFrame: raw.startFrame,
      endFrame: raw.endFrame,
      layout: {
        x: raw.layout.x,
        y: raw.layout.y,
        width: raw.layout.width,
        height: raw.layout.height,
      },
      transform,
      animations: animations.map((anim, animIndex) => {
        if (!isPlainObject(anim)) return null;
        if (!isPlainObject(anim.animation)
          || typeof anim.animation.id !== 'string'
          || typeof anim.animation.version !== 'string') {
          errors.push(diagnostic('error', 'SCENE_ANIMATION_NOT_FOUND', 'animation.id and animation.version required', {
            path: `nodes[${index}].animations[${animIndex}]`,
            nodeId,
          }));
          return null;
        }
        return {
          id: typeof anim.id === 'string' ? anim.id : `anim-${animIndex}`,
          animation: {
            id: anim.animation.id as string,
            version: anim.animation.version as string,
          },
          startFrame: typeof anim.startFrame === 'number' ? anim.startFrame : 0,
          durationInFrames: typeof anim.durationInFrames === 'number' ? anim.durationInFrames : 1,
          params: isPlainObject(anim.params) ? anim.params : undefined,
        };
      }).filter(Boolean) as SceneNodeV1['animations'],
      metadata: isPlainObject(raw.metadata)
        ? {
            role: typeof raw.metadata.role === 'string' ? raw.metadata.role : undefined,
            label: typeof raw.metadata.label === 'string' ? raw.metadata.label : undefined,
          }
        : undefined,
    };

    if (raw.type === 'group') {
      if (raw.asset !== undefined || raw.fit !== undefined) {
        errors.push(diagnostic('error', 'SCENE_INVALID_NODE_TYPE', 'Group nodes cannot have asset or fit', {
          path: `nodes[${index}]`,
          nodeId,
        }));
      }
      normalizedNodes.push({ ...base, type: 'group' });
    } else {
      if (!isPlainObject(raw.asset)
        || typeof raw.asset.id !== 'string'
        || typeof raw.asset.version !== 'string') {
        errors.push(diagnostic('error', 'SCENE_ASSET_NOT_FOUND', 'asset.id and asset.version are required', {
          path: `nodes[${index}].asset`,
          nodeId,
          recovery: 'Pin exact asset id and version',
        }));
        continue;
      }
      const props = isPlainObject(raw.asset.props) ? raw.asset.props : undefined;
      if (props) {
        const propsBytes = utf8ByteLength(stableStringify(props));
        if (propsBytes > SCENE_LIMITS.MAX_PROPS_SERIALIZED_BYTES) {
          errors.push(diagnostic('error', 'SCENE_INVALID_PROPS', `Props exceed ${SCENE_LIMITS.MAX_PROPS_SERIALIZED_BYTES} bytes`, {
            path: `nodes[${index}].asset.props`,
            nodeId,
          }));
        }
      }
      const fit = raw.fit === 'cover' || raw.fit === 'stretch' || raw.fit === 'contain'
        ? raw.fit
        : 'contain';
      const assetNode: SceneAssetNodeV1 = {
        ...base,
        type: 'asset',
        asset: {
          id: raw.asset.id,
          version: raw.asset.version,
          props,
        },
        fit,
      };
      normalizedNodes.push(assetNode);
    }
  }

  if (errors.length) {
    return { success: false, errors, warnings };
  }

  let safeArea: SceneDocumentV1['safeArea'];
  if (input.safeArea !== undefined) {
    if (!isPlainObject(input.safeArea)
      || !finiteNumber(input.safeArea.top)
      || !finiteNumber(input.safeArea.right)
      || !finiteNumber(input.safeArea.bottom)
      || !finiteNumber(input.safeArea.left)) {
      errors.push(diagnostic('error', 'SCENE_INVALID_LAYOUT', 'safeArea requires top/right/bottom/left numbers', {
        path: 'safeArea',
      }));
      return { success: false, errors, warnings };
    }
    safeArea = {
      top: input.safeArea.top,
      right: input.safeArea.right,
      bottom: input.safeArea.bottom,
      left: input.safeArea.left,
    };
  }

  const scene: SceneDocumentV1 = {
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: input.id as string,
    name: (input.name as string).trim(),
    description: typeof input.description === 'string' ? input.description : undefined,
    canvas: {
      width: width as number,
      height: height as number,
      backgroundColor: backgroundColor as string,
    },
    fps: input.fps as number,
    durationInFrames: input.durationInFrames as number,
    theme: {
      id: (input.theme as { id: string }).id,
      version: (input.theme as { version: string }).version,
    },
    safeArea,
    nodes: sortNodesDeterministic(normalizedNodes),
  };

  return { success: true, scene, warnings };
}
