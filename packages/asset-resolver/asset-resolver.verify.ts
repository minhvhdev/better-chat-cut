import {
  ASSET_REQUIREMENT_LIMITS,
  ASSET_REQUIREMENT_SCHEMA_VERSION,
  ASSET_PLAN_SCHEMA_VERSION,
  createBatchAssetResolver,
  computeAssetResolverRevision,
  validateAndNormalizeRequirementSet,
  stableStringify,
  ASSET_RESOLVER_SCORE_WEIGHTS,
  DEFAULT_RESOLUTION_POLICY,
  type AssetRequirementSetV1,
  type AssetPlanV1,
} from './src/index.ts';
import {
  createGlobalAssetRegistry,
  createAssetCatalogWriter,
} from '../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../global-asset-registry/src/asset-registry.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import {
  createMotionAssetSourceService,
  createMotionSourceCompiler,
  createMotionAssetStagingPreparationService,
  refreshVerifiedUserMotionRuntimes,
  computeSourceHash,
  SOURCE_TEMPLATE,
} from '../motion-source-pipeline/src/index.ts';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { mcpTools } from '../../server/external-agent/mcp.ts';
import { resetAssetResolverRegistryForTests } from '../../server/external-agent/better-chat-cut/asset-resolver-tools.ts';
import { runAssetResolverTool } from '../../server/external-agent/better-chat-cut/asset-resolver-tools.ts';

ensureBetterChatCutMotionRuntime();

function assertDeterminismGuard(root: string) {
  const banned = [
    'Math.random(',
    'Date.now(',
    'new Date(',
    'performance.now(',
    'setTimeout(',
    'setInterval(',
    'requestAnimationFrame(',
  ];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        for (const token of banned) {
          assert.equal(text.includes(token), false, `${path} contains banned token ${token}`);
        }
      }
    }
  };
  walk(root);
}

{
  assertDeterminismGuard(join(process.cwd(), 'packages/asset-resolver/src/scoring'));
  assertDeterminismGuard(join(process.cwd(), 'packages/asset-resolver/src/strategies'));
  assertDeterminismGuard(join(process.cwd(), 'packages/asset-resolver/src/planning'));
  assertDeterminismGuard(join(process.cwd(), 'packages/asset-resolver/src/runtime'));
}

