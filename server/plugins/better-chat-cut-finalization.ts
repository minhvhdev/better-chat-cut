import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createDistributionBuildService,
  buildDistributionPlan,
} from '../../packages/desktop-distribution/src/index.ts';
import {
  validateDesktopDistributionPlan,
  DistributionError,
} from '../../packages/desktop-distribution-contracts/src/index.ts';
import {
  createConnectionOnboardingService,
  OnboardingError,
} from '../../packages/secure-connection-onboarding/src/index.ts';
import {
  createBackupRestoreService,
  BackupError,
} from '../../packages/workspace-backup-restore/src/index.ts';
import {
  createQualificationService,
  QualificationError,
} from '../../packages/release-candidate-qualification/src/index.ts';

const dist = createDistributionBuildService({ dryRun: true });
const onboard = createConnectionOnboardingService({ fakeProvider: true });
const backup = createBackupRestoreService();
const qual = createQualificationService();

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

function errorBody(error: unknown): { error: string; code?: string } {
  if (
    error instanceof DistributionError
    || error instanceof OnboardingError
    || error instanceof BackupError
    || error instanceof QualificationError
  ) {
    return { error: error.message, code: error.code };
  }
  return { error: error instanceof Error ? error.message : String(error) };
}

async function handle(
  base: 'distribution' | 'connections' | 'backups' | 'restores' | 'release-candidates',
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://local.invalid');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = (req.method ?? 'GET').toUpperCase();

    if (base === 'distribution') {
      if (method === 'GET' && path === '/capabilities') {
        sendJson(res, 200, dist.getCapabilities());
        return;
      }
      if (method === 'GET' && path === '/contract') {
        sendJson(res, 200, dist.getContract(url.searchParams.get('format') === 'full' ? 'full' : 'summary'));
        return;
      }
      if (method === 'POST' && path === '/plan') {
        const body = await readBody(req) as { request?: never };
        sendJson(res, 200, await buildDistributionPlan(process.cwd(), body.request as never, { allowDirty: true }));
        return;
      }
      if (method === 'POST' && path === '/submit') {
        const body = await readBody(req) as { requestId?: string; plan?: unknown };
        const parsed = validateDesktopDistributionPlan(body.plan);
        if (!parsed.valid || !parsed.value) {
          sendJson(res, 400, { errors: parsed.errors });
          return;
        }
        sendJson(res, 200, await dist.submitBuild(body.requestId ?? 'ui', parsed.value));
        return;
      }
      const opMatch = path.match(/^\/operations\/([^/]+)$/);
      if (method === 'GET' && opMatch) {
        const op = await dist.getOperation(decodeURIComponent(opMatch[1]));
        if (!op) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        const manifest = op.status === 'completed' ? await dist.getManifest(op.operationId) : null;
        sendJson(res, 200, { operation: op, manifest });
        return;
      }
    }

    if (base === 'connections') {
      if (method === 'POST' && path === '/onboarding/begin') {
        const body = await readBody(req) as {
          requestId?: string;
          request?: never;
          openBrowser?: boolean;
        };
        sendJson(res, 200, await onboard.begin(body.requestId ?? 'ui', body.request as never, {
          openBrowser: body.openBrowser === true,
        }));
        return;
      }
      const statusMatch = path.match(/^\/onboarding\/([^/]+)$/);
      if (method === 'GET' && statusMatch) {
        sendJson(res, 200, await onboard.status(decodeURIComponent(statusMatch[1])));
        return;
      }
      if (method === 'POST' && path === '/onboarding/complete-fake') {
        const body = await readBody(req) as { sessionId?: string };
        sendJson(res, 200, await onboard.completeFake(String(body.sessionId)));
        return;
      }
      const discMatch = path.match(/^\/([^/]+)\/disconnect$/);
      if (method === 'POST' && discMatch) {
        const body = await readBody(req) as { dryRun?: boolean; revokeRemote?: boolean };
        sendJson(res, 200, await onboard.disconnect(decodeURIComponent(discMatch[1]), {
          dryRun: body.dryRun !== false,
          revokeRemote: body.revokeRemote === true,
        }));
        return;
      }
      if (method === 'GET' && path === '/list') {
        sendJson(res, 200, { connections: await onboard.listConnections() });
        return;
      }
    }

    if (base === 'backups') {
      if (method === 'POST' && path === '/plan') {
        const body = await readBody(req) as { request?: never };
        sendJson(res, 200, await backup.planBackup(body.request as never));
        return;
      }
      if (method === 'POST' && path === '/create') {
        const body = await readBody(req) as { plan?: never };
        sendJson(res, 200, await backup.createBackup(body.plan as never));
        return;
      }
      const opMatch = path.match(/^\/operations\/([^/]+)$/);
      if (method === 'GET' && opMatch) {
        sendJson(res, 200, await backup.getOperation(decodeURIComponent(opMatch[1])));
        return;
      }
      if (method === 'POST' && path === '/validate') {
        const body = await readBody(req) as { backupId?: string };
        sendJson(res, 200, await backup.validateBackup(String(body.backupId)));
        return;
      }
    }

    if (base === 'restores') {
      if (method === 'POST' && path === '/plan') {
        const body = await readBody(req) as { backupId?: string; dryRun?: boolean };
        sendJson(res, 200, await backup.planRestore(String(body.backupId), { dryRun: body.dryRun !== false }));
        return;
      }
      if (method === 'POST' && path === '/apply') {
        const body = await readBody(req) as {
          plan?: never;
          confirmDestructive?: boolean;
          resolutions?: never;
        };
        sendJson(res, 200, await backup.applyRestore(body.plan as never, {
          confirmDestructive: body.confirmDestructive === true,
          resolutions: body.resolutions as never,
        }));
        return;
      }
      const opMatch = path.match(/^\/operations\/([^/]+)$/);
      if (method === 'GET' && opMatch) {
        sendJson(res, 200, await backup.getOperation(decodeURIComponent(opMatch[1])));
        return;
      }
    }

    if (base === 'release-candidates') {
      if (method === 'POST' && path === '/prepare') {
        const body = await readBody(req) as never;
        sendJson(res, 200, await qual.preparePlan(body));
        return;
      }
      if (method === 'POST' && path === '/validate') {
        const body = await readBody(req) as { plan?: never; distributionArtifacts?: never };
        sendJson(res, 200, await qual.validate(body.plan as never, {
          distributionArtifacts: body.distributionArtifacts as never,
          forcePassLocalChecks: true,
        }));
        return;
      }
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    sendJson(res, 400, errorBody(error));
  }
}

export function betterChatCutFinalizationPlugin(): Plugin {
  return {
    name: 'better-chat-cut-finalization',
    configureServer(server) {
      server.middlewares.use('/api/better-chat-cut/distribution', (req, res) => {
        void handle('distribution', req, res);
      });
      server.middlewares.use('/api/better-chat-cut/connections', (req, res) => {
        void handle('connections', req, res);
      });
      server.middlewares.use('/api/better-chat-cut/backups', (req, res) => {
        void handle('backups', req, res);
      });
      server.middlewares.use('/api/better-chat-cut/restores', (req, res) => {
        void handle('restores', req, res);
      });
      server.middlewares.use('/api/better-chat-cut/release-candidates', (req, res) => {
        void handle('release-candidates', req, res);
      });
    },
  };
}
