export const LoadingState = ({ label = 'Loading…' }) => (
  <div className="state" role="status">
    <div className="spinner" />
    {label}
  </div>
);

export const EmptyState = ({ title, text, action }) => (
  <div className="state">
    <h3>{title}</h3>
    <p>{text}</p>
    {action}
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="state" role="alert">
    <h3>Something went wrong</h3>
    <p>{error?.message || 'Unexpected error'}</p>
    {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
  </div>
);
