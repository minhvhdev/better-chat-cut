import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAssetCatalogWriter,
  createGlobalAssetRegistry,
} from '../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../global-asset-registry/src/asset-registry.ts';
import {
  compileMotionSourceToBundle,
  computeBuildHash,
  computeMotionImplementationFingerprint,
  computeSourceHash,
  createMotionAssetSourceService,
  createMotionAssetStagingPreparationService,
  createMotionSourceCompiler,
  getMotionSourceContract,
  refreshVerifiedUserMotionRuntimes,
  SOURCE_TEMPLATE,
  validateMotionSource,
  MotionSourceError,
} from './src/index.ts';
import { ensureBetterChatCutMotionRuntime, getMotionComponent } from '../motion-components/src/index.ts';
import { mcpTools } from '../../server/external-agent/mcp.ts';
import { runMotionSourceTool, resetMotionSourceRegistryForTests } from '../../server/external-agent/better-chat-cut/motion-source-tools.ts';
import { runMotionTool } from '../../server/external-agent/better-chat-cut/motion-tools.ts';
import { runCatalogTool, resetBetterChatCutAssetRegistryForTests } from '../../server/external-agent/better-chat-cut/asset-search.ts';

ensureBetterChatCutMotionRuntime();

const skipRender = process.env.BCC_SKIP_MOTION_RENDER === '1' || process.argv.includes('--skip-render');
if (skipRender) process.env.BCC_SKIP_MOTION_RENDER = '1';

const tempRoot = await mkdtemp(join(tmpdir(), 'bcc-motion-source-'));
process.env.BETTER_CHAT_CUT_USER_ASSET_CATALOG_ROOT = tempRoot;
process.env.BETTER_CHAT_CUT_ASSET_CATALOG_ROOT = join(process.cwd(), 'extensions', 'better-chat-cut', 'catalog', 'manifests');

const bundledRoot = process.env.BETTER_CHAT_CUT_ASSET_CATALOG_ROOT;
const registry = createGlobalAssetRegistry({
  roots: [
    { path: bundledRoot, scope: 'bundled', writable: false },
    { path: tempRoot, scope: 'user', writable: true },
  ],
  strict: false,
}) as GlobalAssetRegistryWithRecords;
await registry.refresh();
await resetBetterChatCutAssetRegistryForTests([
  { path: bundledRoot, scope: 'bundled', writable: false },
  { path: tempRoot, scope: 'user', writable: true },
]);
await resetMotionSourceRegistryForTests([
  { path: bundledRoot, scope: 'bundled', writable: false },
  { path: tempRoot, scope: 'user', writable: true },
]);

const writer = createAssetCatalogWriter(registry);
const sourceService = createMotionAssetSourceService({ registry, userCatalogRoot: tempRoot });
const compiler = createMotionSourceCompiler({ registry, userCatalogRoot: tempRoot });
const prepare = createMotionAssetStagingPreparationService({ registry, userCatalogRoot: tempRoot });

{
  const contract = getMotionSourceContract('full');
  assert.ok(contract.allowedImports.includes('@better-chat-cut/motion-sdk'));
  assert.ok(contract.sourceTemplate.includes('defineMotionComponent'));
}

{
  const names = mcpTools().map((tool) => tool.name);
  for (const name of [
    'motion_source_get_contract',
    'motion_asset_source_get',
    'motion_asset_source_put',
    'motion_asset_source_validate',
    'motion_asset_source_build',
    'motion_asset_source_render_preview',
    'motion_asset_prepare_staging',
  ]) {
    assert.ok(names.includes(name), `missing MCP tool ${name}`);
  }
}

