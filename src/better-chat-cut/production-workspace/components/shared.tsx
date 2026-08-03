import { theme } from '../../../theme';

export function StatusBadge({ status }: { status: string }) {
  const tone = status.includes('fail') || status.includes('block') || status === 'error'
    ? '#f88'
    : status.includes('await') || status.includes('warn')
      ? '#fc6'
      : status.includes('complete') || status === 'healthy' || status === 'pass' || status === 'approved'
        ? '#8d8'
        : theme.textDim;
  return (
    <span className="bcc-ws-badge" style={{ color: tone }} role="status" aria-label={`Status ${status}`}>
      {status}
    </span>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="bcc-ws-empty" role="status">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {detail && <div className="bcc-ws-muted">{detail}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bcc-ws-error" role="alert">
      <div>{message}</div>
      {onRetry && (
        <button type="button" className="bcc-ws-focus" style={{ marginTop: 8 }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function DiagnosticList({
  items,
  developer,
}: {
  items: Array<{
    severity: string;
    code: string;
    message: string;
    stageId?: string;
    recovery?: string;
    details?: Record<string, unknown>;
  }>;
  developer?: boolean;
}) {
  if (!items.length) return null;
  return (
    <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
      {items.map((d, i) => (
        <li key={`${d.code}-${i}`} style={{ marginBottom: 6 }}>
          <strong>{d.severity}</strong>
          {' '}
          <code>{d.code}</code>
          {': '}
          {d.message}
          {d.stageId && <span className="bcc-ws-muted"> · {d.stageId}</span>}
          {d.recovery && <div className="bcc-ws-muted">Recovery: {d.recovery}</div>}
          {developer && d.details && (
            <pre className="bcc-ws-muted" style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(d.details, null, 2)}
            </pre>
          )}
          <button
            type="button"
            className="bcc-ws-focus"
            style={{ fontSize: 11, marginTop: 2 }}
            onClick={() => void navigator.clipboard?.writeText(JSON.stringify(d))}
          >
            Copy diagnostic
          </button>
        </li>
      ))}
    </ul>
  );
}

export function OperationProgress({
  phase,
  percent,
  bytesUploaded,
  totalBytes,
}: {
  phase: string;
  percent?: number;
  bytesUploaded?: number;
  totalBytes?: number;
}) {
  const value = typeof percent === 'number' ? Math.max(0, Math.min(100, percent)) : undefined;
  return (
    <div>
      <div className="bcc-ws-muted">{phase}</div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={`Operation progress ${phase}`}
        style={{
          height: 8,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
          marginTop: 4,
        }}
      >
        <div style={{
          width: `${value ?? 8}%`,
          height: '100%',
          background: '#6ea8fe',
          transition: 'width 200ms linear',
        }}
        />
      </div>
      {bytesUploaded != null && totalBytes != null && (
        <div className="bcc-ws-muted">{bytesUploaded} / {totalBytes} bytes</div>
      )}
    </div>
  );
}

export function ArtifactHashBadge({ hash }: { hash: string }) {
  const short = hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
  return (
    <code title={hash} className="bcc-ws-muted" style={{ fontSize: 11 }}>{short}</code>
  );
}

export function LineageBreadcrumbs({
  nodes,
}: {
  nodes: Array<{ type: string; hash: string; parents: Array<{ type: string; hash: string }> }>;
}) {
  if (!nodes.length) return <EmptyState title="No lineage yet" />;
  return (
    <ol style={{ paddingLeft: 18, fontSize: 12.5 }}>
      {nodes.map((n) => (
        <li key={`${n.type}-${n.hash}`} style={{ marginBottom: 4 }}>
          {n.type} <ArtifactHashBadge hash={n.hash} />
          {n.parents.length > 0 && (
            <span className="bcc-ws-muted">
              {' '}← {n.parents.map((p) => p.type).join(', ')}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ReviewDecisionPanel({
  onApprove,
  onReject,
  disabled,
  release,
}: {
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  release?: boolean;
}) {
  return (
    <div className="bcc-ws-actions" role="group" aria-label="Review decision">
      <button type="button" disabled={disabled} onClick={onApprove}>
        {release ? 'Approve release' : 'Approve'}
      </button>
      <button type="button" className="danger" disabled={disabled} onClick={onReject}>
        Reject
      </button>
    </div>
  );
}

export function RecoveryActions({ actions }: { actions: string[] }) {
  if (!actions.length) return null;
  return (
    <div className="bcc-ws-muted">
      Recovery: {actions.join(' · ')}
    </div>
  );
}
