import type {
  WorkspaceOverviewV1,
  WorkspaceRunDetailV1,
  WorkspaceReviewQueueV1,
  WorkspaceHealthReportV1,
  WorkspaceCommandV1,
  WorkspaceCommandResultV1,
  WorkspaceMigrationPlanV1,
  WorkspaceMigrationReceiptV1,
  WorkspaceDiagnosticBundleV1,
  WorkspaceOverviewQueryV1,
  WorkspaceReviewQueryV1,
  WorkspaceHealthOptionsV1,
  WorkspaceOperationViewV1,
} from '../../../packages/production-workspace-contracts/src/index.ts';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json() as T & { error?: string; errors?: unknown };
  if (!res.ok) {
    const message = typeof (data as { error?: string }).error === 'string'
      ? (data as { error: string }).error
      : `Workspace API failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

function qs(query: Record<string, string | number | boolean | undefined | string[]>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) params.set(k, v.join(','));
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const productionWorkspaceApi = {
  async getContract(format: 'summary' | 'full' = 'summary'): Promise<unknown> {
    const res = await fetch(`/api/better-chat-cut/workspace/contract?format=${format}`);
    return parseJson(res);
  },

  async getOverview(query: WorkspaceOverviewQueryV1 = {}): Promise<WorkspaceOverviewV1> {
    const res = await fetch(`/api/better-chat-cut/workspace/overview${qs(query as never)}`);
    return parseJson(res);
  },

  async getProductionRun(runId: string): Promise<WorkspaceRunDetailV1> {
    const res = await fetch(`/api/better-chat-cut/workspace/production-runs/${encodeURIComponent(runId)}`);
    return parseJson(res);
  },

  async getPublishingRun(runId: string): Promise<WorkspaceRunDetailV1> {
    const res = await fetch(`/api/better-chat-cut/workspace/publishing-runs/${encodeURIComponent(runId)}`);
    return parseJson(res);
  },

  async listReviews(query: WorkspaceReviewQueryV1 = {}): Promise<WorkspaceReviewQueueV1> {
    const res = await fetch(`/api/better-chat-cut/workspace/reviews${qs(query as never)}`);
    return parseJson(res);
  },

  async listOperations(): Promise<{ operations: WorkspaceOperationViewV1[] }> {
    const res = await fetch('/api/better-chat-cut/workspace/operations');
    return parseJson(res);
  },

  async getHealth(options: WorkspaceHealthOptionsV1 = {}): Promise<WorkspaceHealthReportV1> {
    const res = await fetch(`/api/better-chat-cut/workspace/health${qs(options as never)}`);
    return parseJson(res);
  },

  async executeCommand(command: WorkspaceCommandV1): Promise<WorkspaceCommandResultV1> {
    const res = await fetch('/api/better-chat-cut/workspace/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    return parseJson(res);
  },

  async planMigrations(): Promise<WorkspaceMigrationPlanV1> {
    const res = await fetch('/api/better-chat-cut/workspace/migrations/plan', { method: 'POST' });
    return parseJson(res);
  },

  async applyMigrations(input: {
    planId: string;
    planHash: string;
    dryRun?: boolean;
    confirmDestructive?: boolean;
  }): Promise<WorkspaceMigrationReceiptV1> {
    const res = await fetch('/api/better-chat-cut/workspace/migrations/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },

  async exportDiagnostics(): Promise<WorkspaceDiagnosticBundleV1> {
    const res = await fetch('/api/better-chat-cut/workspace/diagnostics/export', { method: 'POST' });
    return parseJson(res);
  },
};