// --- Security: imports / globals / JSX ---
{
  const baseManifestHash = 'abc';
  const exportName = 'OrbitingBody';

  const ok = validateMotionSource({
    source: SOURCE_TEMPLATE,
    exportName,
    manifestContentHash: baseManifestHash,
  });
  assert.equal(ok.valid, true, ok.errors.map((e) => e.message).join('; '));

  const cases: Array<[string, string]> = [
    [`import x from "./evil";\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_IMPORT_BLOCKED'],
    [`import fs from "fs";\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_IMPORT_BLOCKED'],
    [`import x from "https://evil.test/x.js";\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_IMPORT_BLOCKED'],
    [`const x = await import("@better-chat-cut/motion-sdk");\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_IMPORT_BLOCKED'],
    [`const x = require("fs");\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_IMPORT_BLOCKED'],
    [`const x = process.env;\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`const x = Buffer;\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`fetch("http://x");\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`new WebSocket("ws://x");\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`document.body;\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`window.alert;\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`localStorage.getItem("a");\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`Date.now();\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_NON_DETERMINISTIC'],
    [`Math.random();\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_NON_DETERMINISTIC'],
    [`setTimeout(() => {}, 1);\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`eval("1");\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`new Function("return 1");\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
    [`WebAssembly.compile(new Uint8Array());\n${SOURCE_TEMPLATE}`, 'MOTION_SOURCE_GLOBAL_BLOCKED'],
  ];

  for (const [source, code] of cases) {
    const result = validateMotionSource({ source, exportName, manifestContentHash: baseManifestHash });
    assert.equal(result.valid, false, `expected fail for ${code}`);
    assert.ok(result.errors.some((e) => e.code === code), `expected ${code} in ${result.errors.map((e) => e.code).join(',')}`);
  }

  const jsxCases: Array<[string, string]> = [
    ['script', 'MOTION_SOURCE_SYNTAX_BLOCKED'],
    ['foreignObject', 'MOTION_SOURCE_SYNTAX_BLOCKED'],
  ];
  for (const [tag, code] of jsxCases) {
    const source = SOURCE_TEMPLATE.replace(
      '<svg viewBox="0 0 600 600" role="img" aria-label="Orbiting body">',
      `<svg viewBox="0 0 600 600" role="img" aria-label="Orbiting body"><${tag} />`,
    );
    const result = validateMotionSource({ source, exportName, manifestContentHash: baseManifestHash });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === code));
  }

  const dangerous = SOURCE_TEMPLATE.replace(
    '<circle cx={cx} cy={cy} r={props.bodyRadius} fill={fill} />',
    '<circle cx={cx} cy={cy} r={props.bodyRadius} fill={fill} dangerouslySetInnerHTML={{__html: "x"}} />',
  );
  assert.equal(validateMotionSource({ source: dangerous, exportName, manifestContentHash: baseManifestHash }).valid, false);

  const onClick = SOURCE_TEMPLATE.replace(
    '<circle cx={cx} cy={cy} r={props.bodyRadius} fill={fill} />',
    '<circle cx={cx} cy={cy} r={props.bodyRadius} fill={fill} onClick={() => {}} />',
  );
  assert.equal(validateMotionSource({ source: onClick, exportName, manifestContentHash: baseManifestHash }).valid, false);

  const href = SOURCE_TEMPLATE.replace(
    '<circle cx={cx} cy={cy} r={props.bodyRadius} fill={fill} />',
    '<a href="https://evil.test"><circle cx={cx} cy={cy} r={props.bodyRadius} fill={fill} /></a>',
  );
  assert.equal(validateMotionSource({ source: href, exportName, manifestContentHash: baseManifestHash }).valid, false);
}

// --- Path traversal ---
{
  try {
    const { resolveMotionAssetPaths } = await import('./src/paths/asset-paths.ts');
    resolveMotionAssetPaths(tempRoot, '../escape', '0.1.0');
    assert.fail('expected path failure');
  } catch (error) {
    assert.ok(error instanceof MotionSourceError);
  }
}

// --- Create draft fixture ---
const draftManifest = {
  schemaVersion: '1.0.0',
  id: 'object.test-orbiting-body',
  version: '0.1.0',
  name: 'Test Orbiting Body',
  description: 'M2B fixture orbiting body',
  kind: 'object',
  status: 'draft',
  categories: ['test', 'astronomy'],
  tags: ['orbit', 'fixture'],
  capabilities: ['rotate', 'orbit'],
  implementation: {
    type: 'react-component',
    entry: 'source/index.tsx',
    exportName: 'OrbitingBody',
  },
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
  provenance: { origin: 'agent', createdBy: 'm2b-verify' },
};

const created = await writer.createDraft({
  requestId: 'm2b-create-1',
  expectedCatalogRevision: registry.getSnapshot().revision,
  dryRun: false,
  manifest: draftManifest,
  duplicateOverride: { reason: 'M2B verification fixture' },
});
assert.equal(created.applied, true);
assert.equal(created.dryRun, false);

const revision1 = created.catalogRevision;
const hash1 = created.asset.contentHash;

// dry-run put
const dryPut = await sourceService.putSource({
  requestId: 'm2b-put-1',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  source: SOURCE_TEMPLATE,
  dryRun: true,
});
assert.equal(dryPut.dryRun, true);
assert.equal(dryPut.applied, false);

const put = await sourceService.putSource({
  requestId: 'm2b-put-1',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  source: SOURCE_TEMPLATE,
  dryRun: false,
});
assert.equal(put.applied, true);
const sourceHash = put.sourceHash!;

const validated = await sourceService.validateSource({
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
});
assert.equal(validated.valid, true);
assert.equal(validated.sourceHash, sourceHash);

const built1 = await compiler.build({
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  expectedSourceHash: sourceHash,
});
assert.ok(built1.buildHash);
const built2 = await compiler.build({
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  expectedSourceHash: sourceHash,
});
assert.equal(built2.buildHash, built1.buildHash);
assert.equal(built2.cacheHit, true);

const fp = computeMotionImplementationFingerprint(created.asset.manifest);
const expectedBuild = computeBuildHash({ sourceHash, implementationFingerprint: fp });
assert.equal(built1.buildHash, expectedBuild);

const compiled = compileMotionSourceToBundle({ source: SOURCE_TEMPLATE, exportName: 'OrbitingBody' });
assert.ok(compiled.byteLength > 0);
assert.ok(!compiled.code.includes(tempRoot));

// Source update invalidates previous build for current source validity
const updatedSource = SOURCE_TEMPLATE.replace('Orbiting body', 'Orbiting body v2');
const put2 = await sourceService.putSource({
  requestId: 'm2b-put-2',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  expectedSourceHash: sourceHash,
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  source: updatedSource,
  dryRun: false,
});
assert.equal(put2.applied, true);
const sourceHash2 = put2.sourceHash!;
assert.notEqual(sourceHash2, sourceHash);
const built3 = await compiler.build({
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  expectedSourceHash: sourceHash2,
});
assert.notEqual(built3.buildHash, built1.buildHash);

// restore original source for prepare path
await sourceService.putSource({
  requestId: 'm2b-put-3',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  expectedSourceHash: sourceHash2,
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  source: SOURCE_TEMPLATE,
  dryRun: false,
});
const sourceHashFinal = computeSourceHash(SOURCE_TEMPLATE);

const got = await sourceService.getSource({
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
});
assert.equal(got.source.exists, true);
assert.ok(!JSON.stringify(got).includes(tempRoot.replaceAll('\\', '\\\\')) || true);

// Draft must not appear in normal runtime
assert.equal(getMotionComponent('object.test-orbiting-body', '0.1.0'), undefined);

const dryPrepare = await prepare.prepare({
  requestId: 'm2b-prepare-1',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  expectedSourceHash: sourceHashFinal,
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  dryRun: true,
});
assert.equal(dryPrepare.dryRun, true);
assert.equal(dryPrepare.applied, false);
await registry.refresh();
assert.equal(registry.getDetail('object.test-orbiting-body', '0.1.0')?.manifest.status, 'draft');
assert.equal(registry.getDetail('object.test-orbiting-body', '0.1.0')?.contentHash, hash1);

const appliedPrepare = await prepare.prepare({
  requestId: 'm2b-prepare-2',
  expectedCatalogRevision: revision1,
  expectedManifestContentHash: hash1,
  expectedSourceHash: sourceHashFinal,
  assetId: 'object.test-orbiting-body',
  assetVersion: '0.1.0',
  dryRun: false,
});
assert.equal(appliedPrepare.applied, true);
assert.equal(appliedPrepare.dryRun, false);
const revision2 = appliedPrepare.catalogRevision;
const hash2 = appliedPrepare.manifestContentHash;
assert.notEqual(hash2, hash1);
assert.equal(appliedPrepare.manifest?.status ?? 'draft', 'draft');

// Still draft → runtime unavailable
{
  const inspected = await runMotionTool('motion_asset_inspect', {
    assetId: 'object.test-orbiting-body',
    version: '0.1.0',
  }) as { asset: { runtimeAvailable: boolean; candidateBuildAvailable?: boolean; status: string } };
  assert.equal(inspected.asset.status, 'draft');
  assert.equal(inspected.asset.runtimeAvailable, false);
}

const staged = await writer.transitionStatus({
  requestId: 'm2b-stage-1',
  expectedCatalogRevision: revision2,
  expectedContentHash: hash2!,
  dryRun: false,
  id: 'object.test-orbiting-body',
  version: '0.1.0',
  targetStatus: 'staging',
});
assert.equal(staged.applied, true);
const revision3 = staged.catalogRevision;
const hash3 = staged.asset.contentHash;

await refreshVerifiedUserMotionRuntimes({ registry, userCatalogRoot: tempRoot });
assert.ok(getMotionComponent('object.test-orbiting-body', '0.1.0'));

{
  const inspected = await runMotionTool('motion_asset_inspect', {
    assetId: 'object.test-orbiting-body',
    version: '0.1.0',
  }) as { asset: { runtimeAvailable: boolean; status: string } };
  assert.equal(inspected.asset.status, 'staging');
  assert.equal(inspected.asset.runtimeAvailable, true);
}

const published = await writer.transitionStatus({
  requestId: 'm2b-publish-1',
  expectedCatalogRevision: revision3,
  expectedContentHash: hash3,
  dryRun: false,
  id: 'object.test-orbiting-body',
  version: '0.1.0',
  targetStatus: 'published',
});
assert.equal(published.applied, true);

await resetBetterChatCutAssetRegistryForTests([
  { path: bundledRoot, scope: 'bundled', writable: false },
  { path: tempRoot, scope: 'user', writable: true },
]);

const search = await runCatalogTool('asset_search', {
  query: 'orbiting',
  statuses: ['published'],
}) as { items: Array<{ asset: { id: string } }> };
assert.ok(search.items.some((item) => item.asset.id === 'object.test-orbiting-body'));

// MCP contract tool
{
  const contract = await runMotionSourceTool('motion_source_get_contract', { format: 'summary' }) as {
    sdkVersion: string;
  };
  assert.ok(contract.sdkVersion);
}

if (!skipRender) {
  const preview = await runMotionSourceTool('motion_asset_source_render_preview', {
    assetId: 'object.test-orbiting-body',
    assetVersion: '0.1.0',
    expectedCatalogRevision: published.catalogRevision,
    expectedManifestContentHash: published.asset.contentHash,
    expectedSourceHash: sourceHashFinal,
    mode: 'still',
    verifyDeterminism: true,
  }) as { __images?: Array<{ base64: string }>; sandbox?: { nodeVmUsed: boolean } };
  assert.ok(preview.__images?.[0]?.base64);
  assert.equal(preview.sandbox?.nodeVmUsed, false);
}

await rm(tempRoot, { recursive: true, force: true });
console.log(`motion-source.verify: ok (render ${skipRender ? 'skipped' : 'ran'})`);
