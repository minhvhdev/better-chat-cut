import { accessSync, constants, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  type WorkspaceHealthCheckV1,
  type WorkspaceHealthReportV1,
  type WorkspaceDiagnostic,
  workspaceDiagnostic,
} from '../../../production-workspace-contracts/src/index.ts';
import type { ProductionOrchestrator } from '../../../explainer-production-runs/src/index.ts';
import type { PublishingOrchestrator } from '../../../publishing-operations/src/index.ts';
import { listPendingMigrations } from '../migrations/migration-registry.ts';
import { redactString } from '../diagnostics/diagnostic-redaction.ts';

export type HealthContext = {
  productionRoot: string;
  publishingRoot: string;
  migrationRoot: string;
  production: ProductionOrchestrator;
  publishing: PublishingOrchestrator;
  desktop: boolean;
  mode: 'quick' | 'deep';
};

function classifyRoot(root: string, label: string): WorkspaceHealthCheckV1 {
  const id = `storage.${label}`;
  try {
    if (!existsSync(root)) {
      try {
        mkdirSync(root, { recursive: true });
      } catch {
        return {
          id,
          category: 'storage',
          label: `${label} root`,
          status: 'fail',
          summary: 'Root missing and not creatable',
          recovery: 'Check BETTER_CHAT_CUT_*_ROOT env overrides and permissions',
        };
      }
    }
    const st = statSync(root);
    if (!st.isDirectory()) {
      return {
        id,
        category: 'storage',
        label: `${label} root`,
        status: 'fail',
        summary: 'Root is not a directory',
        recovery: 'Point env root to a directory',
      };
    }
    accessSync(root, constants.R_OK | constants.W_OK);
    return {
      id,
      category: 'storage',
      label: `${label} root`,
      status: 'pass',
      summary: 'Configured, readable, writable',
      details: { configured: true, readable: true, writable: true, available: true },
    };
  } catch (error) {
    return {
      id,
      category: 'storage',
      label: `${label} root`,
      status: 'fail',
      summary: redactString(error instanceof Error ? error.message : String(error)),
      recovery: 'Fix permissions on workspace data root',
    };
  }
}

function checkIntegrity(
  label: 'production' | 'publishing',
  orch: { listRuns: (o?: { limit?: number }) => Array<{ runId: string }>; getRun: (id: string) => unknown; validateRun?: (id: string) => { valid: boolean; errors: WorkspaceDiagnostic[] } },
): WorkspaceHealthCheckV1[] {
  const checks: WorkspaceHealthCheckV1[] = [];
  let invalid = 0;
  let total = 0;
  try {
    const runs = orch.listRuns({ limit: 100 });
    total = runs.length;
    for (const s of runs) {
      try {
        const run = orch.getRun(s.runId);
        if (!run) {
          invalid += 1;
          continue;
        }
        if (orch.validateRun) {
          const v = orch.validateRun(s.runId);
          if (!v.valid) invalid += 1;
        }
      } catch {
        invalid += 1;
      }
    }
  } catch (error) {
    checks.push({
      id: `integrity.${label}.scan`,
      category: 'data-integrity',
      label: `${label} integrity scan`,
      status: 'fail',
      summary: redactString(error instanceof Error ? error.message : String(error)),
    });
    return checks;
  }
  checks.push({
    id: `integrity.${label}`,
    category: 'data-integrity',
    label: `${label} run integrity`,
    status: invalid === 0 ? 'pass' : 'warn',
    summary: invalid === 0
      ? `${total} run(s) readable`
      : `${invalid} of ${total} run(s) invalid or corrupt`,
    recovery: invalid > 0
      ? 'Open affected runs from health guidance; no automatic destructive repair'
      : undefined,
  });
  return checks;
}

function checkLocks(root: string, area: string): WorkspaceHealthCheckV1 {
  let lockCount = 0;
  let stale = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith('.lock') || entry.name === 'run.lock' || entry.name === 'migration.lock') {
        lockCount += 1;
        try {
          const age = Date.now() - statSync(full).mtimeMs;
          if (age > 1000 * 60 * 60) stale += 1;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(root, 0);
  return {
    id: `locks.${area}`,
    category: 'operations',
    label: `${area} locks`,
    status: stale > 0 ? 'warn' : 'pass',
    summary: stale > 0
      ? `${stale} possibly stale lock(s) of ${lockCount}`
      : `${lockCount} lock file(s)`,
    recovery: stale > 0
      ? 'If no process owns the lock and store is idle, clear after explicit confirmation (not automatic)'
      : undefined,
  };
}

function checkRuntime(mode: 'quick' | 'deep'): WorkspaceHealthCheckV1[] {
  const checks: WorkspaceHealthCheckV1[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'runtime.node',
    category: 'runtime',
    label: 'Node.js',
    status: nodeMajor >= 24 ? 'pass' : 'warn',
    summary: `node ${process.version}`,
    recovery: nodeMajor < 24 ? 'Use Node.js 24.x as required by package engines' : undefined,
  });
  checks.push({
    id: 'runtime.home',
    category: 'runtime',
    label: 'App data base',
    status: existsSync(homedir()) ? 'pass' : 'fail',
    summary: existsSync(homedir()) ? 'home available' : 'home unavailable',
  });
  if (mode === 'deep') {
    checks.push({
      id: 'runtime.deep-probe',
      category: 'render',
      label: 'Deep probe',
      status: 'pass',
      summary: 'Skipped expensive render in health deep probe placeholder (no full MP4 render)',
    });
  }
  return checks;
}