{
  const sum = Object.values(ASSET_RESOLVER_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
}

{
  const invalid = validateAndNormalizeRequirementSet({
    schemaVersion: '9.9.9',
    id: 'requirements.bad',
    requirements: [],
  });
  assert.equal(invalid.valid, false);

  const unknown = validateAndNormalizeRequirementSet(JSON.parse(
    readFileSync(join(process.cwd(), 'packages/asset-resolver/src/fixtures/invalid/unknown-field.json'), 'utf8'),
  ));
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some((e) => e.message.includes('Unknown')));

  const dup = validateAndNormalizeRequirementSet({
    schemaVersion: ASSET_REQUIREMENT_SCHEMA_VERSION,
    id: 'requirements.dup',
    requirements: [
      { id: 'a', name: 'A', description: 'A', search: { queries: ['a'] } },
      { id: 'a', name: 'B', description: 'B', search: { queries: ['b'] } },
    ],
  });
  assert.equal(dup.valid, false);

  const emptySearch = validateAndNormalizeRequirementSet({
    schemaVersion: ASSET_REQUIREMENT_SCHEMA_VERSION,
    id: 'requirements.empty-search',
    requirements: [{ id: 'a', name: 'A', description: 'A', search: { queries: [] } }],
  });
  assert.equal(emptySearch.valid, false);

  const circular: Record<string, unknown> = { schemaVersion: '1.0.0', id: 'requirements.circ', requirements: [] };
  circular.self = circular;
  const circ = validateAndNormalizeRequirementSet(circular);
  assert.equal(circ.valid, false);

  const nanProps = validateAndNormalizeRequirementSet({
    schemaVersion: ASSET_REQUIREMENT_SCHEMA_VERSION,
    id: 'requirements.nan',
    requirements: [{
      id: 'a',
      name: 'A',
      description: 'A',
      search: { queries: ['a'] },
      desiredProps: { x: Number.NaN },
    }],
  });
  assert.equal(nanProps.valid, false);

  const valid = validateAndNormalizeRequirementSet(JSON.parse(
    readFileSync(join(process.cwd(), 'packages/asset-resolver/src/fixtures/valid/direct-arrow.json'), 'utf8'),
  ));
  assert.equal(valid.valid, true);
  assert.ok(valid.requirementSetHash);

  const clone = structuredClone(valid.normalizedRequirementSet);
  const before = stableStringify(clone);
  validateAndNormalizeRequirementSet(clone);
  assert.equal(stableStringify(clone), before);

  const orderA = validateAndNormalizeRequirementSet({
    schemaVersion: '1.0.0',
    id: 'requirements.hash-order',
    requirements: [{
      id: 'a',
      name: 'A',
      description: 'A',
      search: { queries: ['arrow'] },
      tags: ['b', 'a'],
      desiredProps: { stroke: 'red', length: 10 },
    }],
  });
  const orderB = validateAndNormalizeRequirementSet({
    schemaVersion: '1.0.0',
    id: 'requirements.hash-order',
    requirements: [{
      id: 'a',
      name: 'A',
      description: 'A',
      search: { queries: ['arrow'] },
      tags: ['a', 'b'],
      desiredProps: { length: 10, stroke: 'red' },
    }],
  });
  assert.equal(orderA.requirementSetHash, orderB.requirementSetHash);

  const queryOrderA = validateAndNormalizeRequirementSet({
    schemaVersion: '1.0.0',
    id: 'requirements.query-order',
    requirements: [{ id: 'a', name: 'A', description: 'A', search: { queries: ['arrow', 'pointer'] } }],
  });
  const queryOrderB = validateAndNormalizeRequirementSet({
    schemaVersion: '1.0.0',
    id: 'requirements.query-order',
    requirements: [{ id: 'a', name: 'A', description: 'A', search: { queries: ['pointer', 'arrow'] } }],
  });
  assert.notEqual(queryOrderA.requirementSetHash, queryOrderB.requirementSetHash);
}

const bundledRoot = join(process.cwd(), 'extensions', 'better-chat-cut', 'catalog', 'manifests');
const tempRoot = mkdtempSync(join(tmpdir(), 'bcc-asset-resolver-'));
process.env.BETTER_CHAT_CUT_USER_ASSET_CATALOG_ROOT = tempRoot;
process.env.BETTER_CHAT_CUT_ASSET_CATALOG_ROOT = bundledRoot;

const registry = createGlobalAssetRegistry({
  roots: [
    { path: bundledRoot, scope: 'bundled', writable: false },
    { path: tempRoot, scope: 'user', writable: true },
  ],
  strict: false,
}) as GlobalAssetRegistryWithRecords;
await registry.refresh();
await resetAssetResolverRegistryForTests([
  { path: bundledRoot, scope: 'bundled', writable: false },
  { path: tempRoot, scope: 'user', writable: true },
]);

const resolver = createBatchAssetResolver({ registry });

{
  const names = mcpTools().map((t) => t.name);
  for (const name of [
    'asset_resolver_get_contract',
    'asset_requirements_validate',
    'asset_resolve_batch',
    'asset_plan_validate',
    'asset_search',
    'scene_get_contract',
  ]) {
    assert.ok(names.includes(name), `missing MCP tool ${name}`);
  }
}

