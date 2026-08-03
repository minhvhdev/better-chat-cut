/** Invalid scene fixtures for schema/graph validation tests. */

export const INVALID_DUPLICATE_NODE_ID = {
  schemaVersion: '1.0.0',
  id: 'scene.invalid-dup',
  name: 'dup',
  canvas: { width: 640, height: 360, backgroundColor: '#000' },
  fps: 30,
  durationInFrames: 30,
  theme: { id: 'default', version: '1.0.0' },
  nodes: [
    {
      id: 'a',
      type: 'group',
      order: 0,
      startFrame: 0,
      endFrame: 30,
      layout: { x: 0, y: 0, width: 100, height: 100 },
    },
    {
      id: 'a',
      type: 'group',
      order: 1,
      startFrame: 0,
      endFrame: 30,
      layout: { x: 10, y: 10, width: 100, height: 100 },
    },
  ],
};

export const INVALID_MISSING_PARENT = {
  schemaVersion: '1.0.0',
  id: 'scene.invalid-parent',
  name: 'missing parent',
  canvas: { width: 640, height: 360, backgroundColor: '#000' },
  fps: 30,
  durationInFrames: 30,
  theme: { id: 'default', version: '1.0.0' },
  nodes: [
    {
      id: 'child',
      type: 'asset',
      parentId: 'missing',
      order: 0,
      startFrame: 0,
      endFrame: 30,
      layout: { x: 0, y: 0, width: 100, height: 100 },
      asset: { id: 'primitive.circle', version: '1.0.0' },
    },
  ],
};

export const INVALID_UNKNOWN_FIELD = {
  schemaVersion: '1.0.0',
  id: 'scene.invalid-field',
  name: 'unknown',
  canvas: { width: 640, height: 360, backgroundColor: '#000' },
  fps: 30,
  durationInFrames: 30,
  theme: { id: 'default', version: '1.0.0' },
  unexpected: true,
  nodes: [],
};