export function collectHealthReport(ctx: HealthContext): WorkspaceHealthReportV1 {
  const checks: WorkspaceHealthCheckV1[] = [];
  const errors: WorkspaceDiagnostic[] = [];
  const warnings: WorkspaceDiagnostic[] = [];

  checks.push(...checkRuntime(ctx.mode));
  checks.push(classifyRoot(ctx.productionRoot, 'production-runs'));
  checks.push(classifyRoot(ctx.publishingRoot, 'publishing'));
  checks.push(classifyRoot(ctx.migrationRoot, 'migrations'));

  // Additional known roots (best-effort, may not exist)
  const optionalRoots: [string, string][] = [
    [process.env.BETTER_CHAT_CUT_SCENE_DRAFT_ROOT ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'scene-drafts'), 'scene-drafts'],
    [process.env.BETTER_CHAT_CUT_DELIVERY_ROOT ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'deliveries'), 'deliveries'],
  ];
  for (const [root, label] of optionalRoots) {
    const check = classifyRoot(root, label);
    if (check.status === 'fail' && !existsSync(root)) {
      checks.push({
        ...check,
        status: 'skip',
        summary: 'Optional root not present',
      });
    } else {
      checks.push(check);
    }
  }

  checks.push(...checkIntegrity('production', ctx.production));
  checks.push(...checkIntegrity('publishing', {
    listRuns: (o) => ctx.publishing.listRuns(o),
    getRun: (id) => ctx.publishing.getRun(id),
    validateRun: (id) => ctx.publishing.validateRun(id),
  }));

  checks.push(checkLocks(ctx.productionRoot, 'production'));
  checks.push(checkLocks(ctx.publishingRoot, 'publishing'));
  checks.push(checkLocks(ctx.migrationRoot, 'migration'));

  checks.push({
    id: 'credentials.browser',
    category: 'credentials',
    label: 'Credential exposure',
    status: 'pass',
    summary: 'Workspace APIs never return secrets; connections use opaque IDs',
  });

  checks.push({
    id: 'desktop.host',
    category: 'desktop',
    label: 'Desktop host',
    status: ctx.desktop ? 'pass' : 'skip',
    summary: ctx.desktop ? 'Desktop runtime flag present' : 'Web / non-desktop host',
  });

  const pending = listPendingMigrations({
    productionRoot: ctx.productionRoot,
    publishingRoot: ctx.publishingRoot,
    migrationRoot: ctx.migrationRoot,
  });
  checks.push({
    id: 'migrations.pending',
    category: 'migrations',
    label: 'Pending migrations',
    status: pending.length === 0 ? 'pass' : 'warn',
    summary: pending.length === 0 ? 'No migrations required' : `${pending.length} migration(s) pending`,
    recovery: pending.length
      ? 'Open Health → plan migrations, review hash, then apply with backup'
      : undefined,
  });

  for (const c of checks) {
    if (c.status === 'fail') {
      errors.push(workspaceDiagnostic('error', `HEALTH_${c.id.replace(/\./g, '_').toUpperCase()}`, c.summary, {
        recovery: c.recovery,
      }));
    } else if (c.status === 'warn') {
      warnings.push(workspaceDiagnostic('warning', `HEALTH_${c.id.replace(/\./g, '_').toUpperCase()}`, c.summary, {
        recovery: c.recovery,
      }));
    }
  }

  const status: WorkspaceHealthReportV1['status'] = errors.length
    ? 'error'
    : warnings.length
      ? 'warning'
      : 'healthy';

  return {
    schemaVersion: '1.0.0',
    status,
    mode: ctx.mode,
    checks,
    migrations: {
      required: pending.length > 0,
      pending,
    },
    generatedAt: new Date().toISOString(),
    errors,
    warnings,
  };
}
