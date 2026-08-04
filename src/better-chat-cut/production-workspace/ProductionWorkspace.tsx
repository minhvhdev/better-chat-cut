import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { theme } from '../../theme';
import './styles/production-workspace.css';
import {
  productionWorkspaceApi,
} from './production-workspace-api.ts';
import {
  loadWorkspacePrefs,
  parseWorkspaceHash,
  saveWorkspacePrefs,
  workspaceHash,
  type WorkspaceRoute,
} from './production-workspace-state.ts';
import {
  StatusBadge,
  EmptyState,
  ErrorState,
  DiagnosticList,
  OperationProgress,
  ArtifactHashBadge,
  LineageBreadcrumbs,
  ReviewDecisionPanel,
  RecoveryActions,
} from './components/shared.tsx';
import {
  DistributionOverview,
  ConnectionOnboardingPage,
  BackupRestorePage,
  ReleaseCandidatePanel,
} from './m7b-panels.tsx';
import type {
  WorkspaceOverviewV1,
  WorkspaceRunDetailV1,
  WorkspaceReviewQueueV1,
  WorkspaceHealthReportV1,
  WorkspaceCommandResultV1,
  WorkspaceMigrationPlanV1,
  WorkspaceOperationViewV1,
  WorkspaceCommandV1,
} from '../../../packages/production-workspace-contracts/src/index.ts';

