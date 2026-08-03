import type { AssetKind } from '../../../global-asset-registry/src/asset-types.ts';
import type { AssetCompositionRequirementV1 } from '../../../asset-resolver/src/contracts/asset-requirement.ts';

export type StoryboardVisualRequirementV1 = {
  id: string;
  name: string;
  description: string;
  role:
    | 'background'
    | 'primary'
    | 'secondary'
    | 'label'
    | 'annotation'
    | 'decoration';
  searchQueries: string[];
  kinds?: {
    allowed?: AssetKind[];
    preferred?: AssetKind[];
  };
  requiredCapabilities?: string[];
  preferredCapabilities?: string[];
  categories?: string[];
  tags?: string[];
  styleTags?: string[];
  desiredProps?: Record<string, unknown>;
  reuseKey?: string;
  distinctKey?: string;
  optional?: boolean;
  placement: {
    nodeId: string;
    parentNodeId?: string;
    order: number;
    normalizedBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    fit?: 'contain' | 'cover' | 'stretch';
  };
  composition?: AssetCompositionRequirementV1;
};

export const VISUAL_ROLES = [
  'background',
  'primary',
  'secondary',
  'label',
  'annotation',
  'decoration',
] as const;
