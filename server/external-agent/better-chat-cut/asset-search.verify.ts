import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mcpTools } from '../mcp.ts';
import {
  parseAssetSearchInput,
  resetBetterChatCutAssetRegistryForTests,
  runCatalogTool,
} from './asset-search.ts';
import { AssetRegistryError } from '../../../packages/global-asset-registry/src/index.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/global-asset-registry/fixtures/valid');

{
  const names = mcpTools().map((tool) => tool.name);
  for (const name of [
    'asset_search',
    'asset_get',
    'asset_validate_manifest',
    'asset_find_similar',
    'asset_create_draft',
    'asset_update_draft',
    'asset_transition_status',
  ]) {
    assert.ok(names.includes(name), `${name} must appear in tools/list`);
  }
}

{
  const userRoot = await mkdtemp(join(tmpdir(), 'bcc-user-catalog-'));
  await resetBetterChatCutAssetRegistryForTests([
    { path: fixtures, scope: 'bundled', writable: false },
    { path: userRoot, scope: 'user', writable: true },
  ]);

  const searched = await runCatalogTool('asset_search', { query: 'trai dat' });
  assert.ok((searched as { total: number }).total >= 1);

  const got = await runCatalogTool('asset_get', { id: 'object.earth' }) as {
    asset: { contentHash: string } | null;
    catalogRevision: string;
  };
  assert.ok(got.asset);

  const validated = await runCatalogTool('asset_validate_manifest', {
    manifest: {
      schemaVersion: '1.0.0',
      id: 'object.meteor',
      version: '0.1.0',
      name: 'Meteor',
      description: 'Draft meteor',
      kind: 'object',
      status: 'draft',
      categories: ['astronomy'],
      tags: ['meteor'],
      capabilities: ['fly'],
      implementation: { type: 'svg', entry: 'svg/meteor.svg' },
      license: { spdx: 'MIT' },
    },
  }) as { valid: boolean; contentHash?: string };
  assert.equal(validated.valid, true);

  process.env.BETTER_CHAT_CUT_USER_ASSET_CATALOG_ROOT = userRoot;
  await resetBetterChatCutAssetRegistryForTests([
    { path: fixtures, scope: 'bundled', writable: false },
    { path: userRoot, scope: 'user', writable: true },
  ]);

  const revision = (await runCatalogTool('asset_search', {})) as { catalogRevision: string };
  const dry = await runCatalogTool('asset_create_draft', {
    requestId: randomUUID(),
    expectedCatalogRevision: revision.catalogRevision,
    manifest: {
      schemaVersion: '1.0.0',
      id: 'object.meteor',
      version: '0.1.0',
      name: 'Meteor',
      description: 'Draft meteor',
      kind: 'object',
      status: 'draft',
      categories: ['astronomy'],
      tags: ['meteor'],
      capabilities: ['fly'],
      implementation: { type: 'svg', entry: 'svg/meteor.svg' },
      license: { spdx: 'MIT' },
    },
    dryRun: true,
  }) as { applied: boolean; dryRun: boolean };
  assert.equal(dry.applied, false);
  assert.equal(dry.dryRun, true);

  const created = await runCatalogTool('asset_create_draft', {
    requestId: randomUUID(),
    expectedCatalogRevision: revision.catalogRevision,
    manifest: {
      schemaVersion: '1.0.0',
      id: 'object.meteor',
      version: '0.1.0',
      name: 'Meteor',
      description: 'Draft meteor',
      kind: 'object',
      status: 'draft',
      categories: ['astronomy'],
      tags: ['meteor'],
      capabilities: ['fly'],
      implementation: { type: 'svg', entry: 'svg/meteor.svg' },
      license: { spdx: 'MIT' },
    },
    dryRun: false,
  }) as { applied: boolean; asset: { contentHash: string; manifest: { status: string } }; catalogRevision: string };
  assert.equal(created.applied, true);
  assert.equal(created.asset.manifest.status, 'draft');

  const staged = await runCatalogTool('asset_transition_status', {
    requestId: randomUUID(),
    expectedCatalogRevision: created.catalogRevision,
    expectedContentHash: created.asset.contentHash,
    id: 'object.meteor',
    version: '0.1.0',
    targetStatus: 'staging',
    dryRun: false,
  }) as { applied: boolean; asset: { manifest: { status: string } } };
  assert.equal(staged.applied, true);
  assert.equal(staged.asset.manifest.status, 'staging');

  assert.throws(() => parseAssetSearchInput({ limit: 0 }), (error: unknown) => (
    error instanceof AssetRegistryError && error.field === 'limit'
  ));

  await rm(userRoot, { recursive: true, force: true });
}

console.log('better-chat-cut catalog tools verification passed');
