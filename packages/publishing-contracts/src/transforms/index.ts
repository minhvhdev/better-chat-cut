import type { ResearchBriefV1 } from '../../../explainer-production-contracts/src/contracts/research-brief.ts';
import type { StoryboardV1 } from '../../../explainer-production-contracts/src/contracts/storyboard.ts';
import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { PublishingChapterV1 } from '../contracts/publishing-chapter.ts';
import type { PublishingMetadataV1 } from '../contracts/publishing-metadata.ts';
import type { PublishingPackageV1, PublishingPackageWithoutHash } from '../contracts/publishing-package.ts';
import type { PublishingMetadataV1 as Meta } from '../contracts/publishing-metadata.ts';
import type { PublishingComplianceV1 } from '../contracts/publishing-compliance.ts';
import type { ReleasePlanV1 } from '../contracts/release-plan.ts';
import type { PublishingTargetV1 } from '../contracts/publishing-target.ts';
import type { ThumbnailPlanV1 } from '../contracts/thumbnail-plan.ts';
import type { SceneDocumentV1 } from '../../../scene-graph/src/contracts/scene-document.ts';
import { computeComplianceHash, computeMetadataHash, computePublishingPackageHash } from '../schema/artifact-hash.ts';
import { deepCloneJson } from '../schema/serialization.ts';

export function storyboardToPublishingChapters(input: {
  storyboard: StoryboardV1;
  videoPlan: VideoPlanV1;
  schedule?: { entries: { sceneEntryId: string; startMs: number }[] };
}): PublishingChapterV1[] {
  const chapters: PublishingChapterV1[] = [];
  const fps = input.videoPlan.output?.fps || 30;
  const planEntries = input.videoPlan.scenes ?? [];
  let cursorMs = 0;
  for (let i = 0; i < input.storyboard.scenes.length; i += 1) {
    const scene = input.storyboard.scenes[i];
    const entry = planEntries[i];
    const scheduled = input.schedule?.entries.find((e) => e.sceneEntryId === entry?.id);
    const startMs = scheduled?.startMs ?? cursorMs;
    chapters.push({
      id: `chapter.${scene.id}`,
      startMs,
      title: scene.name,
      sourceSceneEntryId: entry?.id ?? scene.id,
    });
    const frames = entry?.duration?.timelineFrames
      ?? Math.max(1, Math.round((scene.durationHintSeconds || 10) * fps));
    cursorMs = startMs + Math.round((frames / fps) * 1000);
  }
  let last = -1;
  for (const c of chapters) {
    if (c.startMs <= last) c.startMs = last + 1;
    last = c.startMs;
  }
  return chapters;
}

export function researchBriefToPublishingAttributions(input: {
  researchBrief: ResearchBriefV1;
}): PublishingMetadataV1['sourceAttributions'] {
  const acceptedSourceIds = new Set(
    input.researchBrief.claims
      .filter((c) => c.reviewStatus === 'accepted')
      .flatMap((c) => c.sourceIds),
  );
  const out: NonNullable<PublishingMetadataV1['sourceAttributions']> = [];
  for (const src of input.researchBrief.sources) {
    if (!acceptedSourceIds.has(src.id)) continue;
    out.push({
      sourceId: src.id,
      title: src.title,
      publisher: undefined,
      url: src.url,
    });
  }
  return out;
}

export function buildThumbnailScene(plan: ThumbnailPlanV1): SceneDocumentV1 {
  const baseScene = deepCloneJson(plan.source.scene) as SceneDocumentV1;
  const durationInFrames = Math.max(1, baseScene.durationInFrames || 1);
  const nodes = [...(baseScene.nodes ?? [])];
  const overlays = plan.overlays ?? [];

  for (const overlay of overlays) {
    const id = `thumbOverlay_${overlay.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    if (overlay.type === 'shape') {
      nodes.push({
        id,
        type: 'asset',
        order: nodes.length,
        startFrame: 0,
        endFrame: durationInFrames,
        layout: {
          x: overlay.box.x,
          y: overlay.box.y,
          width: overlay.box.width,
          height: overlay.box.height,
        },
        asset: {
          id: overlay.shape === 'circle' ? 'primitive.circle' : 'primitive.rectangle',
          version: '1.0.0',
          props: {
            fill: overlay.fill,
            opacity: overlay.opacity ?? 1,
          },
        },
        metadata: { role: 'thumbnail-overlay', label: overlay.id },
      });
    } else {
      nodes.push({
        id,
        type: 'asset',
        order: nodes.length,
        startFrame: 0,
        endFrame: durationInFrames,
        layout: {
          x: overlay.box.x,
          y: overlay.box.y,
          width: overlay.box.width,
          height: overlay.box.height,
        },
        asset: {
          id: 'ui.label',
          version: '1.0.0',
          props: {
            text: overlay.text,
            fontSize: overlay.style.fontSize,
            fontWeight: overlay.style.fontWeight ?? 700,
            color: overlay.style.textColor,
            backgroundColor: overlay.style.backgroundColor,
            align: overlay.style.align ?? 'center',
          },
        },
        metadata: { role: 'thumbnail-overlay', label: overlay.id },
      });
    }
  }

  return {
    ...baseScene,
    id: baseScene.id,
    name: plan.name,
    canvas: {
      width: plan.output.width,
      height: plan.output.height,
      backgroundColor: plan.background?.color ?? baseScene.canvas?.backgroundColor ?? '#0D1021',
    },
    fps: baseScene.fps || 30,
    durationInFrames,
    theme: baseScene.theme ?? { id: 'default', version: '1.0.0' },
    nodes,
  };
}

export function buildPublishingPackage(input: {
  id: string;
  name: string;
  productionRunId: string;
  bundleId: string;
  deliveryManifestHash: string;
  videoArtifact: PublishingPackageV1['source']['videoArtifact'];
  srtArtifact?: PublishingPackageV1['source']['srtArtifact'];
  vttArtifact?: PublishingPackageV1['source']['vttArtifact'];
  qaReportHash: string;
  target: PublishingTargetV1;
  metadata: Meta;
  compliance: PublishingComplianceV1;
  thumbnail?: PublishingPackageV1['thumbnail'];
  subtitles: PublishingPackageV1['subtitles'];
  release: ReleasePlanV1;
  createdAt: string;
}): PublishingPackageV1 {
  const withoutHash: PublishingPackageWithoutHash = {
    schemaVersion: '1.0.0',
    id: input.id,
    name: input.name,
    source: {
      productionRunId: input.productionRunId,
      bundleId: input.bundleId,
      deliveryManifestHash: input.deliveryManifestHash,
      videoArtifact: input.videoArtifact,
      srtArtifact: input.srtArtifact,
      vttArtifact: input.vttArtifact,
      qaReportHash: input.qaReportHash,
    },
    target: input.target,
    metadata: input.metadata,
    metadataHash: computeMetadataHash(input.metadata),
    compliance: input.compliance,
    complianceHash: computeComplianceHash(input.compliance),
    thumbnail: input.thumbnail,
    subtitles: input.subtitles,
    release: input.release,
  };
  return {
    ...withoutHash,
    packageHash: computePublishingPackageHash(withoutHash),
    createdAt: input.createdAt,
  };
}
