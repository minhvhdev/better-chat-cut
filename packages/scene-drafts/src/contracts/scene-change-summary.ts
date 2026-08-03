export type SceneChangeSummaryV1 = {
  sceneSettingsChanged: string[];
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesUpdated: string[];
  assetsAdded: {
    nodeId: string;
    id: string;
    version: string;
  }[];
  assetsRemoved: {
    nodeId: string;
    id: string;
    version: string;
  }[];
  assetsReplaced: {
    nodeId: string;
    previous: { id: string; version: string };
    next: { id: string; version: string };
  }[];
  hierarchyChanged: string[];
  timingChanged: string[];
  layoutChanged: string[];
  animationsChanged: string[];
  previousDependencies: number;
  nextDependencies: number;
};