{
  const directSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.hawking-direct',
    requirements: [{
      id: 'mainArrow',
      name: 'Arrow',
      description: 'Explanation arrow',
      search: { queries: ['arrow'] },
      kinds: { preferred: ['primitive'] },
      tags: ['arrow'],
    }],
  };
  const a = await resolver.resolveBatch({ requirementSet: directSet });
  const b = await resolver.resolveBatch({ requirementSet: directSet });
  assert.equal(a.plan.planHash, b.plan.planHash);
  assert.equal(a.plan.decisions[0]?.strategy, 'reuse');
  assert.equal(a.plan.decisions[0]?.selection?.asset.id, 'primitive.arrow');
  assert.equal(a.plan.decisions[0]?.selection?.asset.version, '1.0.0');
  assert.ok(a.plan.decisions[0]?.selection?.asset.contentHash);
  assert.equal(a.resolverRevision, computeAssetResolverRevision());
}

{
  const variantSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.variant-circle',
    requirements: [{
      id: 'bigCircle',
      name: 'Circle',
      description: 'Large circle',
      search: { queries: ['circle'] },
      exactAsset: { id: 'primitive.circle', version: '1.0.0' },
      desiredProps: { radius: 120, fill: '#ff0000' },
    }],
  };
  const result = await resolver.resolveBatch({ requirementSet: variantSet });
  // exact pin with differing props => exact strategy (exact wins); also test non-exact variant
  assert.equal(result.plan.decisions[0]?.strategy, 'exact');
  assert.equal(result.plan.decisions[0]?.selection?.props.radius, 120);

  const variantNoExact: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.variant-circle-2',
    requirements: [{
      id: 'bigCircle',
      name: 'Circle',
      description: 'Large circle primitive',
      search: { queries: ['circle', 'primitive.circle'] },
      preferredAssetIds: ['primitive.circle'],
      kinds: { preferred: ['primitive'] },
      desiredProps: { radius: 120, fill: '#00ff00' },
    }],
  };
  const v2 = await resolver.resolveBatch({ requirementSet: variantNoExact });
  assert.equal(v2.plan.decisions[0]?.selection?.asset.id, 'primitive.circle');
  assert.equal(v2.plan.decisions[0]?.strategy, 'variant');
}

{
  const labelSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.label-variant',
    requirements: [{
      id: 'title',
      name: 'Label',
      description: 'Title label',
      search: { queries: ['label'] },
      preferredAssetIds: ['ui.label'],
      kinds: { preferred: ['ui'] },
      desiredProps: { text: 'Hawking', fontSize: 48, color: '#ffffff' },
    }],
  };
  const result = await resolver.resolveBatch({ requirementSet: labelSet });
  assert.equal(result.plan.decisions[0]?.selection?.asset.id, 'ui.label');
  assert.equal(result.plan.decisions[0]?.strategy, 'variant');
}

{
  const reuseSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.reuse-arrow',
    requirements: [
      {
        id: 'arrowScene1',
        name: 'Arrow',
        description: 'Arrow scene 1',
        scope: { sceneId: 'intro' },
        search: { queries: ['arrow'] },
        reuseKey: 'main-explanation-arrow',
        kinds: { preferred: ['primitive'] },
      },
      {
        id: 'arrowScene2',
        name: 'Arrow',
        description: 'Arrow scene 2',
        scope: { sceneId: 'explain' },
        search: { queries: ['arrow'] },
        reuseKey: 'main-explanation-arrow',
        kinds: { preferred: ['primitive'] },
      },
      {
        id: 'arrowScene3',
        name: 'Arrow',
        description: 'Arrow scene 3',
        scope: { sceneId: 'outro' },
        search: { queries: ['arrow'] },
        reuseKey: 'main-explanation-arrow',
        kinds: { preferred: ['primitive'] },
      },
    ],
  };
  const result = await resolver.resolveBatch({ requirementSet: reuseSet });
  const ids = result.plan.decisions.map((d) => `${d.selection?.asset.id}@${d.selection?.asset.version}`);
  assert.equal(new Set(ids).size, 1);
  assert.equal(ids[0], 'primitive.arrow@1.0.0');
  assert.ok(result.plan.summary.reusedAssetAssignments >= 2);
}

