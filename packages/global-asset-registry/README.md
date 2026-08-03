# @better-chat-cut/global-asset-registry

Independent Global Asset Registry for Better Chat Cut.

## Public API

```ts
import {
  validateAssetManifest,
  loadAssetCatalog,
  createGlobalAssetRegistry,
  normalizeAssetSearchText,
  resolveAssetCatalogRoots,
} from './src/index.ts';
```

## Usage

```ts
const registry = createGlobalAssetRegistry({
  roots: resolveAssetCatalogRoots(),
  strict: false,
});
await registry.refresh();
const result = registry.search({ query: 'trai dat', capabilities: ['rotate'] });
```

## Verify

```bash
npm run verify:better-chat-cut-assets
```

## Notes

- No MCP/React/Remotion dependencies.
- Manifest files (`*.asset.json`) are the source of truth.
- Search index is rebuilt on `refresh()` and is deterministic.
- Schema docs: [docs/asset-manifest-v1.md](../../docs/asset-manifest-v1.md)
- Motion runtime (separate package) consumes catalog metadata; see [docs/motion-runtime.md](../../docs/motion-runtime.md).
