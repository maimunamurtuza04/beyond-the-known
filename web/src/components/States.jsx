import { Icon } from './Icons.jsx';
import { Skeleton } from './Skeleton.jsx';

export function InlineLoading({ label = 'Loading the record' }) {
  return (
    <div className="inline-loading">
      <span className="pulse-dot" />
      <span>{label}…</span>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="page-loading" aria-busy="true">
      <Skeleton height={132} />
      <div className="stat-grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} height={112} />
        ))}
      </div>
      <div className="grid-2">
        <Skeleton height={320} />
        <Skeleton height={320} />
      </div>
      <Skeleton height={260} />
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  return (
    <div className={`state-box error ${compact ? 'compact' : ''}`}>
      <span className="state-icon"><Icon name="alert" size={20} /></span>
      <div>
        <h3>Could not reach the local API</h3>
        <p>{error}</p>
        <p className="state-hint">
          The demo runs on generated mock data served by its own Express API — no database is
          required. In development, start both servers with <code>npm run dev</code>, then retry.
        </p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          <Icon name="refresh" size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here', description, icon = 'info' }) {
  return (
    <div className="state-box empty">
      <span className="state-icon"><Icon name={icon} size={20} /></span>
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
