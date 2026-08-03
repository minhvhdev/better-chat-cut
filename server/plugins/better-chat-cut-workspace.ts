import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createProductionWorkspaceService,
  type ProductionWorkspaceService,
} from '../../packages/production-workspace-services/src/index.ts';
import {
  validateWorkspaceOverviewQuery,
  validateWorkspaceReviewQuery,
  validateWorkspaceHealthOptions,
  validateWorkspaceCommand,
  validateWorkspaceMigrationApply,
  WorkspaceError,
} from '../../packages/production-workspace-contracts/src/index.ts';
import { redactString } from '../../packages/production-workspace-services/src/diagnostics/diagnostic-redaction.ts';

let shared: ProductionWorkspaceService | null = null;

export function getWorkspaceService(): ProductionWorkspaceService {
  if (!shared) {
    shared = createProductionWorkspaceService();
  }
  return shared;
}

export function setWorkspaceServiceForTests(service: ProductionWorkspaceService | null): void {
  shared = service;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

function errorBody(error: unknown): { error: string; code?: string; recovery?: string } {
  if (error instanceof WorkspaceError) {
    return { error: redactString(error.message), code: error.code };
  }
  const code = (error as { code?: string }).code;
  return {
    error: redactString(error instanceof Error ? error.message : String(error)),
    code: typeof code === 'string' ? code : undefined,
  };
}

export function betterChatCutWorkspacePlugin(): Plugin {
  return {
    name: 'better-chat-cut-workspace',
    configureServer(server) {
      server.middlewares.use('/api/better-chat-cut/workspace', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://local.invalid');
          const path = url.pathname.replace(/\/+$/, '') || '/';
          const method = (req.method ?? 'GET').toUpperCase();
          const ws = getWorkspaceService();

          if (method === 'GET' && (path === '/' || path === '/overview')) {
            const q = Object.fromEntries(url.searchParams.entries());
            const parsed = validateWorkspaceOverviewQuery({
              ...q,
              limit: q.limit ? Number(q.limit) : undefined,
              offset: q.offset ? Number(q.offset) : undefined,
              status: q.status ? q.status.split(',') : undefined,
              includeHealth: q.includeHealth !== 'false',
            });
            if (!parsed.valid) {
              sendJson(res, 400, { errors: parsed.errors });
              return;
            }
            sendJson(res, 200, await ws.getOverview(parsed.value ?? {}));
            return;
          }

          const productionMatch = path.match(/^\/production-runs\/([^/]+)$/);
          if (method === 'GET' && productionMatch) {
            sendJson(res, 200, await ws.getProductionRunDetail(decodeURIComponent(productionMatch[1])));
            return;
          }

          const publishingMatch = path.match(/^\/publishing-runs\/([^/]+)$/);
          if (method === 'GET' && publishingMatch) {
            sendJson(res, 200, await ws.getPublishingRunDetail(decodeURIComponent(publishingMatch[1])));
            return;
          }

          if (method === 'GET' && path === '/reviews') {
            const q = Object.fromEntries(url.searchParams.entries());
            const parsed = validateWorkspaceReviewQuery({
              ...q,
              limit: q.limit ? Number(q.limit) : undefined,
              offset: q.offset ? Number(q.offset) : undefined,
            });
            if (!parsed.valid) {
              sendJson(res, 400, { errors: parsed.errors });
              return;
            }
            sendJson(res, 200, await ws.listReviews(parsed.value ?? {}));
            return;
          }

          if (method === 'GET' && path === '/operations') {
            sendJson(res, 200, { operations: await ws.listOperations() });
            return;
          }

          if (method === 'GET' && path === '/health') {
            const q = Object.fromEntries(url.searchParams.entries());
            const parsed = validateWorkspaceHealthOptions({
              mode: q.mode === 'deep' ? 'deep' : 'quick',
              includeDesktop: q.includeDesktop === 'true',
            });
            sendJson(res, 200, await ws.getHealth(parsed.value ?? {}));
            return;
          }

          if (method === 'GET' && path === '/contract') {
            const format = url.searchParams.get('format') === 'full' ? 'full' : 'summary';
            sendJson(res, 200, ws.getContract(format));
            return;
          }

          if (method === 'POST' && path === '/commands') {
            const body = await readBody(req);
            const parsed = validateWorkspaceCommand(body);
            if (!parsed.valid || !parsed.value) {
              sendJson(res, 400, { errors: parsed.errors });
              return;
            }
            sendJson(res, 200, await ws.executeCommand(parsed.value));
            return;
          }

          if (method === 'POST' && path === '/migrations/plan') {
            sendJson(res, 200, await ws.planMigrations());
            return;
          }

          if (method === 'POST' && path === '/migrations/apply') {
            const body = await readBody(req);
            const parsed = validateWorkspaceMigrationApply(body);
            if (!parsed.valid || !parsed.value) {
              sendJson(res, 400, { errors: parsed.errors });
              return;
            }
            sendJson(res, 200, await ws.applyMigrations(parsed.value));
            return;
          }

          if (method === 'POST' && path === '/diagnostics/export') {
            sendJson(res, 200, await ws.exportDiagnostics());
            return;
          }

          sendJson(res, 404, { error: 'Not found' });
        } catch (error) {
          const status = error instanceof WorkspaceError && error.code === 'WORKSPACE_RUN_NOT_FOUND'
            ? 404
            : 500;
          sendJson(res, status, errorBody(error));
        }
      });
    },
  };
}
