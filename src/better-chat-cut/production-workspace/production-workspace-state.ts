export type WorkspacePageId =
  | 'overview'
  | 'production'
  | 'publishing'
  | 'reviews'
  | 'operations'
  | 'deliveries'
  | 'health'
  | 'settings';

export type WorkspaceRoute =
  | { page: 'overview' }
  | { page: 'production'; runId?: string }
  | { page: 'publishing'; runId?: string }
  | { page: 'reviews' }
  | { page: 'operations' }
  | { page: 'deliveries' }
  | { page: 'health' }
  | { page: 'settings' };

export function parseWorkspaceHash(hash: string): WorkspaceRoute {
  const raw = hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] !== 'production-workspace' && parts[0] !== 'workspace') {
    return { page: 'overview' };
  }
  const page = parts[1] ?? 'overview';
  if (page === 'production') return { page: 'production', runId: parts[2] };
  if (page === 'publishing') return { page: 'publishing', runId: parts[2] };
  if (page === 'reviews') return { page: 'reviews' };
  if (page === 'operations') return { page: 'operations' };
  if (page === 'deliveries') return { page: 'deliveries' };
  if (page === 'health') return { page: 'health' };
  if (page === 'settings') return { page: 'settings' };
  return { page: 'overview' };
}

export function workspaceHash(route: WorkspaceRoute): string {
  switch (route.page) {
    case 'production':
      return route.runId
        ? `#/production-workspace/production/${encodeURIComponent(route.runId)}`
        : '#/production-workspace/production';
    case 'publishing':
      return route.runId
        ? `#/production-workspace/publishing/${encodeURIComponent(route.runId)}`
        : '#/production-workspace/publishing';
    case 'reviews':
      return '#/production-workspace/reviews';
    case 'operations':
      return '#/production-workspace/operations';
    case 'deliveries':
      return '#/production-workspace/deliveries';
    case 'health':
      return '#/production-workspace/health';
    case 'settings':
      return '#/production-workspace/settings';
    default:
      return '#/production-workspace';
  }
}

export type WorkspacePrefsV1 = {
  schemaVersion: '1.0.0';
  lastPage: WorkspacePageId;
  pageSize: number;
  autoRefresh: boolean;
  developerDetailsExpanded: boolean;
};

const PREFS_KEY = 'bcc.production-workspace.prefs.v1';

export function loadWorkspacePrefs(): WorkspacePrefsV1 {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) throw new Error('missing');
    const parsed = JSON.parse(raw) as WorkspacePrefsV1;
    if (parsed.schemaVersion !== '1.0.0') throw new Error('version');
    return parsed;
  } catch {
    return {
      schemaVersion: '1.0.0',
      lastPage: 'overview',
      pageSize: 20,
      autoRefresh: true,
      developerDetailsExpanded: false,
    };
  }
}

export function saveWorkspacePrefs(prefs: WorkspacePrefsV1): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