function requestId(prefix: string): string {
  return `${prefix}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

function useHashRoute(): [WorkspaceRoute, (route: WorkspaceRoute) => void] {
  const [route, setRoute] = useState<WorkspaceRoute>(() => parseWorkspaceHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseWorkspaceHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((next: WorkspaceRoute) => {
    const h = workspaceHash(next);
    if (window.location.hash !== h) window.location.hash = h;
    else setRoute(next);
  }, []);
  return [route, go];
}

function WorkspaceShell({
  route,
  onNavigate,
  onHome,
  children,
}: {
  route: WorkspaceRoute;
  onNavigate: (r: WorkspaceRoute) => void;
  onHome: () => void;
  children: ReactNode;
}) {
  const items: Array<{ page: WorkspaceRoute['page']; label: string }> = [
    { page: 'overview', label: 'Overview' },
    { page: 'production', label: 'Production' },
    { page: 'publishing', label: 'Publishing' },
    { page: 'reviews', label: 'Reviews' },
    { page: 'operations', label: 'Operations' },
    { page: 'deliveries', label: 'Deliveries' },
    { page: 'distribution', label: 'Distribution' },
    { page: 'backup', label: 'Backup' },
    { page: 'connections', label: 'Connections' },
    { page: 'qualification', label: 'Qualification' },
    { page: 'health', label: 'Health' },
    { page: 'settings', label: 'Settings' },
  ];
  return (
    <div className="bcc-ws-root" style={{ background: theme.bg, color: theme.text }}>
      <header className="bcc-ws-top">
        <button type="button" className="bcc-ws-focus bcc-ws-nav-btn" onClick={onHome}>
          ← Projects
        </button>
        <strong>Production Workspace</strong>
        <span className="bcc-ws-muted">Better Chat Cut · M7B</span>
      </header>
      <div className="bcc-ws-layout">
        <nav className="bcc-ws-sidebar" aria-label="Workspace sections">
          {items.map((item) => (
            <button
              key={item.page}
              type="button"
              className="bcc-ws-nav-btn bcc-ws-focus"
              aria-current={route.page === item.page ? 'page' : undefined}
              onClick={() => onNavigate({ page: item.page } as WorkspaceRoute)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <main className="bcc-ws-main" id="bcc-ws-main">
          {children}
        </main>
      </div>
    </div>
  );
}

function CreateProductionForm({
  onCreated,
}: {
  onCreated: (runId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [preview, setPreview] = useState<WorkspaceCommandResultV1 | null>(null);

  const body = useMemo(() => ({
    schemaVersion: '1.0.0',
    id: 'explainer.ui-created',
    name: 'UI production run',
    topic: 'Workspace demo topic',
    objective: 'Create run from Production Workspace UI',
    audience: { description: 'Editors' },
    language: 'en',
    duration: { targetSeconds: 60, minimumSeconds: 45, maximumSeconds: 90 },
    output: { width: 1920, height: 1080, fps: 30, renderProfile: 'preview-720p-h264' },
    style: {
      visualStyle: 'clean',
      tone: 'clear',
      pacing: 'balanced',
      complexity: 'introductory',
      preferredTheme: { id: 'theme.default', version: '1.0.0' },
    },
    factualPolicy: { requireSources: true },
    project: { mode: 'existing-target' as const, expectedProjectId: 'project-ui' },
    workflow: {
      reviewMode: 'review-key-stages' as const,
      projectMutationApproval: 'manual' as const,
      allowTemporaryTts: true,
      requireCaptions: true,
      requireSrt: true,
      requireVtt: true,
      maximumStageRetries: 3,
    },
  }), []);

  const submit = async (asDryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await productionWorkspaceApi.executeCommand({
        type: 'create-production-run',
        requestId: requestId('ui.create'),
        productionRequest: body as never,
        dryRun: asDryRun,
      });
      setPreview(result);
      if (!asDryRun && result.runId && result.errors.length === 0) onCreated(result.runId);
      if (result.errors.length) setError(result.errors.map((e) => e.message).join('; '));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bcc-ws-card" aria-labelledby="create-prod-h">
      <h2 id="create-prod-h" style={{ marginTop: 0, fontSize: 15 }}>Create production run</h2>
      <p className="bcc-ws-muted">Dry-run first; apply creates a persistent ExplainerProduction run via same-origin API.</p>
      <label className="bcc-ws-muted">
        <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Prefer dry-run
      </label>
      <div className="bcc-ws-actions" style={{ marginTop: 8 }}>
        <button type="button" disabled={busy} onClick={() => void submit(true)}>Dry-run create</button>
        <button type="button" disabled={busy || (dryRun && !preview)} onClick={() => void submit(false)}>
          Apply create
        </button>
      </div>
      {error && <ErrorState message={error} />}
      {preview && (
        <div className="bcc-ws-muted" style={{ marginTop: 8 }}>
          {preview.changeSummary?.join(' · ')}
          {preview.runId && <div>runId: {preview.runId}</div>}
          <DiagnosticList items={[...preview.errors, ...preview.warnings]} />
        </div>
      )}
    </section>
  );
}

function ArtifactEditor({
  detail,
  artifactType,
  label,
  onSaved,
}: {
  detail: WorkspaceRunDetailV1;
  artifactType: 'research-brief' | 'explainer-script' | 'storyboard' | 'publishing-metadata' | 'publishing-compliance' | 'thumbnail-plan';
  label: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState('{\n  "schemaVersion": "1.0.0"\n}');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<WorkspaceCommandResultV1 | null>(null);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const artifact = JSON.parse(text) as unknown;
      const command: WorkspaceCommandV1 = detail.runType === 'production'
        ? {
          type: 'put-production-artifact',
          requestId: requestId('ui.put'),
          runId: detail.runId,
          expectedRevision: detail.revision,
          expectedWorkflowFingerprint: detail.workflowFingerprint,
          artifactType: artifactType as 'research-brief' | 'explainer-script' | 'storyboard',
          artifact,
          dryRun,
        }
        : {
          type: 'put-publishing-artifact',
          requestId: requestId('ui.put'),
          runId: detail.runId,
          expectedRevision: detail.revision,
          expectedWorkflowFingerprint: detail.workflowFingerprint,
          artifactType: artifactType as 'publishing-metadata' | 'publishing-compliance' | 'thumbnail-plan',
          artifact,
          dryRun,
        };
      const result = await productionWorkspaceApi.executeCommand(command);
      setLastResult(result);
      if (result.errors.length) {
        setMessage(result.errors.map((e) => e.message).join('; '));
      } else if (!dryRun) {
        setDirty(false);
        setMessage('Saved');
        onSaved();
      } else {
        setMessage(`Dry-run ok: ${(result.changeSummary ?? []).join('; ')}`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bcc-ws-card" aria-labelledby={`editor-${artifactType}`}>
      <h3 id={`editor-${artifactType}`} style={{ marginTop: 0 }}>{label}</h3>
      {dirty && <div className="bcc-ws-muted" role="status">Unsaved changes</div>}
      <label className="bcc-ws-muted" htmlFor={`ta-${artifactType}`}>JSON artifact</label>
      <textarea
        id={`ta-${artifactType}`}
        className="bcc-ws-editor bcc-ws-focus"
        aria-invalid={Boolean(message?.includes('error') || lastResult?.errors.length)}
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
      />
      <div className="bcc-ws-actions">
        <button type="button" disabled={busy} onClick={() => void run(true)}>Dry-run save</button>
        <button type="button" disabled={busy} onClick={() => void run(false)}>Apply save</button>
      </div>
      {message && <div className="bcc-ws-muted" role="status">{message}</div>}
      {lastResult && <DiagnosticList items={[...lastResult.errors, ...lastResult.warnings]} />}
    </section>
  );
}

function RunDetailView({
  detail,
  onOpenProject,
  onReload,
}: {
  detail: WorkspaceRunDetailV1;
  onOpenProject?: (projectId: string) => void;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const command = async (cmd: WorkspaceCommandV1) => {
    setBusy(true);
    setNote(null);
    try {
      const result = await productionWorkspaceApi.executeCommand(cmd);
      if (result.errors.length) setNote(result.errors.map((e) => e.message).join('; '));
      else setNote((result.changeSummary ?? []).join('; ') || 'OK');
      if (!result.dryRun) onReload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 20 }}>{detail.name}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={detail.status} />
          <span className="bcc-ws-muted">{detail.runType} · {detail.currentStageId}</span>
          <span className="bcc-ws-muted">rev {detail.revision}</span>
          <ArtifactHashBadge hash={detail.workflowFingerprint} />
        </div>
        {detail.pendingAction && (
          <div className="bcc-ws-card" style={{ marginTop: 12 }}>
            <strong>Next action:</strong> {detail.pendingAction.label}
            {detail.pendingAction.requirements && (
              <ul className="bcc-ws-muted">
                {detail.pendingAction.requirements.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        )}
      </header>

      <section aria-labelledby="stages-h">
        <h2 id="stages-h" style={{ fontSize: 15 }}>Stage timeline</h2>
        <div className="bcc-ws-stage">
          {detail.stages.map((stage) => (
            <div key={stage.id} className="bcc-ws-stage-item">
              <div>
                <div style={{ fontWeight: 600 }}>{stage.label}</div>
                <StatusBadge status={stage.status} />
              </div>
              <div>
                {stage.externalOperation && (
                  <OperationProgress
                    phase={`${stage.externalOperation.type}: ${stage.externalOperation.status ?? 'unknown'}`}
                  />
                )}
                <DiagnosticList items={[...stage.blockers, ...stage.warnings]} />
                <div className="bcc-ws-actions">
                  {stage.availableActions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={a.destructive ? 'danger' : undefined}
                      disabled={!a.enabled || busy}
                      title={a.disabledReason}
                      onClick={() => {
                        if (a.type === 'open-project' && detail.project?.projectId) {
                          onOpenProject?.(detail.project.projectId);
                          return;
                        }
                        if (a.type === 'approve-review' || a.type === 'reject-review') {
                          const reviewId = stage.review?.reviewId;
                          if (!reviewId) return;
                          void command({
                            type: detail.runType === 'production' ? 'review-production-stage' : 'review-publishing-stage',
                            requestId: requestId('ui.review'),
                            runId: detail.runId,
                            expectedRevision: detail.revision,
                            expectedWorkflowFingerprint: detail.workflowFingerprint,
                            reviewId,
                            decision: a.type === 'approve-review' ? 'approve' : 'reject',
                            dryRun: false,
                          });
                          return;
                        }
                        if (a.type === 'execute-stage' || a.type === 'resume') {
                          void command({
                            type: detail.runType === 'production'
                              ? (a.type === 'resume' ? 'resume-production-run' : 'execute-production-stage')
                              : (a.type === 'resume' ? 'resume-publishing-run' : 'execute-publishing-stage'),
                            requestId: requestId('ui.stage'),
                            runId: detail.runId,
                            expectedRevision: detail.revision,
                            expectedWorkflowFingerprint: detail.workflowFingerprint,
                            stageId: stage.id,
                            dryRun: false,
                          } as WorkspaceCommandV1);
                          return;
                        }
                        if (a.type === 'cancel') {
                          if (!window.confirm('Cancel this run?')) return;
                          void command({
                            type: detail.runType === 'production' ? 'cancel-production-run' : 'cancel-publishing-run',
                            requestId: requestId('ui.cancel'),
                            runId: detail.runId,
                            expectedRevision: detail.revision,
                            expectedWorkflowFingerprint: detail.workflowFingerprint,
                            dryRun: false,
                          });
                        }
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bcc-ws-muted">try {stage.attempt}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="lineage-h">
        <h2 id="lineage-h" style={{ fontSize: 15 }}>Artifact lineage</h2>
        <LineageBreadcrumbs nodes={detail.lineage.nodes} />
      </section>

      <section aria-labelledby="artifacts-h">
        <h2 id="artifacts-h" style={{ fontSize: 15 }}>Artifacts</h2>
        <table className="bcc-ws-table">
          <thead>
            <tr><th>Type</th><th>Hash</th><th>Stage</th></tr>
          </thead>
          <tbody>
            {detail.artifacts.map((a) => (
              <tr key={`${a.type}-${a.hash}`}>
                <td>{a.type}</td>
                <td><ArtifactHashBadge hash={a.hash} /></td>
                <td>{a.stageId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail.delivery && (
        <section aria-labelledby="delivery-h">
          <h2 id="delivery-h" style={{ fontSize: 15 }}>Delivery</h2>
          <div className="bcc-ws-card">
            <div>bundle {detail.delivery.bundleId}</div>
            <div className="bcc-ws-muted">QA {detail.delivery.qaStatus}</div>
            <ul>
              {detail.delivery.artifacts.map((a) => (
                <li key={a.fileName}>
                  <a href={a.downloadUrl}>{a.fileName}</a>
                  {' '}
                  <ArtifactHashBadge hash={a.sha256} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {detail.reviews.filter((r) => r.status === 'pending').map((r) => (
        <section key={r.reviewId} className="bcc-ws-card" aria-labelledby={`rev-${r.reviewId}`}>
          <h3 id={`rev-${r.reviewId}`} style={{ marginTop: 0 }}>
            Review {r.reviewType} · {r.stageId}
          </h3>
          <div className="bcc-ws-muted">
            Artifacts: {r.artifactReferences.map((a) => (
              <span key={a.hash} style={{ marginRight: 8 }}>
                {a.type} <ArtifactHashBadge hash={a.hash} />
              </span>
            ))}
          </div>
          <ReviewDecisionPanel
            release={r.reviewType === 'release'}
            disabled={busy}
            onApprove={() => void command({
              type: detail.runType === 'production' ? 'review-production-stage' : 'review-publishing-stage',
              requestId: requestId('ui.rev.ok'),
              runId: detail.runId,
              expectedRevision: detail.revision,
              expectedWorkflowFingerprint: detail.workflowFingerprint,
              reviewId: r.reviewId,
              decision: 'approve',
              dryRun: false,
            })}
            onReject={() => void command({
              type: detail.runType === 'production' ? 'review-production-stage' : 'review-publishing-stage',
              requestId: requestId('ui.rev.no'),
              runId: detail.runId,
              expectedRevision: detail.revision,
              expectedWorkflowFingerprint: detail.workflowFingerprint,
              reviewId: r.reviewId,
              decision: 'reject',
              notes: 'Rejected from workspace UI',
              dryRun: false,
            })}
          />
        </section>
      ))}

      {detail.runType === 'production' && detail.pendingAction?.type === 'put-artifact' && (
        <>
          {detail.pendingAction.stageId === 'research' && (
            <ArtifactEditor detail={detail} artifactType="research-brief" label="Research brief editor" onSaved={onReload} />
          )}
          {detail.pendingAction.stageId === 'script' && (
            <ArtifactEditor detail={detail} artifactType="explainer-script" label="Script editor" onSaved={onReload} />
          )}
          {detail.pendingAction.stageId === 'storyboard' && (
            <ArtifactEditor detail={detail} artifactType="storyboard" label="Storyboard editor" onSaved={onReload} />
          )}
        </>
      )}

      {detail.runType === 'publishing' && detail.pendingAction?.type === 'put-artifact' && (
        <>
          <ArtifactEditor detail={detail} artifactType="publishing-metadata" label="Publishing metadata" onSaved={onReload} />
          <ArtifactEditor detail={detail} artifactType="publishing-compliance" label="Compliance declarations" onSaved={onReload} />
          <ArtifactEditor detail={detail} artifactType="thumbnail-plan" label="Thumbnail plan" onSaved={onReload} />
        </>
      )}

      {detail.project?.projectId && (
        <div className="bcc-ws-actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => onOpenProject?.(detail.project!.projectId!)}>
            Open project / edit-session review
          </button>
        </div>
      )}

      <DiagnosticList items={[...detail.errors, ...detail.warnings]} />
      {note && <div className="bcc-ws-muted" role="status">{note}</div>}
    </div>
  );
}

export default function ProductionWorkspace({
  onHome,
  onOpenProject,
}: {
  onHome: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const [route, navigate] = useHashRoute();
  const [overview, setOverview] = useState<WorkspaceOverviewV1 | null>(null);
  const [detail, setDetail] = useState<WorkspaceRunDetailV1 | null>(null);
  const [reviews, setReviews] = useState<WorkspaceReviewQueueV1 | null>(null);
  const [operations, setOperations] = useState<WorkspaceOperationViewV1[]>([]);
  const [health, setHealth] = useState<WorkspaceHealthReportV1 | null>(null);
  const [plan, setPlan] = useState<WorkspaceMigrationPlanV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState(loadWorkspacePrefs);
  const [query, setQuery] = useState('');

  const refreshOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await productionWorkspaceApi.getOverview({
        search: query || undefined,
        limit: prefs.pageSize,
      });
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query, prefs.pageSize]);

  const refreshDetail = useCallback(async () => {
    if (route.page === 'production' && route.runId) {
      setLoading(true);
      try {
        setDetail(await productionWorkspaceApi.getProductionRun(route.runId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    } else if (route.page === 'publishing' && route.runId) {
      setLoading(true);
      try {
        setDetail(await productionWorkspaceApi.getPublishingRun(route.runId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    } else {
      setDetail(null);
    }
  }, [route]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  useEffect(() => {
    if (route.page === 'reviews') {
      void productionWorkspaceApi.listReviews({ status: 'pending' }).then(setReviews).catch((e) => setError(String(e)));
    }
    if (route.page === 'operations' || route.page === 'overview') {
      void productionWorkspaceApi.listOperations().then((r) => setOperations(r.operations)).catch(() => undefined);
    }
    if (route.page === 'health') {
      void productionWorkspaceApi.getHealth({ mode: 'quick' }).then(setHealth).catch((e) => setError(String(e)));
    }
  }, [route.page]);

  useEffect(() => {
    if (!prefs.autoRefresh) return;
    const t = window.setInterval(() => {
      if (route.page === 'overview') void refreshOverview();
      if ((route.page === 'production' || route.page === 'publishing') && 'runId' in route && route.runId) {
        void refreshDetail();
      }
    }, 8000);
    return () => window.clearInterval(t);
  }, [prefs.autoRefresh, route, refreshOverview, refreshDetail]);

  useEffect(() => {
    saveWorkspacePrefs({ ...prefs, lastPage: route.page === 'production' || route.page === 'publishing' ? route.page : route.page as never });
  }, [prefs, route.page]);

  let body: ReactNode = null;
  if (error && !overview && !detail) {
    body = <ErrorState message={error} onRetry={() => void refreshOverview()} />;
  } else if (loading && !overview && !detail) {
    body = <div className="bcc-ws-muted" role="status">Loading workspace…</div>;
  } else if (route.page === 'overview') {
    body = (
      <div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Workspace overview</h1>
        {overview && (
          <>
            <div className="bcc-ws-grid" style={{ marginBottom: 16 }}>
              {[
                ['Active production', overview.counts.activeProductionRuns],
                ['Waiting production', overview.counts.waitingProductionRuns],
                ['Blocked production', overview.counts.blockedProductionRuns],
                ['Active publishing', overview.counts.activePublishingRuns],
                ['Pending reviews', overview.counts.pendingReviews],
                ['Active operations', overview.counts.activeOperations],
              ].map(([label, value]) => (
                <div key={String(label)} className="bcc-ws-card">
                  <div className="bcc-ws-muted">{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
              <div className="bcc-ws-card">
                <div className="bcc-ws-muted">Health</div>
                <StatusBadge status={overview.healthSummary.status} />
                <div className="bcc-ws-muted">{overview.healthSummary.issueCount} issue(s)</div>
              </div>
            </div>
            <label className="bcc-ws-muted">
              Search runs
              <input
                className="bcc-ws-focus"
                style={{ display: 'block', width: '100%', marginTop: 4, marginBottom: 12 }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <h2 style={{ fontSize: 15 }}>Recent runs</h2>
            {overview.recentRuns.length === 0 ? (
              <EmptyState title="No runs yet" detail="Create a production run to begin." />
            ) : (
              <table className="bcc-ws-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Type</th><th>Status</th><th>Stage</th><th>Progress</th><th />
                  </tr>
                </thead>
                <tbody>
                  {overview.recentRuns.map((r) => (
                    <tr key={`${r.runType}-${r.runId}`}>
                      <td>
                        {r.name}
                        {r.invalid && <span className="bcc-ws-muted"> (invalid)</span>}
                      </td>
                      <td>{r.runType}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.currentStageId}</td>
                      <td>{r.progress.percent}%</td>
                      <td>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => navigate({
                            page: r.runType === 'production' ? 'production' : 'publishing',
                            runId: r.runId,
                          })}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h2 style={{ fontSize: 15 }}>Pending reviews</h2>
            {overview.pendingReviews.length === 0 ? (
              <EmptyState title="No pending reviews" />
            ) : (
              <ul>
                {overview.pendingReviews.map((r) => (
                  <li key={r.reviewId}>
                    {r.reviewType} · {r.runName} · {r.stageId}
                  </li>
                ))}
              </ul>
            )}
            <CreateProductionForm onCreated={(runId) => navigate({ page: 'production', runId })} />
          </>
        )}
      </div>
    );
  } else if ((route.page === 'production' || route.page === 'publishing') && route.runId && detail) {
    body = (
      <RunDetailView
        detail={detail}
        onOpenProject={onOpenProject}
        onReload={() => void refreshDetail()}
      />
    );
  } else if (route.page === 'production' || route.page === 'publishing') {
    const list = (overview?.recentRuns ?? []).filter((r) =>
      route.page === 'production' ? r.runType === 'production' : r.runType === 'publishing');
    body = (
      <div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>
          {route.page === 'production' ? 'Production runs' : 'Publishing runs'}
        </h1>
        {route.page === 'production' && (
          <CreateProductionForm onCreated={(runId) => navigate({ page: 'production', runId })} />
        )}
        {list.length === 0 ? <EmptyState title="No runs" /> : (
          <table className="bcc-ws-table">
            <thead>
              <tr><th>Name</th><th>Status</th><th>Stage</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.runId}>
                  <td>{r.name}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.currentStageId}</td>
                  <td>
                    <button type="button" onClick={() => navigate({ page: route.page, runId: r.runId })}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  } else if (route.page === 'reviews') {
    body = (
      <div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Review queue</h1>
        {!reviews?.items.length ? <EmptyState title="No reviews" /> : (
          <table className="bcc-ws-table">
            <thead>
              <tr><th>Type</th><th>Run</th><th>Stage</th><th>Artifacts</th><th /></tr>
            </thead>
            <tbody>
              {reviews.items.map((r) => (
                <tr key={r.reviewId}>
                  <td>{r.reviewType}</td>
                  <td>{r.runName}</td>
                  <td>{r.stageId}</td>
                  <td>
                    {r.artifactReferences.map((a) => (
                      <div key={a.hash}>{a.type} <ArtifactHashBadge hash={a.hash} /></div>
                    ))}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => navigate({
                        page: r.runType === 'production' ? 'production' : 'publishing',
                        runId: r.runId,
                      })}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  } else if (route.page === 'operations') {
    body = (
      <div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Operations</h1>
        {!operations.length ? <EmptyState title="No active operations" /> : (
          <div className="bcc-ws-grid">
            {operations.map((op) => (
              <div key={op.operationId} className="bcc-ws-card">
                <div style={{ fontWeight: 600 }}>{op.type}</div>
                <StatusBadge status={op.status} />
                <OperationProgress {...op.progress} />
                <RecoveryActions actions={op.recoveryActions} />
                {op.error && <DiagnosticList items={[op.error]} />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else if (route.page === 'deliveries') {
    const deliveryRuns = (overview?.recentRuns ?? []).filter((r) =>
      r.runType === 'production' && r.status === 'completed');
    body = (
      <div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Deliveries</h1>
        {!deliveryRuns.length ? (
          <EmptyState title="No completed deliveries" detail="Complete a production render to list bundles." />
        ) : (
          <ul>
            {deliveryRuns.map((r) => (
              <li key={r.runId}>
                <button type="button" onClick={() => navigate({ page: 'production', runId: r.runId })}>
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } else if (route.page === 'health') {
    body = (
      <div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Workspace health</h1>
        <div className="bcc-ws-actions">
          <button type="button" onClick={() => void productionWorkspaceApi.getHealth({ mode: 'quick' }).then(setHealth)}>
            Quick check
          </button>
          <button type="button" onClick={() => void productionWorkspaceApi.getHealth({ mode: 'deep' }).then(setHealth)}>
            Deep check
          </button>
          <button
            type="button"
            onClick={() => void productionWorkspaceApi.planMigrations().then(setPlan)}
          >
            Plan migrations
          </button>
          {plan && (
            <button
              type="button"
              onClick={() => void productionWorkspaceApi.applyMigrations({
                planId: plan.planId,
                planHash: plan.planHash,
                dryRun: false,
              }).then(() => productionWorkspaceApi.planMigrations().then(setPlan))}
            >
              Apply migration plan
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              const bundle = await productionWorkspaceApi.exportDiagnostics();
              const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `workspace-diagnostics-${bundle.bundleHash.slice(0, 8)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export diagnostics
          </button>
        </div>
        {health && (
          <>
            <StatusBadge status={health.status} />
            <table className="bcc-ws-table">
              <thead>
                <tr><th>Check</th><th>Status</th><th>Summary</th></tr>
              </thead>
              <tbody>
                {health.checks.map((c) => (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      {c.summary}
                      {c.recovery && <div className="bcc-ws-muted">{c.recovery}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <DiagnosticList items={[...health.errors, ...health.warnings]} developer={prefs.developerDetailsExpanded} />
          </>
        )}
        {plan && (
          <div className="bcc-ws-card" style={{ marginTop: 12 }}>
            <div>Plan {plan.planId}</div>
            <ArtifactHashBadge hash={plan.planHash} />
            <ul>
              {plan.migrations.map((m) => (
                <li key={m.migrationId}>{m.migrationId} · {m.affectedRecords} record(s)</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else if (route.page === 'distribution') {
    body = <DistributionOverview />;
  } else if (route.page === 'backup') {
    body = <BackupRestorePage />;
  } else if (route.page === 'connections') {
    body = <ConnectionOnboardingPage />;
  } else if (route.page === 'qualification') {
    body = <ReleaseCandidatePanel />;
  } else if (route.page === 'settings') {
    body = (
      <div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Workspace settings</h1>
        <p className="bcc-ws-muted">
          UI preferences only — never credentials. OAuth uses external browser + encrypted vault (Connections).
        </p>
        <label className="bcc-ws-muted" style={{ display: 'block', marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={prefs.autoRefresh}
            onChange={(e) => setPrefs({ ...prefs, autoRefresh: e.target.checked })}
          />
          {' '}Auto-refresh
        </label>
        <label className="bcc-ws-muted" style={{ display: 'block', marginBottom: 8 }}>
          Page size
          <input
            type="number"
            min={5}
            max={100}
            value={prefs.pageSize}
            onChange={(e) => setPrefs({ ...prefs, pageSize: Number(e.target.value) || 20 })}
          />
        </label>
        <label className="bcc-ws-muted" style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={prefs.developerDetailsExpanded}
            onChange={(e) => setPrefs({ ...prefs, developerDetailsExpanded: e.target.checked })}
          />
          {' '}Expand redacted developer details
        </label>
      </div>
    );
  }

  return (
    <WorkspaceShell route={route} onNavigate={navigate} onHome={onHome}>
      {error && overview && <ErrorState message={error} onRetry={() => void refreshOverview()} />}
      {body}
    </WorkspaceShell>
  );
}
