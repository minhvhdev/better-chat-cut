import assert from 'node:assert/strict';
import {
  validatePublishingRequest,
  validatePublishingMetadata,
  validatePublishingCompliance,
  validateThumbnailPlan,
  validateReleasePlan,
  validatePublishingPackage,
  computePublishingRequestHash,
  computeMetadataHash,
  computeComplianceHash,
  computePublishingPackageHash,
  deepCloneJson,
  storyboardToPublishingChapters,
  researchBriefToPublishingAttributions,
  buildPublishingPackage,
  DEFAULT_YOUTUBE_CAPABILITIES,
  type PublishingRequestV1,
  type PublishingMetadataV1,
  type PublishingComplianceV1,
  type ThumbnailPlanV1,
} from './src/index.ts';

function sampleRequest(overrides: Partial<PublishingRequestV1> = {}): PublishingRequestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'publish.hawking-radiation',
    name: 'Publish Hawking',
    source: {
      productionRunId: 'production-run.explainer.abc12345',
      bundleId: 'bundle.test-001',
      deliveryManifestHash: 'a'.repeat(64),
    },
    target: { platform: 'youtube', connectionId: 'conn.youtube.main', expectedChannelId: 'UCTESTCHANNEL' },
    release: { desiredVisibility: 'unlisted', mode: 'immediate' },
    subtitles: { uploadSrt: true, uploadVtt: true, language: 'vi' },
    ...overrides,
  };
}

function sampleScene() {
  return {
    schemaVersion: '1.0.0' as const,
    id: 'scene.basic-explainer',
    name: 'Basic',
    canvas: { width: 1280, height: 720, backgroundColor: '#0D1021' },
    fps: 30,
    durationInFrames: 90,
    theme: { id: 'default', version: '1.0.0' },
    nodes: [{
      id: 'node_bg',
      type: 'asset' as const,
      order: 0,
      startFrame: 0,
      endFrame: 90,
      layout: { x: 0, y: 0, width: 1280, height: 720 },
      asset: { id: 'background.solid', version: '1.0.0', props: { color: '#0D1021' } },
    }],
  };
}

// valid request
{
  const v = validatePublishingRequest(sampleRequest());
  assert.equal(v.valid, true);
  assert.ok(v.requestHash);
  assert.equal(computePublishingRequestHash(v.normalizedRequest!), v.requestHash);
  const original = sampleRequest();
  const clone = deepCloneJson(original);
  void validatePublishingRequest(clone);
  assert.deepEqual(clone, original);
}

// invalid id / unknown fields / secrets / schedule
assert.equal(validatePublishingRequest(sampleRequest({ id: 'BAD ID' })).valid, false);
assert.equal(validatePublishingRequest({ ...sampleRequest(), extra: true } as never).valid, false);
assert.equal(validatePublishingRequest({
  ...sampleRequest(),
  target: { platform: 'youtube', connectionId: 'ok', accessToken: 'secret' } as never,
}).valid, false);
assert.equal(validatePublishingRequest(sampleRequest({
  release: { desiredVisibility: 'public', mode: 'scheduled' },
})).valid, false);

// metadata
const meta: PublishingMetadataV1 = {
  schemaVersion: '1.0.0',
  title: 'Hawking radiation',
  description: 'A short explainer.',
  language: 'vi',
  tags: ['science', 'Science', 'physics', 'science'],
  chapters: [
    { id: 'ch1', startMs: 0, title: 'Intro' },
    { id: 'ch2', startMs: 20_000, title: 'Quantum' },
  ],
};
{
  const v = validatePublishingMetadata(meta, { capabilities: DEFAULT_YOUTUBE_CAPABILITIES, videoDurationMs: 90_000 });
  assert.equal(v.valid, true);
  assert.deepEqual(v.normalized!.tags, ['science', 'physics']);
  assert.ok(v.metadataHash);
  assert.equal(computeMetadataHash(v.normalized!), v.metadataHash);
}
assert.equal(validatePublishingMetadata({ ...meta, title: '' }).valid, false);
assert.equal(validatePublishingMetadata({ ...meta, title: 'x'.repeat(200) }, { capabilities: DEFAULT_YOUTUBE_CAPABILITIES }).valid, false);
assert.equal(validatePublishingMetadata({ ...meta, chapters: [{ id: 'a', startMs: 10, title: 'A' }, { id: 'b', startMs: 10, title: 'B' }] }).valid, false);
assert.equal(validatePublishingMetadata({ ...meta, title: '<script>x</script>' }).valid, false);