{
  // Synthetic character manifests for distinct group (direct staging files; no runtime required)
  for (const [id, name] of [
    ['character.test-alpha', 'Alpha Character'],
    ['character.test-beta', 'Beta Character'],
    ['character.test-gamma', 'Gamma Character'],
  ] as const) {
    const dir = join(tempRoot, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '0.1.0.asset.json'), JSON.stringify({
      schemaVersion: '1.0.0',
      id,
      version: '0.1.0',
      name,
      description: `${name} for distinct tests`,
      kind: 'character',
      status: 'staging',
      categories: ['test'],
      tags: ['character', name.toLowerCase().split(' ')[0]!],
      capabilities: ['render'],
      implementation: { type: 'react-component', entry: 'components/Placeholder.tsx', exportName: 'Placeholder' },
      license: { spdx: 'AGPL-3.0-or-later' },
    }, null, 2));
  }
  await registry.refresh();

  const distinctSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.distinct-characters',
    defaultPolicy: {
      allowedStatuses: ['staging', 'published'],
      requireRuntime: false,
      minimumScore: 0.2,
    },
    requirements: [
      {
        id: 'charA',
        name: 'Alpha Character',
        description: 'Alpha Character',
        priority: 'critical',
        search: { queries: ['alpha character'] },
        kinds: { preferred: ['character'] },
        preferredAssetIds: ['character.test-alpha'],
        distinctKey: 'three-different-characters',
      },
      {
        id: 'charB',
        name: 'Beta Character',
        description: 'Beta Character',
        priority: 'high',
        search: { queries: ['beta character'] },
        kinds: { preferred: ['character'] },
        preferredAssetIds: ['character.test-beta'],
        distinctKey: 'three-different-characters',
      },
      {
        id: 'charC',
        name: 'Gamma Character',
        description: 'Gamma Character',
        priority: 'normal',
        search: { queries: ['gamma character'] },
        kinds: { preferred: ['character'] },
        preferredAssetIds: ['character.test-gamma'],
        distinctKey: 'three-different-characters',
      },
    ],
  };
  const result = await resolver.resolveBatch({ requirementSet: distinctSet });
  const selected = result.plan.decisions.map((d) => d.selection?.asset.id).filter(Boolean);
  assert.equal(new Set(selected).size, 3);
}

{
  const compositionSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.labelled-planet',
    requirements: [{
      id: 'labelledPlanet',
      name: 'Labelled planet',
      description: 'Planet with label',
      mode: 'composition',
      search: { queries: ['labelled planet'] },
      composition: {
        layoutHint: 'labelled',
        parts: [
          {
            id: 'body',
            role: 'body',
            search: { queries: ['circle'] },
            kinds: { preferred: ['primitive'] },
            preferredAssetIds: ['primitive.circle'],
          },
          {
            id: 'label',
            role: 'label',
            search: { queries: ['label'] },
            kinds: { preferred: ['ui'] },
            preferredAssetIds: ['ui.label'],
            desiredProps: { text: 'Earth' },
          },
        ],
      },
    }],
  };
  const result = await resolver.resolveBatch({ requirementSet: compositionSet });
  assert.equal(result.plan.decisions[0]?.strategy, 'composition');
  assert.ok(result.plan.decisions[0]?.composition);
  assert.equal(result.plan.decisions[0]?.composition?.parts.length, 2);
  assert.equal(JSON.stringify(result.plan).includes('SceneDocument'), false);
}

{
  const optionalSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.optional-unresolved',
    requirements: [
      {
        id: 'bg',
        name: 'Solid Background',
        description: 'Background',
        search: { queries: ['solid background'] },
        preferredAssetIds: ['background.solid'],
      },
      {
        id: 'decoration',
        name: 'Totally Unique Decoration Never Seen',
        description: 'A one-off decorative flourish that does not exist in catalog',
        optional: true,
        search: { queries: ['zzzxxyy-unique-decoration-qwerty'] },
        kinds: { preferred: ['effect'] },
        requiredCapabilities: ['nonexistent-capability-xyz'],
      },
    ],
  };
  const result = await resolver.resolveBatch({ requirementSet: optionalSet });
  assert.equal(result.plan.decisions.find((d) => d.requirementId === 'decoration')?.status, 'skipped');
  assert.equal(result.plan.complete, true);
}

