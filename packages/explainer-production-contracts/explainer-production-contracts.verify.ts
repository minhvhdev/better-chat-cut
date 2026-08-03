import assert from 'node:assert/strict';
import {
  validateProductionRequest,
  validateResearchBrief,
  validateExplainerScript,
  validateStoryboard,
  storyboardToAssetRequirementSet,
  storyboardSceneToCompositionSpec,
  storyboardToVideoPlan,
  scriptToNarrationPlan,
  computeProductionRequestHash,
  computeProductionArtifactHash,
  deepCloneJson,
  type ExplainerProductionRequestV1,
  type ResearchBriefV1,
  type ExplainerScriptV1,
  type StoryboardV1,
} from './src/index.ts';

function sampleRequest(overrides: Partial<ExplainerProductionRequestV1> = {}): ExplainerProductionRequestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'explainer.hawking-radiation',
    name: 'Hawking radiation explainer',
    topic: 'Bức xạ Hawking',
    objective: 'Giải thích bức xạ Hawking cho khán giả phổ thông.',
    audience: { description: 'Người xem khoa học phổ thông, không cần vật lý cao cấp' },
    language: 'vi',
    duration: { targetSeconds: 75, minimumSeconds: 60, maximumSeconds: 90 },
    output: { width: 1920, height: 1080, fps: 30, renderProfile: 'youtube-1080p-h264' },
    style: {
      visualStyle: 'clean motion graphics',
      tone: 'curious and clear',
      pacing: 'balanced',
      complexity: 'introductory',
      preferredTheme: { id: 'theme.default', version: '1.0.0' },
    },
    factualPolicy: { requireSources: true, minimumSourcesPerClaim: 1, allowUnverifiedOpinion: false },
    project: { mode: 'existing-target', expectedProjectId: 'project-test' },
    workflow: { reviewMode: 'review-key-stages' },
    ...overrides,
  };
}

function sampleResearch(): ResearchBriefV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'research.hawking',
    topic: 'Bức xạ Hawking',
    summary: 'Lỗ đen phát xạ lượng tử gần chân trời sự kiện.',
    reviewed: true,
    sources: [
      { id: 'src.hawking1974', title: 'Black hole explosions?', sourceType: 'paper', reliability: 'primary', publicationDate: '1974-03-01', url: 'https://example.com/hawking1974' },
      { id: 'src.wiki', title: 'Hawking radiation overview', sourceType: 'article', reliability: 'secondary', accessedDate: '2026-01-01', url: 'https://example.com/wiki' },
      { id: 'src.user', title: 'Curator notes', sourceType: 'user-provided', reliability: 'unverified', notes: 'Internal summary only' },
    ],
    claims: [
      { id: 'claim.event-horizon', text: 'Chân trời sự kiện là ranh giới không thể trở về.', sourceIds: ['src.hawking1974'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
      { id: 'claim.quantum', text: 'Hiệu ứng lượng tử gần chân trời tạo cặp hạt.', sourceIds: ['src.hawking1974', 'src.wiki'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
      { id: 'claim.temperature', text: 'Nhiệt độ Hawking tỷ lệ nghịch với khối lượng.', sourceIds: ['src.hawking1974'], confidence: 'medium', type: 'estimate', reviewStatus: 'accepted', caveat: 'Xấp xỉ bán cổ điển' },
      { id: 'claim.evaporation', text: 'Lỗ đen nhỏ bay hơi nhanh hơn.', sourceIds: ['src.wiki'], confidence: 'medium', type: 'fact', reviewStatus: 'accepted' },
      { id: 'claim.rejected', text: 'Lỗ đen phát sáng nhìn thấy bằng mắt thường.', sourceIds: ['src.user'], confidence: 'low', type: 'opinion', reviewStatus: 'rejected' },
    ],
  };
}

function sampleScript(): ExplainerScriptV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'script.hawking',
    title: 'Bức xạ Hawking',
    logline: 'Vì sao lỗ đen không hoàn toàn đen',
    targetDurationSeconds: 75,
    language: 'vi',
    sections: [
      {
        id: 'sec.intro',
        purpose: 'Hook',
        segments: [
          { id: 'seg.hook', narration: 'Lỗ đen không hoàn toàn đen.', onScreenText: 'Không hoàn toàn đen', claimIds: ['claim.event-horizon'], pronunciationHints: ['Hawking'] },
          { id: 'seg.horizon', narration: 'Chân trời sự kiện là ranh giới một chiều.', claimIds: ['claim.event-horizon'] },
        ],
      },
      {
        id: 'sec.quantum',
        purpose: 'Mechanism',
        segments: [
          { id: 'seg.pairs', narration: 'Gần chân trời, cặp hạt lượng tử xuất hiện.', claimIds: ['claim.quantum'] },
          { id: 'seg.escape', narration: 'Một hạt có thể thoát ra, tạo bức xạ.', claimIds: ['claim.quantum'] },
          { id: 'seg.temp', narration: 'Lỗ đen nhỏ nóng hơn và bay hơi nhanh hơn.', claimIds: ['claim.temperature', 'claim.evaporation'] },
        ],
      },
    ],
  };
}

