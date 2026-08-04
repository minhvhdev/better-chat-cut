import { useState } from 'react';
import { EmptyState, ErrorState, StatusBadge } from './components/shared.tsx';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export function DistributionOverview() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function loadCaps() {
    setBusy(true);
    setError(null);
    try {
      setResult(await json('/api/better-chat-cut/distribution/capabilities'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function planAndBuild() {
    setBusy(true);
    setError(null);
    try {
      const caps = await json<{ host: { platform: string; arch: string } }>(
        '/api/better-chat-cut/distribution/capabilities',
      );
      const p = caps.host.platform;
      const format = p === 'windows' ? 'nsis' : p === 'macos' ? 'dmg' : 'AppImage';
      const planned = await json<{ plan: unknown }>('/api/better-chat-cut/distribution/plan', {
        method: 'POST',
        body: JSON.stringify({
          request: {
            id: `ui.${Date.now()}`,
            name: 'UI development plan',
            targets: [{
              platform: p,
              arch: caps.host.arch === 'arm64' ? 'arm64' : 'x64',
              formats: [format],
              required: true,
            }],
            qualificationProfile: 'development',
            updatePolicy: {
              mode: 'disabled',
              releaseFeedConfigured: false,
              automaticDownload: false,
              automaticInstall: false,
            },
          },
        }),
      });
      const op = await json('/api/better-chat-cut/distribution/submit', {
        method: 'POST',
        body: JSON.stringify({ requestId: `ui-${Date.now()}`, plan: planned.plan }),
      });
      setResult({ planned, operation: op });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bcc-ws-panel">
      <h2>Desktop distribution</h2>
      <p className="bcc-ws-muted">
        Plans, signed profile references, and update policy (manual only — no auto-update in M7B).
        Secrets never appear in manifests.
      </p>
      <div className="bcc-ws-actions">
        <button type="button" className="bcc-ws-nav-btn" disabled={busy} onClick={() => void loadCaps()}>
          Load capabilities
        </button>
        <button type="button" className="bcc-ws-nav-btn" disabled={busy} onClick={() => void planAndBuild()}>
          Plan + development build
        </button>
      </div>
      {error && <ErrorState message={error} />}
      {!result && !error && <EmptyState title="No plan yet" detail="Load host capabilities or run a development distribution operation." />}
      {result ? (
        <pre className="bcc-ws-pre" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function ConnectionOnboardingPage() {
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const s = await json<Record<string, unknown>>('/api/better-chat-cut/connections/onboarding/begin', {
        method: 'POST',
        body: JSON.stringify({
          requestId: `ui-${Date.now()}`,
          openBrowser: false,
          request: {
            schemaVersion: '1.0.0',
            platform: 'youtube',
            connectionId: 'youtube.primary',
            requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
          },
        }),
      });
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function completeFake() {
    if (!session?.sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const s = await json<Record<string, unknown>>('/api/better-chat-cut/connections/onboarding/complete-fake', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bcc-ws-panel">
      <h2>Connection onboarding</h2>
      <p className="bcc-ws-muted">
        External-browser OAuth with loopback callback, state + PKCE, and encrypted vault.
        Tokens never enter this UI.
      </p>
      <div className="bcc-ws-actions">
        <button type="button" className="bcc-ws-nav-btn" disabled={busy} onClick={() => void begin()}>
          Begin YouTube onboarding
        </button>
        <button type="button" className="bcc-ws-nav-btn" disabled={busy || !session} onClick={() => void completeFake()}>
          Complete fake (dev)
        </button>
      </div>
      {session?.status ? <StatusBadge status={String(session.status)} /> : null}
      {error && <ErrorState message={error} />}
      {session ? (
        <pre className="bcc-ws-pre" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {JSON.stringify(session, null, 2)}
        </pre>
      ) : (
        <EmptyState title="No session" detail="Start onboarding to obtain a safe authorization URL." />
      )}
    </div>
  );
}

export function BackupRestorePage() {
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const plan = await json('/api/better-chat-cut/backups/plan', {
        method: 'POST',
        body: JSON.stringify({
          request: {
            schemaVersion: '1.0.0',
            id: `bak.${Date.now()}`,
            name: 'UI backup',
            profile: 'workflows-only',
          },
        }),
      });
      const create = await json('/api/better-chat-cut/backups/create', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      }) as { backupId?: string; status: string };
      let validate = null;
      let restorePlan = null;
      if (create.backupId) {
        validate = await json('/api/better-chat-cut/backups/validate', {
          method: 'POST',
          body: JSON.stringify({ backupId: create.backupId }),
        });
        restorePlan = await json('/api/better-chat-cut/restores/plan', {
          method: 'POST',
          body: JSON.stringify({ backupId: create.backupId, dryRun: true }),
        });
      }
      setLog({ plan, create, validate, restorePlan });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bcc-ws-panel">
      <h2>Backup & restore</h2>
      <p className="bcc-ws-muted">
        Workflows-only or complete local workspace. Credentials are never included.
        Restores require confirmation and create a pre-restore backup.
      </p>
      <button type="button" className="bcc-ws-nav-btn" disabled={busy} onClick={() => void run()}>
        Plan + create + validate (dry restore plan)
      </button>
      {error && <ErrorState message={error} />}
      {log ? (
        <pre className="bcc-ws-pre" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {JSON.stringify(log, null, 2)}
        </pre>
      ) : (
        <EmptyState title="No backup yet" detail="Create a backup plan to review areas and hashes." />
      )}
    </div>
  );
}

export function ReleaseCandidatePanel() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const prepare = await json('/api/better-chat-cut/release-candidates/prepare', {
        method: 'POST',
        body: JSON.stringify({
          id: `rc.ui.${Date.now()}`,
          name: 'UI internal candidate',
          version: '0.1.7',
          distributionManifestHash: 'a'.repeat(64),
          channel: 'internal',
        }),
      });
      const validate = await json('/api/better-chat-cut/release-candidates/validate', {
        method: 'POST',
        body: JSON.stringify({ plan: prepare }),
      });
      setResult({ prepare, validate });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bcc-ws-panel">
      <h2>Release candidate</h2>
      <p className="bcc-ws-muted">
        Qualification matrix, security/update policy checks, and roadmap closure gate.
        No override for failed required checks.
      </p>
      <button type="button" className="bcc-ws-nav-btn" disabled={busy} onClick={() => void run()}>
        Prepare + validate (internal)
      </button>
      {error && <ErrorState message={error} />}
      {result ? (
        <pre className="bcc-ws-pre" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : (
        <EmptyState title="No candidate" detail="Prepare an internal candidate to run automated checks." />
      )}
    </div>
  );
}
