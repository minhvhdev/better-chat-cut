import type { SceneDocumentV1, SceneNodeV1 } from '../../../scene-graph/src/index.ts';
import type { SceneChangeSummaryV1 } from '../contracts/scene-change-summary.ts';
import { stableStringify } from '../schema/patch-serialization.ts';

function sortStrings(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assetKey(node: Extract<SceneNodeV1, { type: 'asset' }>): { id: string; version: string } {
  return { id: node.asset.id, version: node.asset.version };
}

export function computeSceneChangeSummary(input: {
  previous: SceneDocumentV1;
  next: SceneDocumentV1;
  previousDependencies: number;
  nextDependencies: number;
}): SceneChangeSummaryV1 {
  const prevById = new Map(input.previous.nodes.map((n) => [n.id, n]));
  const nextById = new Map(input.next.nodes.map((n) => [n.id, n]));

  const sceneSettingsChanged: string[] = [];
  if (input.previous.name !== input.next.name || input.previous.description !== input.next.description) {
    sceneSettingsChanged.push('metadata');
  }
  if (stableStringify(input.previous.canvas) !== stableStringify(input.next.canvas)) {
    sceneSettingsChanged.push('canvas');
  }
  if (input.previous.fps !== input.next.fps || input.previous.durationInFrames !== input.next.durationInFrames) {
    sceneSettingsChanged.push('timing');
  }
  if (stableStringify(input.previous.theme) !== stableStringify(input.next.theme)) {
    sceneSettingsChanged.push('theme');
  }
  if (stableStringify(input.previous.safeArea ?? null) !== stableStringify(input.next.safeArea ?? null)) {
    sceneSettingsChanged.push('safeArea');
  }

  const nodesAdded: string[] = [];
  const nodesRemoved: string[] = [];
  const nodesUpdated: string[] = [];
  const assetsAdded: SceneChangeSummaryV1['assetsAdded'] = [];
  const assetsRemoved: SceneChangeSummaryV1['assetsRemoved'] = [];
  const assetsReplaced: SceneChangeSummaryV1['assetsReplaced'] = [];
  const hierarchyChanged: string[] = [];
  const timingChanged: string[] = [];
  const layoutChanged: string[] = [];
  const animationsChanged: string[] = [];

  for (const id of nextById.keys()) {
    if (!prevById.has(id)) nodesAdded.push(id);
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) nodesRemoved.push(id);
  }

  for (const [id, next] of nextById) {
    const prev = prevById.get(id);
    if (!prev) {
      if (next.type === 'asset') {
        assetsAdded.push({ nodeId: id, ...assetKey(next) });
      }
      continue;
    }
    let updated = false;
    if (prev.parentId !== next.parentId) {
      hierarchyChanged.push(id);
      updated = true;
    }
    if (prev.order !== next.order) {
      hierarchyChanged.push(id);
      updated = true;
    }
    if (prev.startFrame !== next.startFrame || prev.endFrame !== next.endFrame) {
      timingChanged.push(id);
      updated = true;
    }
    if (stableStringify(prev.layout) !== stableStringify(next.layout)) {
      layoutChanged.push(id);
      updated = true;
    }
    if (stableStringify(prev.animations ?? []) !== stableStringify(next.animations ?? [])) {
      animationsChanged.push(id);
      updated = true;
    }
    if (prev.type === 'asset' && next.type === 'asset') {
      if (prev.asset.id !== next.asset.id || prev.asset.version !== next.asset.version) {
        assetsReplaced.push({
          nodeId: id,
          previous: assetKey(prev),
          next: assetKey(next),
        });
        updated = true;
      } else if (stableStringify(prev.asset) !== stableStringify(next.asset) || prev.fit !== next.fit) {
        updated = true;
      }
    }
    if (
      stableStringify({
        enabled: prev.enabled,
        transform: prev.transform,
        metadata: prev.metadata,
        type: prev.type,
      })
      !== stableStringify({
        enabled: next.enabled,
        transform: next.transform,
        metadata: next.metadata,
        type: next.type,
      })
    ) {
      updated = true;
    }
    if (updated) nodesUpdated.push(id);
  }

  for (const id of nodesRemoved) {
    const prev = prevById.get(id);
    if (prev?.type === 'asset') {
      assetsRemoved.push({ nodeId: id, ...assetKey(prev) });
    }
  }

  return {
    sceneSettingsChanged: sortStrings([...new Set(sceneSettingsChanged)]),
    nodesAdded: sortStrings(nodesAdded),
    nodesRemoved: sortStrings(nodesRemoved),
    nodesUpdated: sortStrings([...new Set(nodesUpdated)]),
    assetsAdded: assetsAdded.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    assetsRemoved: assetsRemoved.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    assetsReplaced: assetsReplaced.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    hierarchyChanged: sortStrings([...new Set(hierarchyChanged)]),
    timingChanged: sortStrings([...new Set(timingChanged)]),
    layoutChanged: sortStrings([...new Set(layoutChanged)]),
    animationsChanged: sortStrings([...new Set(animationsChanged)]),
    previousDependencies: input.previousDependencies,
    nextDependencies: input.nextDependencies,
  };
}
