import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGlobalAssetRegistry,
  loadAssetCatalog,
  normalizeAssetSearchText,
  validateAssetManifest,
  AssetRegistryError,
} from './src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const validRoot = join(here, 'fixtures', 'valid');
const invalidRoot = join(here, 'fixtures', 'invalid');

function mustFail(raw: unknown, code: string): void {
  const result = validateAssetManifest(raw);
  assert.equal(result.success, false, `expected failure for ${code}`);
  assert.ok(result.errors.some((error) => error.code === code), `expected code ${code}, got ${result.errors.map((e) => e.code).join(',')}`);
}

// Schema
{
  const ok = validateAssetManifest({
    schemaVersion: '1.0.0',
    id: 'object.earth',
    version: '1.0.0',
    name: 'Earth',
    description: 'Planet',
    kind: 'object',
    status: 'published',
    categories: ['Astronomy', 'astronomy', ' Geography '],
    tags: ['Earth', 'earth'],
    aliases: [' trái đất ', 'trai dat', 'trai dat'],
    capabilities: ['Rotate'],
    styleTags: ['Flat Vector'],
    implementation: { type: 'svg', entry: 'a.svg' },
    license: { spdx: 'MIT' },
  });
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.deepEqual(ok.manifest.categories, ['astronomy', 'geography']);
    assert.deepEqual(ok.manifest.tags, ['earth']);
    assert.deepEqual(ok.manifest.aliases, ['trái đất', 'trai dat']);
    assert.deepEqual(ok.manifest.capabilities, ['rotate']);
    assert.deepEqual(ok.manifest.styleTags, ['flat-vector']);
  }

  mustFail({ schemaVersion: '1.0.0', id: 'Bad ID', version: '1.0.0', name: 'x', description: 'x', kind: 'object', status: 'published', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: 'a.svg' }, license: { spdx: 'MIT' } }, 'invalid_id');
  mustFail({ schemaVersion: '1.0.0', id: 'object.x', version: 'v1', name: 'x', description: 'x', kind: 'object', status: 'published', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: 'a.svg' }, license: { spdx: 'MIT' } }, 'invalid_semver');
  mustFail({ schemaVersion: '1.0.0', id: 'object.x', version: '1.0.0', name: 'x', description: 'x', kind: 'object', status: 'published', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: '/abs.svg' }, license: { spdx: 'MIT' } }, 'unsafe_path');
  mustFail({ schemaVersion: '1.0.0', id: 'object.x', version: '1.0.0', name: 'x', description: 'x', kind: 'object', status: 'published', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: '../x.svg' }, license: { spdx: 'MIT' } }, 'unsafe_path');
  mustFail({ schemaVersion: '1.0.0', id: 'object.x', version: '1.0.0', name: 'x', description: 'x', kind: 'object', status: 'deprecated', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: 'a.svg' }, license: { spdx: 'MIT' } }, 'required');
  mustFail({ schemaVersion: '1.0.0', id: 'object.x', version: '1.0.0', name: 'x', description: 'x', kind: 'object', status: 'published', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: 'a.svg' }, propsSchema: [], license: { spdx: 'MIT' } }, 'invalid_type');
  mustFail({ schemaVersion: '1.0.0', id: 'object.x', version: '1.0.0', name: 'x', description: 'x', kind: 'object', status: 'nope', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: 'a.svg' }, license: { spdx: 'MIT' } }, 'invalid_enum');
  mustFail({ id: 'object.x', version: '1.0.0', name: 'x', description: 'x', kind: 'object', status: 'published', categories: [], tags: [], capabilities: [], implementation: { type: 'svg', entry: 'a.svg' }, license: { spdx: 'MIT' } }, 'unsupported_schema_version');
}

assert.equal(normalizeAssetSearchText('Trái Đất'), normalizeAssetSearchText('trai dat'));

// Loader
{
  const loaded = await loadAssetCatalog({ roots: [validRoot], strict: false });
  assert.ok(loaded.manifests.length >= 8);
  assert.ok(loaded.manifests.every((m, i, arr) => i === 0 || arr[i - 1].id <= m.id));

  const broken = await loadAssetCatalog({ roots: [invalidRoot], strict: false });
  assert.ok(broken.diagnostics.some((d) => d.code === 'invalid_json'));
  assert.ok(broken.diagnostics.some((d) => d.severity === 'error'));

  await assert.rejects(() => loadAssetCatalog({ roots: [invalidRoot], strict: true }));

  const dupDir = await mkdtemp(join(tmpdir(), 'bcc-dup-'));
  await mkdir(join(dupDir, 'a'), { recursive: true });
  await mkdir(join(dupDir, 'b'), { recursive: true });
  const body = JSON.stringify({
    schemaVersion: '1.0.0',
    id: 'object.dup',
    version: '1.0.0',
    name: 'Dup',
    description: 'dup',
    kind: 'object',
    status: 'published',
    categories: [],
    tags: [],
    capabilities: [],
    implementation: { type: 'svg', entry: 'a.svg' },
    license: { spdx: 'MIT' },
  });
  await writeFile(join(dupDir, 'a', 'one.asset.json'), body);
  await writeFile(join(dupDir, 'b', 'two.asset.json'), body);
  const dup = await loadAssetCatalog({ roots: [dupDir], strict: false });
  assert.ok(dup.diagnostics.some((d) => d.code === 'duplicate_id_version'));
}

// Registry + search
{
  const registry = createGlobalAssetRegistry({ roots: [validRoot], strict: false });
  const snap1 = await registry.refresh();
  const snap2 = await registry.refresh();
  assert.equal(snap1.revision, snap2.revision);
  assert.equal(registry.getAsset('object.earth')?.version, '1.0.0');
  assert.equal(registry.getAsset('object.earth', '1.1.0')?.status, 'staging');
  assert.equal(registry.getAsset('object.draft-comet'), undefined);

  const byId = registry.search({ query: 'object.earth' });
  assert.equal(byId.items[0]?.asset.id, 'object.earth');
  assert.ok(byId.items[0]!.score >= 1000);

  const vi = registry.search({ query: 'trai dat' });
  assert.ok(vi.items.some((item) => item.asset.id === 'object.earth'));

  const cap = registry.search({ capabilities: ['rotate'], categories: ['astronomy', 'physics'] });
  assert.ok(cap.items.every((item) => item.asset.capabilities.includes('rotate')));
  assert.ok(cap.items.every((item) =>
    item.asset.categories.includes('astronomy') || item.asset.categories.includes('physics')));

  const hidden = registry.search({ query: 'Old Globe' });
  assert.ok(!hidden.items.some((item) => item.asset.id === 'object.old-globe'));
  const shown = registry.search({ query: 'Old Globe', includeDeprecated: true });
  assert.ok(shown.items.some((item) => item.asset.id === 'object.old-globe'));

  const noSchema = registry.search({ query: 'Earth', includePropsSchema: false });
  assert.equal(noSchema.items[0]?.asset.propsSchema, undefined);
  const withSchema = registry.search({ query: 'Earth', includePropsSchema: true, statuses: ['published', 'staging'] });
  assert.ok(withSchema.items.some((item) => item.asset.id === 'object.earth' && item.asset.propsSchema));

  assert.throws(() => registry.search({ limit: 0 }), (error: unknown) => (
    error instanceof AssetRegistryError && error.code === 'invalid_limit'
  ));

  const page = registry.search({ limit: 2, offset: 0, kinds: ['object'] });
  assert.ok(page.items.length <= 2);
  assert.equal(page.limit, 2);
}

console.log('global-asset-registry.verify: ok');