function sampleStoryboard(): StoryboardV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'story.hawking',
    title: 'Hawking storyboard',
    output: { width: 1920, height: 1080, fps: 30 },
    scenes: [
      {
        id: 'scene.intro',
        name: 'Intro',
        purpose: 'Hook',
        scriptSegmentIds: ['seg.hook', 'seg.horizon'],
        claimIds: ['claim.event-horizon'],
        durationHintSeconds: 20,
        visualDescription: 'Black hole silhouette',
        layout: { backgroundColor: '#0b1020' },
        visualRequirements: [
          {
            id: 'vis_bg1',
            name: 'Space background',
            description: 'Dark space',
            role: 'background',
            searchQueries: ['space background dark'],
            reuseKey: 'space-bg',
            placement: { nodeId: 'node_bg1', order: 0, normalizedBox: { x: 0, y: 0, width: 1, height: 1 }, fit: 'cover' },
          },
          {
            id: 'vis_primary1',
            name: 'Black hole',
            description: 'Primary black hole graphic',
            role: 'primary',
            searchQueries: ['black hole graphic'],
            distinctKey: 'bh-main',
            placement: { nodeId: 'node_bh1', order: 1, normalizedBox: { x: 0.25, y: 0.2, width: 0.5, height: 0.5 } },
          },
        ],
        transitionToNext: { mode: 'cut' },
      },
      {
        id: 'scene.quantum',
        name: 'Quantum',
        purpose: 'Pairs',
        scriptSegmentIds: ['seg.pairs', 'seg.escape'],
        claimIds: ['claim.quantum'],
        durationHintSeconds: 30,
        visualDescription: 'Particle pairs',
        layout: { backgroundColor: '#101828' },
        visualRequirements: [
          {
            id: 'vis_bg2',
            name: 'Space background',
            description: 'Reuse space',
            role: 'background',
            searchQueries: ['space background dark'],
            reuseKey: 'space-bg',
            placement: { nodeId: 'node_bg2', order: 0, normalizedBox: { x: 0, y: 0, width: 1, height: 1 } },
          },
          {
            id: 'vis_particles',
            name: 'Particle composition',
            description: 'Particle pair group',
            role: 'primary',
            searchQueries: ['particle pair'],
            placement: { nodeId: 'node_particles', order: 1, normalizedBox: { x: 0.2, y: 0.25, width: 0.6, height: 0.4 } },
            composition: {
              layoutHint: 'row',
              parts: [
                { id: 'part_a', role: 'left', search: { queries: ['particle a'] }, order: 0 },
                { id: 'part_b', role: 'right', search: { queries: ['particle b'] }, order: 1 },
              ],
            },
          },
        ],
        transitionToNext: {
          mode: 'timeline-transition',
          type: 'cross-dissolve',
          durationInFrames: 12,
        },
      },
      {
        id: 'scene.outro',
        name: 'Outro',
        purpose: 'Temperature',
        scriptSegmentIds: ['seg.temp'],
        claimIds: ['claim.temperature', 'claim.evaporation'],
        durationHintSeconds: 25,
        visualDescription: 'Temperature chart',
        layout: { backgroundColor: '#0f172a' },
        visualRequirements: [
          {
            id: 'vis_chart',
            name: 'Temperature chart',
            description: 'Mass vs temperature',
            role: 'primary',
            searchQueries: ['temperature chart'],
            placement: { nodeId: 'node_chart', order: 0, normalizedBox: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 } },
            desiredProps: { title: 'T ∝ 1/M' },
          },
        ],
      },
    ],
  };
}