{
  const duplicateSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.duplicate-arrow-name',
    defaultPolicy: { minimumScore: 0.99, allowCreationBrief: true },
    requirements: [{
      id: 'almostArrow',
      name: 'Arrow',
      description: 'Reusable arrow primitive',
      search: { queries: ['zzznomatchquery'], aliases: ['arrow'] },
      kinds: { preferred: ['primitive'] },
      tags: ['arrow'],
      requiredCapabilities: ['totally-missing-capability'],
    }],
  };
  const result = await resolver.resolveBatch({ requirementSet: duplicateSet });
  const decision = result.plan.decisions[0]!;
  assert.equal(decision.status, 'blocked');
  assert.equal(decision.strategy, 'review-duplicate');
  assert.ok(decision.duplicateReview?.blocksCreationBrief);
}

{
  const createSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.creation-brief',
    defaultPolicy: { minimumScore: 0.95, allowCreationBrief: true },
    requirements: [{
      id: 'customDiagram',
      name: 'Hawking Particle Pair Diagram',
      description: 'Custom diagram of virtual particle pairs near an event horizon',
      search: { queries: ['zzzxxyy-hawking-particle-pair-diagram-unique'] },
      kinds: { preferred: ['diagram'] },
      categories: ['physics'],
      tags: ['hawking', 'particles'],
      requiredCapabilities: ['nonexistent-diagram-capability'],
    }],
  };
  const result = await resolver.resolveBatch({ requirementSet: createSet });
  const decision = result.plan.decisions[0]!;
  assert.equal(decision.strategy, 'create-new');
  assert.ok(decision.creationBrief);
  assert.equal(decision.creationBrief?.suggestedVersion, '0.1.0');
  assert.ok(decision.creationBrief?.suggestedId.startsWith('diagram.'));
  assert.equal(decision.creationBrief?.suggestedId.includes('uuid'), false);
}

{
  const planSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.plan-validate',
    requirements: [{
      id: 'arrow',
      name: 'Arrow',
      description: 'Arrow',
      search: { queries: ['arrow'] },
    }],
  };
  const resolved = await resolver.resolveBatch({ requirementSet: planSet });
  const validated = await resolver.validatePlan({ plan: resolved.plan });
  assert.equal(validated.valid, true);
  assert.equal(validated.planHashValid, true);

  const tampered: AssetPlanV1 = { ...resolved.plan, planHash: '0'.repeat(64) };
  const badHash = await resolver.validatePlan({ plan: tampered });
  assert.equal(badHash.valid, false);
  assert.equal(badHash.planHashValid, false);

  // Unrelated catalog change => stale but reusable
  const unrelatedDir = join(tempRoot, 'object.unrelated-fixture');
  mkdirSync(unrelatedDir, { recursive: true });
  writeFileSync(join(unrelatedDir, '0.1.0.asset.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    id: 'object.unrelated-fixture',
    version: '0.1.0',
    name: 'Unrelated',
    description: 'Unrelated fixture asset',
    kind: 'object',
    status: 'draft',
    categories: ['test'],
    tags: ['fixture'],
    capabilities: ['render'],
    implementation: { type: 'react-component', entry: 'components/X.tsx', exportName: 'X' },
    license: { spdx: 'AGPL-3.0-or-later' },
  }, null, 2));
  const afterCatalog = await resolver.validatePlan({ plan: resolved.plan });
  assert.equal(afterCatalog.valid, true);
  assert.equal(afterCatalog.stale, true);
  assert.equal(afterCatalog.reusable, true);
  assert.ok(afterCatalog.warnings.some((w) => w.code === 'CATALOG_REVISION_CHANGED_DEPENDENCIES_STABLE'));
}

