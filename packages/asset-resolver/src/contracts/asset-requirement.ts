import type {
  AssetImplementationType,
  AssetKind,
} from '../../../global-asset-registry/src/asset-types.ts';
import type { AssetResolutionPolicyV1 } from './resolution-policy.ts';

export type AssetCompositionPartRequirementV1 = {
  id: string;
  role: string;
  required?: boolean;
  search: {
    queries: string[];
    aliases?: string[];
  };
  kinds?: {
    allowed?: AssetKind[];
    preferred?: AssetKind[];
  };
  requiredCapabilities?: string[];
  preferredCapabilities?: string[];
  categories?: string[];
  tags?: string[];
  styleTags?: string[];
  implementationTypes?: AssetImplementationType[];
  preferredAssetIds?: string[];
  blockedAssetIds?: string[];
  exactAsset?: {
    id: string;
    version: string;
  };
  desiredProps?: Record<string, unknown>;
  fitHint?: 'contain' | 'cover' | 'stretch';
  order?: number;
  parentPartId?: string;
  normalizedBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type AssetCompositionRequirementV1 = {
  layoutHint: 'overlay' | 'row' | 'column' | 'labelled' | 'radial' | 'custom';
  parts: AssetCompositionPartRequirementV1[];
};

export type AssetRequirementV1 = {
  id: string;
  scope?: {
    sceneId?: string;
    beatId?: string;
    shotId?: string;
  };
  name: string;
  description: string;
  optional?: boolean;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  mode?: 'direct' | 'direct-or-composition' | 'composition';
  search: {
    queries: string[];
    aliases?: string[];
  };
  kinds?: {
    allowed?: AssetKind[];
    preferred?: AssetKind[];
  };
  requiredCapabilities?: string[];
  preferredCapabilities?: string[];
  categories?: string[];
  tags?: string[];
  styleTags?: string[];
  implementationTypes?: AssetImplementationType[];
  preferredAssetIds?: string[];
  blockedAssetIds?: string[];
  exactAsset?: {
    id: string;
    version: string;
  };
  desiredProps?: Record<string, unknown>;
  fitHint?: 'contain' | 'cover' | 'stretch';
  reuseKey?: string;
  distinctKey?: string;
  policy?: Partial<AssetResolutionPolicyV1>;
  composition?: AssetCompositionRequirementV1;
};

export const REQUIREMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const REQUIREMENT_SET_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
