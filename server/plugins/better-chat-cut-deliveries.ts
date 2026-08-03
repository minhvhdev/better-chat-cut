import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, createReadStream, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createDeliveryStore } from '../../packages/production-render-bundles/src/storage/operation-store.ts';
import { assertPathInsideRoot, bundleDir } from '../../packages/production-render-bundles/src/storage/delivery-paths.ts';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
  '.json': 'application/json',
  '.png': 'image/png',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function betterChatCutDeliveriesPlugin(): Plugin {
  return {
    name: 'better-chat-cut-deliveries',
    configureServer(server) {
      server.middlewares.use('/api/better-chat-cut/deliveries', (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://local.invalid');
          const parts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
          // mounted at /api/better-chat-cut/deliveries → remaining path is bundleId/file
          const bundleId = parts[0];
          const fileName = parts[1];
          if (!bundleId || !fileName) {
            sendJson(res, 400, { error: 'bundleId and artifact name required' });
            return;
          }
          if (bundleId.includes('..') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            sendJson(res, 400, { error: 'invalid path' });
            return;
          }
          const store = createDeliveryStore();
          const manifest = store.readManifest(bundleId);
          if (!manifest) {
            sendJson(res, 404, { error: 'bundle not found' });
            return;
          }
          const artifact = manifest.artifacts.find((a) => a.fileName === fileName || basename(a.relativePath) === fileName);
          if (!artifact) {
            sendJson(res, 404, { error: 'artifact not listed in manifest' });
            return;
          }
          const filePath = join(bundleDir(store.root, bundleId), artifact.fileName);
          assertPathInsideRoot(store.root, filePath);
          if (!existsSync(filePath)) {
            sendJson(res, 404, { error: 'artifact missing' });
            return;
          }
          const ext = artifact.fileName.includes('.') ? artifact.fileName.slice(artifact.fileName.lastIndexOf('.')) : '';
          res.statusCode = 200;
          res.setHeader('Content-Type', artifact.mimeType || MIME[ext] || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
          if (req.method === 'HEAD') {
            res.setHeader('Content-Length', String(readFileSync(filePath).byteLength));
            res.end();
            return;
          }
          createReadStream(filePath).pipe(res);
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
