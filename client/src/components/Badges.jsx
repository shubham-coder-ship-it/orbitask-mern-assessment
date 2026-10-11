import { priorityLabel, projectStatusLabel, statusLabel, initials } from '../utils/format.js';

export const StatusBadge = ({ value }) => <span className={`badge ${value}`}>{statusLabel(value)}</span>;
export const PriorityBadge = ({ value }) => <span className={`badge ${value}`}>{priorityLabel(value)}</span>;
export const ProjectStatusBadge = ({ value }) => <span className={`badge ${value}`}>{projectStatusLabel(value)}</span>;
export const OverdueBadge = () => <span className="badge overdue">Overdue</span>;

export function Avatar({ name, size }) {
  return (
    <span className={`avatar ${size || ''}`} title={name} aria-label={name}>
      {initials(name)}
    </span>
  );
}

export function Progress({ done, total, percent }) {
  const pct = percent ?? (total ? Math.round((done / total) * 100) : 0);
  return (
    <div className="progress-row">
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <small>{total === undefined ? `${pct}%` : `${done}/${total} · ${pct}%`}</small>
    </div>
  );
}