// Performance: synthetic catalog + requirements without blowing evaluation budget
{
  const synthRoot = join(tempRoot, 'synth');
  mkdirSync(synthRoot, { recursive: true });
  for (let i = 0; i < 200; i += 1) {
    const id = `object.synth-${String(i).padStart(4, '0')}`;
    const dir = join(synthRoot, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '0.1.0.asset.json'), JSON.stringify({
      schemaVersion: '1.0.0',
      id,
      version: '0.1.0',
      name: `Synth ${i}`,
      description: `Synthetic asset ${i}`,
      kind: 'object',
      status: 'published',
      categories: ['synth'],
      tags: [`tag-${i % 20}`],
      capabilities: ['render'],
      implementation: { type: 'react-component', entry: 'components/X.tsx', exportName: 'X' },
      license: { spdx: 'AGPL-3.0-or-later' },
    }, null, 2));
  }
  const synthRegistry = createGlobalAssetRegistry({
    roots: [
      { path: bundledRoot, scope: 'bundled', writable: false },
      { path: synthRoot, scope: 'user', writable: false },
    ],
    strict: false,
  }) as GlobalAssetRegistryWithRecords;
  await synthRegistry.refresh();
  const synthResolver = createBatchAssetResolver({ registry: synthRegistry });
  const requirements = Array.from({ length: 40 }, (_, i) => ({
    id: `req${i}`,
    name: `Synth ${i}`,
    description: `Need synth ${i}`,
    search: { queries: [`synth-${String(i).padStart(4, '0')}`, 'object'] },
    kinds: { preferred: ['object'] as const },
  }));
  const bigSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.perf',
    defaultPolicy: { requireRuntime: false, minimumScore: 0.3, allowedStatuses: ['published'] },
    requirements,
  };
  const once = await synthResolver.resolveBatch({ requirementSet: bigSet, includeCandidates: false });
  const twice = await synthResolver.resolveBatch({ requirementSet: bigSet, includeCandidates: false });
  assert.equal(once.plan.planHash, twice.plan.planHash);
  assert.ok(!once.diagnostics.some((d) => d.code === 'ASSET_RESOLVER_EVALUATION_LIMIT_REACHED'));
  assert.ok(once.plan.decisions.every((d) => !d.candidates || d.candidates.length <= ASSET_REQUIREMENT_LIMITS.MAX_CANDIDATES_PER_REQUIREMENT));
}