// compliance
const compliance: PublishingComplianceV1 = {
  schemaVersion: '1.0.0',
  audience: 'not-made-for-kids',
  syntheticMedia: 'contains-altered-or-synthetic-content',
  paidPromotion: false,
  rights: {
    videoRightsConfirmed: true,
    audioRightsConfirmed: true,
    thumbnailRightsConfirmed: true,
    subtitleRightsConfirmed: true,
  },
  review: {
    metadataReviewed: true,
    captionsReviewed: true,
    thumbnailReviewed: true,
    qaReviewed: true,
  },
};
{
  const v = validatePublishingCompliance(compliance);
  assert.equal(v.valid, true);
  assert.ok(v.complianceHash);
  assert.equal(computeComplianceHash(v.normalized!), v.complianceHash);
}
assert.equal(validatePublishingCompliance({ ...compliance, rights: { ...compliance.rights, videoRightsConfirmed: false } }).valid, false);

// thumbnail plan
const plan: ThumbnailPlanV1 = {
  schemaVersion: '1.0.0',
  id: 'thumb.main',
  name: 'Main thumb',
  output: { width: 1280, height: 720, format: 'png' },
  source: { type: 'custom-scene', scene: sampleScene() as never },
  overlays: [
    {
      type: 'shape',
      id: 'accent',
      shape: 'rectangle',
      box: { x: 40, y: 500, width: 400, height: 120 },
      fill: '#E85D04',
    },
    {
      type: 'label',
      id: 'title',
      text: 'Hawking',
      box: { x: 60, y: 520, width: 360, height: 80 },
      style: { fontSize: 48, textColor: '#FFFFFF', align: 'center' },
    },
  ],
  safeArea: { top: 40, right: 40, bottom: 40, left: 40 },
};
{
  const v = validateThumbnailPlan(plan);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  assert.ok(v.planHash);
}
assert.equal(validateThumbnailPlan({ ...plan, overlays: [{ type: 'label', id: 'x', text: '', box: { x: 0, y: 0, width: 10, height: 10 }, style: { fontSize: 12, textColor: '#fff' } }] }).valid, false);
assert.equal(validateThumbnailPlan({ ...plan, overlays: [{ type: 'label', id: 'x', text: '<html>', box: { x: 0, y: 0, width: 10, height: 10 }, style: { fontSize: 12, textColor: '#fff' } }] }).valid, false);
assert.equal(validateThumbnailPlan({ ...plan, overlays: [{ type: 'shape', id: 'o', shape: 'rectangle', box: { x: 1200, y: 0, width: 200, height: 10 }, fill: '#000' }] }).valid, false);

// package hash stability
const metaV = validatePublishingMetadata(meta).normalized!;
const compV = validatePublishingCompliance(compliance).normalized!;
const release = validateReleasePlan({ schemaVersion: '1.0.0', desiredVisibility: 'unlisted', mode: 'immediate' }).normalized!;
const pkg = buildPublishingPackage({
  id: 'pkg.1',
  name: 'Pkg',
  productionRunId: 'production-run.x',
  bundleId: 'bundle.1',
  deliveryManifestHash: 'b'.repeat(64),
  videoArtifact: { fileName: 'final.mp4', sha256: 'c'.repeat(64), byteLength: 1000 },
  srtArtifact: { fileName: 'subs.srt', sha256: 'd'.repeat(64), byteLength: 100 },
  vttArtifact: { fileName: 'subs.vtt', sha256: 'e'.repeat(64), byteLength: 120 },
  qaReportHash: 'f'.repeat(64),
  target: { platform: 'youtube', connectionId: 'conn.1' },
  metadata: metaV,
  compliance: compV,
  subtitles: { uploadSrt: true, uploadVtt: true, language: 'vi' },
  release,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const pkg2 = buildPublishingPackage({ ...pkg, createdAt: '2099-01-01T00:00:00.000Z', id: pkg.id, name: pkg.name, productionRunId: pkg.source.productionRunId, bundleId: pkg.source.bundleId, deliveryManifestHash: pkg.source.deliveryManifestHash, videoArtifact: pkg.source.videoArtifact, srtArtifact: pkg.source.srtArtifact, vttArtifact: pkg.source.vttArtifact, qaReportHash: pkg.source.qaReportHash, target: pkg.target, metadata: pkg.metadata, compliance: pkg.compliance, subtitles: pkg.subtitles, release: pkg.release });
assert.equal(pkg.packageHash, pkg2.packageHash);
const pv = validatePublishingPackage(pkg);
assert.equal(pv.valid, true, JSON.stringify(pv.errors));
assert.equal(validatePublishingPackage({ ...pkg, packageHash: '0'.repeat(64) }).valid, false);

// attributions helper doesn't throw
const atr = researchBriefToPublishingAttributions({
  researchBrief: {
    schemaVersion: '1.0.0',
    id: 'r1',
    topic: 't',
    summary: 's',
    reviewed: true,
    sources: [{ id: 's1', title: 'T', sourceType: 'article', reliability: 'secondary', url: 'https://example.com' }],
    claims: [{ id: 'c1', text: 'x', sourceIds: ['s1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' }],
  },
});
assert.equal(atr![0].sourceId, 's1');

console.log('publishing-contracts.verify.ts: ok');
