import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mcpTools } from '../mcp.ts';
import {
  parseAssetSearchInput,
  resetBetterChatCutAssetRegistryForTests,
  runAssetSearch,
  ASSET_SEARCH_TOOL,
} from './asset-search.ts';
import { AssetRegistryError } from '../../../packages/global-asset-registry/src/index.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/global-asset-registry/fixtures/valid');

{
  const tools = mcpTools();
  const assetSearch = tools.find((tool) => tool.name === 'asset_search');
  assert.ok(assetSearch, 'asset_search must appear in tools/list');
  assert.equal(assetSearch.annotations?.readOnlyHint, true);
  assert.equal(ASSET_SEARCH_TOOL.name, 'asset_search');
}

{
  await resetBetterChatCutAssetRegistryForTests([fixtures]);
  const result = await runAssetSearch({ query: 'trai dat' });
  assert.ok(result.total >= 1);
  assert.equal(result.items[0]?.asset.id, 'object.earth');
  assert.ok(!('path' in (result.items[0]?.asset ?? {})));
  assert.equal(result.items[0]?.asset.propsSchema, undefined);

  const emptyish = await runAssetSearch({ query: 'zzzz-no-such-asset' });
  assert.equal(emptyish.total, 0);
  assert.deepEqual(emptyish.items, []);
  assert.ok(typeof emptyish.catalogRevision === 'string');

  assert.throws(() => parseAssetSearchInput({ limit: 0 }), (error: unknown) => (
    error instanceof AssetRegistryError && error.field === 'limit'
  ));
  await assert.rejects(() => runAssetSearch({ limit: 99 }), (error: unknown) => (
    error instanceof AssetRegistryError && error.code === 'invalid_limit'
  ));
}

console.log('better-chat-cut asset_search verification passed');