// E2E with verified user runtime (orbiting body) — reuse M2B pipeline
{
  await registry.refresh();
  const writer = createAssetCatalogWriter(registry);
  const sourceService = createMotionAssetSourceService({ registry, userCatalogRoot: tempRoot });
  const compiler = createMotionSourceCompiler({ registry, userCatalogRoot: tempRoot });
  const prepare = createMotionAssetStagingPreparationService({ registry, userCatalogRoot: tempRoot });

  const created = await writer.createDraft({
    requestId: 'm3b-create-orbit',
    expectedCatalogRevision: registry.getSnapshot().revision,
    dryRun: false,
    duplicateOverride: { reason: 'M3B resolver verification fixture' },
    manifest: {
      schemaVersion: '1.0.0',
      id: 'object.test-orbiting-body',
      version: '0.1.0',
      name: 'Orbiting Body',
      description: 'Test orbiting body',
      kind: 'object',
      status: 'draft',
      categories: ['test'],
      tags: ['orbit'],
      capabilities: ['render', 'orbit'],
      implementation: { type: 'react-component', entry: 'source/index.tsx', exportName: 'OrbitingBody' },
      propsSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          bodyRadius: { type: 'number', minimum: 1, maximum: 200, default: 24 },
          orbitRadius: { type: 'number', minimum: 1, maximum: 400, default: 120 },
          fill: { type: 'string', default: '#38bdf8' },
          orbitColor: { type: 'string', default: '#64748b' },
        },
      },
      license: { spdx: 'AGPL-3.0-or-later' },
      provenance: { origin: 'agent', createdBy: 'm3b-verify' },
    },
  });
  assert.equal(created.applied, true);
  const revision = created.catalogRevision!;
  const hash = created.asset!.contentHash;

  const put = await sourceService.putSource({
    requestId: 'm3b-put-orbit',
    expectedCatalogRevision: revision,
    expectedManifestContentHash: hash,
    assetId: 'object.test-orbiting-body',
    assetVersion: '0.1.0',
    source: SOURCE_TEMPLATE,
    dryRun: false,
  });
  assert.equal(put.applied, true);
  const sourceHash = put.sourceHash!;

  const built = await compiler.build({
    assetId: 'object.test-orbiting-body',
    assetVersion: '0.1.0',
    expectedCatalogRevision: revision,
    expectedManifestContentHash: hash,
    expectedSourceHash: sourceHash,
  });
  assert.ok(built.buildHash);

  const prepared = await prepare.prepare({
    requestId: 'm3b-prepare-orbit',
    expectedCatalogRevision: revision,
    expectedManifestContentHash: hash,
    expectedSourceHash: computeSourceHash(SOURCE_TEMPLATE),
    assetId: 'object.test-orbiting-body',
    assetVersion: '0.1.0',
    dryRun: false,
  });
  assert.equal(prepared.applied, true);
  assert.ok(prepared.manifestContentHash);
  assert.ok(prepared.catalogRevision);

  const staged = await writer.transitionStatus({
    requestId: 'm3b-stage-orbit',
    expectedCatalogRevision: prepared.catalogRevision!,
    expectedContentHash: prepared.manifestContentHash!,
    dryRun: false,
    id: 'object.test-orbiting-body',
    version: '0.1.0',
    targetStatus: 'staging',
  });
  assert.equal(staged.applied, true);
  assert.equal(staged.asset?.manifest.status, 'staging');
  await registry.refresh();
  await refreshVerifiedUserMotionRuntimes({ registry, userCatalogRoot: tempRoot });

  const e2eSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.e2e-batch',
    theme: { id: 'better-chat-cut.default', version: '1.0.0' },
    defaultPolicy: { allowedStatuses: ['published', 'staging'] },
    requirements: [
      {
        id: 'introBg',
        scope: { sceneId: 'intro' },
        name: 'Solid Background',
        description: 'Intro background',
        search: { queries: ['solid background'] },
        preferredAssetIds: ['background.solid'],
      },
      {
        id: 'introTitle',
        scope: { sceneId: 'intro' },
        name: 'Label',
        description: 'Main title',
        search: { queries: ['label'] },
        preferredAssetIds: ['ui.label'],
        desiredProps: { text: 'Hawking Radiation', fontSize: 42 },
      },
      {
        id: 'introBody',
        scope: { sceneId: 'intro' },
        name: 'Orbiting Body',
        description: 'Orbiting body',
        search: { queries: ['orbiting body'] },
        preferredAssetIds: ['object.test-orbiting-body'],
        reuseKey: 'main-orbiting-body',
      },
      {
        id: 'introArrow',
        scope: { sceneId: 'intro' },
        name: 'Arrow',
        description: 'Arrow',
        search: { queries: ['arrow'] },
      },
      {
        id: 'explainBody',
        scope: { sceneId: 'explanation' },
        name: 'Orbiting Body',
        description: 'Same orbiting body',
        search: { queries: ['orbiting body'] },
        preferredAssetIds: ['object.test-orbiting-body'],
        reuseKey: 'main-orbiting-body',
      },
      {
        id: 'explainArrow',
        scope: { sceneId: 'explanation' },
        name: 'Arrow',
        description: 'Arrow variant',
        search: { queries: ['arrow'] },
        desiredProps: { length: 320, stroke: '#88aaff' },
      },
      {
        id: 'explainLabel',
        scope: { sceneId: 'explanation' },
        name: 'Label',
        description: 'Label variant',
        search: { queries: ['label'] },
        preferredAssetIds: ['ui.label'],
        desiredProps: { text: 'Event horizon', fontSize: 28 },
      },
      {
        id: 'explainComp',
        scope: { sceneId: 'explanation' },
        name: 'Labelled circle',
        description: 'Composition circle + label',
        mode: 'composition',
        search: { queries: ['labelled circle'] },
        composition: {
          layoutHint: 'labelled',
          parts: [
            { id: 'body', role: 'body', search: { queries: ['circle'] }, preferredAssetIds: ['primitive.circle'] },
            { id: 'label', role: 'label', search: { queries: ['label'] }, preferredAssetIds: ['ui.label'], desiredProps: { text: 'Planet' } },
          ],
        },
      },
      {
        id: 'missingDiagram',
        scope: { sceneId: 'unresolved' },
        name: 'Custom Quantum Foam Diagram',
        description: 'A custom quantum foam diagram that does not exist',
        search: { queries: ['zzzxxyy-quantum-foam-diagram-unique'] },
        kinds: { preferred: ['diagram'] },
        requiredCapabilities: ['nonexistent-foam-capability'],
      },
      {
        id: 'optionalDecor',
        scope: { sceneId: 'unresolved' },
        name: 'Optional Sparkle',
        description: 'Optional missing decoration',
        optional: true,
        search: { queries: ['zzzxxyy-optional-sparkle'] },
        kinds: { preferred: ['effect'] },
        requiredCapabilities: ['nonexistent-sparkle'],
      },
      {
        id: 'dupArrow',
        scope: { sceneId: 'unresolved' },
        name: 'Arrow',
        description: 'Reusable arrow primitive',
        search: { queries: ['zzznomatch'], aliases: ['arrow'] },
        kinds: { preferred: ['primitive'] },
        tags: ['arrow'],
        requiredCapabilities: ['missing-cap-for-dup'],
        policy: { minimumScore: 0.99 },
      },
    ],
  };

  const validated = resolver.validateRequirements(e2eSet);
  assert.equal(validated.valid, true);
  const resolved = await resolver.resolveBatch({ requirementSet: e2eSet });
  assert.equal(resolved.plan.decisions.find((d) => d.requirementId === 'introBody')?.selection?.asset.id, 'object.test-orbiting-body');
  assert.equal(resolved.plan.decisions.find((d) => d.requirementId === 'explainBody')?.selection?.asset.id, 'object.test-orbiting-body');
  assert.equal(resolved.plan.decisions.find((d) => d.requirementId === 'explainArrow')?.strategy, 'variant');
  assert.equal(resolved.plan.decisions.find((d) => d.requirementId === 'explainComp')?.strategy, 'composition');
  assert.equal(resolved.plan.decisions.find((d) => d.requirementId === 'missingDiagram')?.strategy, 'create-new');
  assert.equal(resolved.plan.decisions.find((d) => d.requirementId === 'optionalDecor')?.status, 'skipped');
  assert.equal(resolved.plan.decisions.find((d) => d.requirementId === 'dupArrow')?.strategy, 'review-duplicate');
  assert.ok(resolved.plan.planHash);

  const planOk = await resolver.validatePlan({ plan: resolved.plan });
  assert.equal(planOk.valid, true);

  // MCP path also works
  const mcpResolved = await runAssetResolverTool('asset_resolve_batch', { requirementSet: e2eSet }) as {
    plan: { planHash: string };
  };
  assert.equal(mcpResolved.plan.planHash, resolved.plan.planHash);

  // Non-mutation: orbiting body still staging
  assert.equal(registry.getDetail('object.test-orbiting-body', '0.1.0')?.manifest.status, 'staging');
}

assert.equal(ASSET_PLAN_SCHEMA_VERSION, '1.0.0');
assert.equal(DEFAULT_RESOLUTION_POLICY.allowedStatuses.includes('draft'), false);

rmSync(tempRoot, { recursive: true, force: true });
console.log('asset-resolver.verify: ok');
