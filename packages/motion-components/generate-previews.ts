/**
 * Generate bundled still previews for starter motion assets.
 * Writes PNG files under extensions/better-chat-cut/catalog/previews/.
 *
 * Usage: npm run generate:better-chat-cut-previews
 * Skip: BCC_SKIP_MOTION_RENDER=1
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ensureBetterChatCutMotionRuntime,
  listMotionComponents,
} from './src/index.ts';
import { renderMotionPreview } from './src/preview/preview-service.ts';

ensureBetterChatCutMotionRuntime();

const outRoot = join(process.cwd(), 'extensions', 'better-chat-cut', 'catalog', 'previews');

async function main(): Promise<void> {
  if (process.env.BCC_SKIP_MOTION_RENDER === '1') {
    console.log('generate:better-chat-cut-previews skipped (BCC_SKIP_MOTION_RENDER=1)');
    return;
  }

  await mkdir(outRoot, { recursive: true });
  const components = listMotionComponents().filter((c) => c.kind !== 'animation');
  for (const definition of components) {
    const rendered = await renderMotionPreview({
      assetId: definition.assetId,
      version: definition.assetVersion,
      mode: 'still',
      themeId: 'default',
    });
    const file = join(outRoot, `${definition.assetId.replace(/\./g, '-')}-${definition.assetVersion}.png`);
    await writeFile(file, Buffer.from(rendered.base64, 'base64'));
    console.log(`wrote ${file} cacheHit=${rendered.cacheHit}`);
  }
  console.log(`generate:better-chat-cut-previews: ok (${components.length} assets)`);
}

await main();
