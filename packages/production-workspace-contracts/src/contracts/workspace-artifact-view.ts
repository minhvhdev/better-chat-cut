export type WorkspaceArtifactViewV1 = {
  type: string;
  hash: string;
  stageId?: string;
  active: boolean;
  /** Content is never included in list/summary views. */
  contentAvailable: boolean;
  previewKind?: 'none' | 'text' | 'json' | 'image' | 'download';
  downloadUrl?: string;
  createdAt?: string;
};

export type WorkspaceLineageNodeV1 = {
  type: string;
  hash: string;
  parents: { type: string; hash: string }[];
};

export type WorkspaceLineageViewV1 = {
  nodes: WorkspaceLineageNodeV1[];
};