// Request validation
{
  const ok = validateProductionRequest(sampleRequest());
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.ok(ok.requestHash);

  assert.equal(validateProductionRequest(sampleRequest({ id: 'BAD ID' })).valid, false);
  assert.equal(validateProductionRequest(sampleRequest({ topic: '' })).valid, false);
  assert.equal(validateProductionRequest(sampleRequest({ duration: { targetSeconds: 1 } })).valid, false);
  assert.equal(validateProductionRequest({ ...sampleRequest(), extra: true } as never).valid, false);
  const cloned = deepCloneJson(sampleRequest());
  const before = JSON.stringify(cloned);
  validateProductionRequest(cloned);
  assert.equal(JSON.stringify(cloned), before);
  assert.equal(computeProductionRequestHash(sampleRequest()), computeProductionRequestHash(sampleRequest()));
}

// Research
{
  const req = sampleRequest();
  const research = sampleResearch();
  const ok = validateResearchBrief(research, { productionRequest: req });
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.ok(ok.artifactHash);

  const noSource = deepCloneJson(research);
  noSource.claims[0].sourceIds = [];
  assert.equal(validateResearchBrief(noSource, { productionRequest: req }).valid, false);

  const missingSrc = deepCloneJson(research);
  missingSrc.claims[0].sourceIds = ['src.missing'];
  assert.equal(validateResearchBrief(missingSrc, { productionRequest: req }).valid, false);

  assert.equal(
    computeProductionArtifactHash({ artifactType: 'research-brief', artifact: research }),
    computeProductionArtifactHash({ artifactType: 'research-brief', artifact: deepCloneJson(research) }),
  );
}

// Script
{
  const req = sampleRequest();
  const research = sampleResearch();
  const script = sampleScript();
  const ok = validateExplainerScript(script, { productionRequest: req, researchBrief: research });
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));

  const rejected = deepCloneJson(script);
  rejected.sections[0].segments[0].claimIds = ['claim.rejected'];
  assert.equal(validateExplainerScript(rejected, { productionRequest: req, researchBrief: research }).valid, false);

  const missing = deepCloneJson(script);
  missing.sections[0].segments[0].claimIds = ['claim.nope'];
  assert.equal(validateExplainerScript(missing, { productionRequest: req, researchBrief: research }).valid, false);
}

// Storyboard
{
  const req = sampleRequest();
  const research = sampleResearch();
  const script = sampleScript();
  const story = sampleStoryboard();
  const ok = validateStoryboard(story, { productionRequest: req, script, researchBrief: research });
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));

  const badBox = deepCloneJson(story);
  badBox.scenes[0].visualRequirements[0].placement.normalizedBox = { x: 0, y: 0, width: 2, height: 1 };
  assert.equal(validateStoryboard(badBox, { productionRequest: req, script, researchBrief: research }).valid, false);

  const dupNode = deepCloneJson(story);
  dupNode.scenes[0].visualRequirements[1].placement.nodeId = 'node_bg1';
  assert.equal(validateStoryboard(dupNode, { productionRequest: req, script, researchBrief: research }).valid, false);
}

