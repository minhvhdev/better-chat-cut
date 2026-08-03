import { findSimilarAssets } from '../../../global-asset-registry/src/asset-similarity.ts';
import { normalizeSlug } from '../../../global-asset-registry/src/asset-normalization.ts';
import type { AssetKind } from '../../../global-asset-registry/src/asset-types.ts';
import type { AssetRequirementV1 } from '../contracts/asset-requirement.ts';
import type { AssetCreationBriefV1 } from '../contracts/creation-brief.ts';
import type { AssetDuplicateReviewV1 } from '../contracts/resolution-decision.ts';
import type { AssetResolverDiagnostic } from '../contracts/resolver-errors.ts';
import { diagnostic } from '../contracts/resolver-errors.ts';
import type { AssetResolutionSnapshot } from '../candidates/index.ts';

const KIND_NAMESPACE: Record<string, string> = {
  primitive: 'primitive',
  object: 'object',
  character: 'character',
  background: 'background',
  ui: 'ui',
  diagram: 'diagram',
  effect: 'effect',
  animation: 'animation',
  transition: 'transition',
  'scene-template': 'scene-template',
  audio: 'audio',
  font: 'font',
};

export function runDuplicateReview(
  requirement: AssetRequirementV1,
  snapshot: AssetResolutionSnapshot,
): AssetDuplicateReviewV1 {
  const candidate = {
    name: requirement.name,
    description: requirement.description,
    kind: requirement.kinds?.preferred?.[0] ?? requirement.kinds?.allowed?.[0],
    categories: requirement.categories,
    tags: [...(requirement.tags ?? []), ...requirement.search.queries],
    aliases: requirement.search.aliases,
    capabilities: [
      ...(requirement.requiredCapabilities ?? []),
      ...(requirement.preferredCapabilities ?? []),
    ],
    styleTags: requirement.styleTags,
  };
  const result = findSimilarAssets(
    snapshot.assets.map((a) => a.manifest),
    candidate,
    snapshot.catalogRevision,
    { statuses: ['published', 'staging', 'deprecated'], limit: 20 },
  );
  const exactOrLikely = result.items.filter((item) => item.level === 'exact' || item.level === 'likely');
  const possible = result.items.filter((item) => item.level === 'possible');
  return {
    checked: true,
    exactOrLikelyDuplicates: exactOrLikely,
    possibleDuplicates: possible,
    blocksCreationBrief: exactOrLikely.length > 0,
    catalogRevision: snapshot.catalogRevision,
  };
}

export function suggestAssetId(
  requirement: AssetRequirementV1,
  snapshot: AssetResolutionSnapshot,
): { suggestedId: string; diagnostics: AssetResolverDiagnostic[] } {
  const diagnostics: AssetResolverDiagnostic[] = [];
  const kind = requirement.kinds?.preferred?.[0]
    ?? requirement.kinds?.allowed?.[0]
    ?? 'object';
  const ns = KIND_NAMESPACE[kind] ?? 'object';
  const base = normalizeSlug(requirement.name) || normalizeSlug(requirement.id) || 'asset';
  const existing = new Set(snapshot.assets.map((a) => a.manifest.id));
  let suggestedId = `${ns}.${base}`;
  if (!existing.has(suggestedId)) return { suggestedId, diagnostics };

  const roleSuffix = normalizeSlug(requirement.scope?.shotId ?? requirement.scope?.beatId ?? requirement.id);
  suggestedId = `${ns}.${base}-${roleSuffix}`;
  if (!existing.has(suggestedId)) return { suggestedId, diagnostics };

  const cap = normalizeSlug((requirement.requiredCapabilities ?? requirement.preferredCapabilities ?? [])[0] ?? 'custom');
  suggestedId = `${ns}.${base}-${cap}`;
  if (!existing.has(suggestedId)) return { suggestedId, diagnostics };

  diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_CREATION_ID_COLLISION', `Unable to suggest unique id for ${requirement.id}`, {
    requirementId: requirement.id,
    recovery: 'Caller must choose an explicit asset id',
  }));
  return { suggestedId: `${ns}.${base}`, diagnostics };
}

export function buildCreationBrief(
  requirement: AssetRequirementV1,
  snapshot: AssetResolutionSnapshot,
  duplicateReview: AssetDuplicateReviewV1,
): AssetCreationBriefV1 {
  const { suggestedId, diagnostics } = suggestAssetId(requirement, snapshot);
  void diagnostics;
  const kind = (requirement.kinds?.preferred?.[0] ?? requirement.kinds?.allowed?.[0]) as AssetKind | undefined;
  return {
    requirementId: requirement.id,
    suggestedId,
    suggestedVersion: '0.1.0',
    name: requirement.name,
    description: requirement.description,
    ...(kind ? { suggestedKind: kind } : {}),
    categories: requirement.categories ?? [],
    tags: requirement.tags ?? [],
    aliases: requirement.search.aliases ?? [],
    capabilities: [
      ...(requirement.requiredCapabilities ?? []),
      ...(requirement.preferredCapabilities ?? []),
    ],
    styleTags: requirement.styleTags ?? [],
    ...(requirement.desiredProps ? { desiredProps: requirement.desiredProps } : {}),
    preferredImplementationType: 'react-component',
    duplicateReview,
    recommendedNextAction: requirement.optional
      ? 'omit-optional-requirement'
      : duplicateReview.blocksCreationBrief
        ? 'review-existing-assets'
        : 'create-draft-manifest',
  };
}
