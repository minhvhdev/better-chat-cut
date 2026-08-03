import type { StoryboardSceneV1 } from '../contracts/storyboard-scene.ts';
import type { ExplainerProductionRequestV1 } from '../contracts/explainer-production-request.ts';
import type { AssetPlanV1 } from '../../../asset-resolver/src/contracts/asset-plan.ts';
import type { AssetPlanSceneCompositionSpecV1 } from '../../../scene-drafts/src/contracts/asset-plan-composition-spec.ts';

export function storyboardSceneToCompositionSpec(input: {
  storyboardScene: StoryboardSceneV1;
  assetPlan: AssetPlanV1;
  productionRequest: ExplainerProductionRequestV1;
  draftId?: string;
}): AssetPlanSceneCompositionSpecV1 {
  const { storyboardScene: scene, productionRequest } = input;
  const width = productionRequest.output.width;
  const height = productionRequest.output.height;
  const fps = productionRequest.output.fps;
  const durationSeconds = scene.durationHintSeconds
    ?? Math.max(3, Math.round(productionRequest.duration.targetSeconds / 3));
  const durationInFrames = Math.max(1, Math.round(durationSeconds * fps));
  const theme = productionRequest.style.preferredTheme ?? { id: 'theme.default', version: '1.0.0' };

  const placements = scene.visualRequirements.map((visual) => {
    const box = visual.placement.normalizedBox;
    return {
      requirementId: visual.id,
      nodeId: visual.placement.nodeId,
      parentId: visual.placement.parentNodeId,
      order: visual.placement.order,
      startFrame: 0,
      endFrame: durationInFrames,
      layout: {
        x: box.x * width,
        y: box.y * height,
        width: box.width * width,
        height: box.height * height,
      },
      metadata: {
        role: visual.role,
        label: visual.name,
      },
    };
  });

  return {
    schemaVersion: '1.0.0',
    draft: {
      draftId: input.draftId ?? `draft.${scene.id}`,
      name: scene.name,
      description: scene.purpose,
    },
    scene: {
      id: scene.id,
      name: scene.name,
      description: scene.visualDescription,
      canvas: {
        width,
        height,
        backgroundColor: scene.layout.backgroundColor,
      },
      fps,
      durationInFrames,
      theme: { ...theme },
      safeArea: scene.layout.safeArea ? { ...scene.layout.safeArea } : undefined,
    },
    placements,
    omitOptionalSkippedRequirements: true,
  };
}
