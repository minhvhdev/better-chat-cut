import {
  createProductionWorkspaceService,
  type ProductionWorkspaceService,
} from '../../../packages/production-workspace-services/src/index.ts';
import {
  validateWorkspaceOverviewQuery,
  validateWorkspaceReviewQuery,
  validateWorkspaceHealthOptions,
  validateWorkspaceMigrationApply,
  WorkspaceError,
} from '../../../packages/production-workspace-contracts/src/index.ts';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeIdempotent = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeDestructive = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

let workspaceForTests: ProductionWorkspaceService | null = null;

export function setWorkspaceServiceForTests(value: ProductionWorkspaceService | null): void {
  workspaceForTests = value;
}

function getWorkspace(): ProductionWorkspaceService {
  if (workspaceForTests) return workspaceForTests;
  return createProductionWorkspaceService();
}

function toolResult(data: unknown) {
  return data;
}

export const WORKSPACE_CONTROL_TOOLS = [
  {
    name: 'workspace_get_contract',
    description: 'Return Better Chat Cut Production Workspace contract (M7A): overview APIs, review surfaces, health, migrations, diagnostics. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['summary', 'full'] },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'workspace_get_overview',
    description: 'Get unified production/publishing workspace overview with counts, recent runs, pending reviews, operations, health summary. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectId: { type: 'string' },
        runType: { type: 'string', enum: ['production', 'publishing', 'all'] },
        status: { type: 'array', items: { type: 'string' } },
        stageId: { type: 'string' },
        search: { type: 'string' },
        sortBy: { type: 'string', enum: ['updatedAt', 'createdAt', 'status'] },
        sortDir: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 },
        includeHealth: { type: 'boolean' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'workspace_get_run_detail',
    description: 'Get production or publishing run detail: stages, lineage, reviews, operations, next action. No secrets/paths. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        runType: { type: 'string', enum: ['production', 'publishing'] },
        runId: { type: 'string', minLength: 1 },
      },
      required: ['runType', 'runId'],
    },
    annotations: readOnly,
  },
  {
    name: 'workspace_list_reviews',
    description: 'List unified review queue items across production and publishing runs. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        runType: { type: 'string', enum: ['production', 'publishing', 'all'] },
        reviewType: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'stale', 'all'] },
        projectId: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'workspace_health_check',
    description: 'Run workspace health checks (quick|deep): roots, integrity, locks, operations, migrations. Read-only; never auto-repairs.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['quick', 'deep'] },
        includeDesktop: { type: 'boolean' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'workspace_plan_migrations',
    description: 'Plan safer workspace migrations with plan hash. Read-only; creates no backups until apply.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    annotations: readOnly,
  },
  {
    name: 'workspace_apply_migrations',
    description: 'Apply a previously planned migration by planId+planHash. Creates backup when required. dryRun=true by default.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        planId: { type: 'string', minLength: 1 },
        planHash: { type: 'string', minLength: 64, maxLength: 64 },
        dryRun: { type: 'boolean' },
        confirmDestructive: { type: 'boolean' },
      },
      required: ['planId', 'planHash'],
    },
    annotations: writeDestructive,
  },
  {
    name: 'workspace_export_diagnostics',
    description: 'Export redacted workspace diagnostic bundle (no credentials, paths, project content, media). Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    annotations: writeIdempotent,
  },
];

export async function runWorkspaceControlTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const ws = getWorkspace();
  switch (name) {
    case 'workspace_get_contract':
      return toolResult(ws.getContract(args.format === 'full' ? 'full' : 'summary'));
    case 'workspace_get_overview': {
      const parsed = validateWorkspaceOverviewQuery(args);
      if (!parsed.valid) return toolResult({ errors: parsed.errors });
      return toolResult(await ws.getOverview(parsed.value ?? {}));
    }
    case 'workspace_get_run_detail': {
      const runType = args.runType === 'publishing' ? 'publishing' : 'production';
      const runId = String(args.runId ?? '');
      if (!runId) throw new WorkspaceError('WORKSPACE_COMMAND_INVALID', 'runId required');
      if (runType === 'publishing') return toolResult(await ws.getPublishingRunDetail(runId));
      return toolResult(await ws.getProductionRunDetail(runId));
    }
    case 'workspace_list_reviews': {
      const parsed = validateWorkspaceReviewQuery(args);
      if (!parsed.valid) return toolResult({ errors: parsed.errors });
      return toolResult(await ws.listReviews(parsed.value ?? {}));
    }
    case 'workspace_health_check': {
      const parsed = validateWorkspaceHealthOptions(args);
      return toolResult(await ws.getHealth(parsed.value ?? {}));
    }
    case 'workspace_plan_migrations':
      return toolResult(await ws.planMigrations());
    case 'workspace_apply_migrations': {
      const parsed = validateWorkspaceMigrationApply({
        planId: args.planId,
        planHash: args.planHash,
        dryRun: args.dryRun !== false,
        confirmDestructive: args.confirmDestructive === true,
      });
      if (!parsed.valid || !parsed.value) return toolResult({ errors: parsed.errors });
      return toolResult(await ws.applyMigrations(parsed.value));
    }
    case 'workspace_export_diagnostics':
      return toolResult(await ws.exportDiagnostics());
    default:
      throw new WorkspaceError('WORKSPACE_COMMAND_UNSUPPORTED', `Unknown tool: ${name}`);
  }
}

export { WorkspaceError };
