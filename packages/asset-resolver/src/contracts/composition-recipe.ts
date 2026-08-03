import type { AssetResolverDiagnostic } from './resolver-errors.ts';
import type {
  AssetResolutionConfidence,
  ResolvedAssetSelectionV1,
} from './resolution-candidate.ts';

export type AssetCompositionResolvedPartV1 = {
  partId: string;
  role: string;
  required: boolean;
  order: number;
  parentPartId?: string;
  normalizedBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  selection: ResolvedAssetSelectionV1;
};

export type AssetCompositionRecipeV1 = {
  schemaVersion: '1.0.0';
  requirementId: string;
  layoutHint: 'overlay' | 'row' | 'column' | 'labelled' | 'radial' | 'custom';
  parts: AssetCompositionResolvedPartV1[];
  score: number;
  confidence: AssetResolutionConfidence;
  unresolvedOptionalParts: string[];
  diagnostics: AssetResolverDiagnostic[];
};
