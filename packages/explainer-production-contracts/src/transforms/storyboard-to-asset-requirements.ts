import type { StoryboardV1 } from '../contracts/storyboard.ts';
import type { ExplainerProductionRequestV1 } from '../contracts/explainer-production-request.ts';
import type { AssetRequirementSetV1 } from '../../../asset-resolver/src/contracts/asset-requirement-set.ts';
import type { AssetRequirementV1 } from '../../../asset-resolver/src/contracts/asset-requirement.ts';
import { deepCloneJson } from '../schema/serialization.ts';
import { ASSET_REQUIREMENT_SCHEMA_VERSION } from '../../../asset-resolver/src/contracts/asset-requirement-set.ts';

export function storyboardToAssetRequirementSet(input: {
  storyboard: StoryboardV1;
  productionRequest: ExplainerProductionRequestV1;
}): AssetRequirementSetV1 {
  const { storyboard, productionRequest } = input;
  const requirements: AssetRequirementV1[] = [];

  for (const scene of storyboard.scenes) {
    for (const visual of scene.visualRequirements) {
      const req: AssetRequirementV1 = {
        id: visual.id,
        scope: { sceneId: scene.id },
        name: visual.name,
        description: visual.description,
        optional: visual.optional,
        priority: visual.optional ? 'normal' : 'high',
        mode: visual.composition ? 'composition' : 'direct',
        search: { queries: [...visual.searchQueries] },
        fitHint: visual.placement.fit,
      };
      if (visual.kinds) req.kinds = deepCloneJson(visual.kinds);
      if (visual.requiredCapabilities) req.requiredCapabilities = [...visual.requiredCapabilities];
      if (visual.preferredCapabilities) req.preferredCapabilities = [...visual.preferredCapabilities];
      if (visual.categories) req.categories = [...visual.categories];
      if (visual.tags) req.tags = [...visual.tags];
      if (visual.styleTags) req.styleTags = [...visual.styleTags];
      if (visual.desiredProps) req.desiredProps = deepCloneJson(visual.desiredProps);
      if (visual.reuseKey) req.reuseKey = visual.reuseKey;
      if (visual.distinctKey) req.distinctKey = visual.distinctKey;
      if (visual.composition) req.composition = deepCloneJson(visual.composition);
      requirements.push(req);
    }
  }

  const set: AssetRequirementSetV1 = {
    schemaVersion: ASSET_REQUIREMENT_SCHEMA_VERSION,
    id: `reqs.${storyboard.id}`,
    name: `Assets for ${storyboard.title}`,
    description: `Deterministic requirements from storyboard ${storyboard.id}`,
    requirements,
  };
  if (productionRequest.style.preferredTheme) {
    set.theme = { ...productionRequest.style.preferredTheme };
  }
  return set;
}
