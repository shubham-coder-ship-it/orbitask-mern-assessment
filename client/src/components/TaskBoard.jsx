import Icon from './Icon.jsx';
import { Avatar, OverdueBadge, PriorityBadge } from './Badges.jsx';
import { STATUS, formatDate } from '../utils/format.js';

// Status changes use a real <select> (keyboard accessible) and persist through onStatusChange → PATCH.
export default function TaskBoard({ tasks, onEdit, onDelete, onStatusChange, canManage, canEdit, busyId }) {
  return (
    <div className="board">
      {STATUS.map((col) => {
        const items = tasks.filter((t) => t.status === col.value);
        return (
          <section className="column" key={col.value} aria-label={col.label}>
            <div className="column-head"><span>{col.label}</span><span className="count">{items.length}</span></div>
            {items.length === 0 && <div className="empty-col">No tasks</div>}
            {items.map((t) => (
              <article className="task-card" key={t.id}>
                <h3 onClick={() => onEdit(t)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onEdit(t)}>{t.title}</h3>
                <div className="small muted">{t.project?.name}</div>
                <div className="meta">
                  <PriorityBadge value={t.priority} />
                  {t.overdue && <OverdueBadge />}
                </div>
                <div className="meta">
                  <span className={`small ${t.overdue ? 'overdue-text' : 'muted'}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="calendar" size={14} />{formatDate(t.dueDate)}</span>
                  {t.assignee ? <Avatar name={t.assignee.name} size="sm" /> : <span className="small muted">Unassigned</span>}
                </div>
                <div className="foot">
                  <select className="select" aria-label={`Status of ${t.title}`} value={t.status} disabled={busyId === t.id || !canEdit(t)} onChange={(e) => onStatusChange(t, e.target.value)}>
                    {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <span className="row-actions">
                    {canEdit(t) && <button className="icon-btn" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}><Icon name="edit" size={15} /></button>}
                    {canManage(t) && <button className="icon-btn" onClick={() => onDelete(t)} aria-label={`Delete ${t.title}`}><Icon name="trash" size={15} /></button>}
                  </span>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