// Transforms
{
  const req = sampleRequest();
  const story = sampleStoryboard();
  const reqSet = storyboardToAssetRequirementSet({ storyboard: story, productionRequest: req });
  assert.equal(reqSet.requirements.length, 5);
  assert.equal(reqSet.requirements[0].reuseKey, 'space-bg');
  assert.equal(reqSet.requirements[0].scope?.sceneId, 'scene.intro');
  assert.ok(reqSet.requirements.find((r) => r.composition));
  assert.ok(reqSet.requirements.find((r) => r.desiredProps));

  const fakePlan = {
    schemaVersion: '1.0.0',
    id: 'plan.x',
    planHash: 'x',
    decisions: [],
  } as never;
  const composition = storyboardSceneToCompositionSpec({
    storyboardScene: story.scenes[0],
    assetPlan: fakePlan,
    productionRequest: req,
  });
  assert.equal(composition.placements[0].layout.width, 1920);
  assert.equal(composition.scene.id, 'scene.intro');

  const bindings = story.scenes.map((scene, i) => ({
    schemaVersion: '1.0.0' as const,
    bindingMode: 'embedded-snapshot' as const,
    sourceDraft: { draftId: `d.${scene.id}`, draftRevision: 1, historyEntryId: 'h', sceneContentHash: 'c'.repeat(64) },
    scene: {
      schemaVersion: '1.0.0' as const,
      id: scene.id,
      name: scene.name,
      canvas: { width: 1920, height: 1080, backgroundColor: '#000' },
      fps: 30,
      durationInFrames: 90,
      theme: { id: 'theme.default', version: '1.0.0' },
      rootNodeId: 'root',
      nodes: {},
    },
    sceneContentHash: 'c'.repeat(64),
    dependencyFingerprint: 'd',
    catalogRevision: '1',
    motionRuntimeRevision: '1',
    sceneRuntimeRevision: '1',
    dependencies: { assets: [], animations: [], theme: { id: 'theme.default', version: '1.0.0' } },
    bindingPayloadHash: `b${i}`.padEnd(64, '0'),
  }));
  const videoPlan = storyboardToVideoPlan({ storyboard: story, sceneBindings: bindings as never, productionRequest: req });
  assert.equal(videoPlan.scenes.length, 3);
  assert.equal(videoPlan.scenes[0].id, 'entry_scene_intro');
  assert.equal(videoPlan.scenes[1].transitionToNext?.mode, 'timeline-transition');

  const narration = scriptToNarrationPlan({
    script: sampleScript(),
    storyboard: story,
    videoPlan,
    productionRequest: req,
    speakerConfiguration: [{
      id: 'spk_1',
      temporaryVoice: { provider: 'elevenlabs', voiceId: 'v1' },
    }],
  });
  assert.equal(narration.scenes.length, 3);
  assert.ok(narration.scenes[0].segments[0].pronunciationHints?.includes('Hawking'));

  const story2 = deepCloneJson(story);
  assert.deepEqual(
    storyboardToAssetRequirementSet({ storyboard: story, productionRequest: req }),
    storyboardToAssetRequirementSet({ storyboard: story2, productionRequest: req }),
  );
}

// Scale smoke (no real render)
{
  const scriptSegs = Array.from({ length: 1000 }, (_, i) => ({
    id: `seg.${i}`,
    narration: `n${i}`,
    claimIds: ['claim.event-horizon'] as string[],
  }));
  const bigScript: ExplainerScriptV1 = {
    ...sampleScript(),
    sections: [{ id: 'sec.big', purpose: 'scale', segments: scriptSegs }],
  };
  assert.equal(bigScript.sections[0].segments.length, 1000);

  const scenes = Array.from({ length: 100 }, (_, i) => ({
    id: `scene.${i}`,
    name: `S${i}`,
    purpose: 'p',
    scriptSegmentIds: [`seg.${i}`],
    claimIds: ['claim.event-horizon'],
    visualDescription: 'v',
    layout: { backgroundColor: '#000' },
    visualRequirements: Array.from({ length: 5 }, (_, j) => ({
      id: `vis_${i}_${j}`,
      name: `v${i}-${j}`,
      description: 'd',
      role: 'primary' as const,
      searchQueries: ['q'],
      placement: {
        nodeId: `node_${i}_${j}`,
        order: j,
        normalizedBox: { x: 0, y: 0, width: 0.5, height: 0.5 },
      },
    })),
  }));
  assert.equal(scenes.length, 100);
  assert.equal(scenes.reduce((n, s) => n + s.visualRequirements.length, 0), 500);
}

console.log('explainer-production-contracts.verify.ts: ok');
