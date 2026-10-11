import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar, OverdueBadge, PriorityBadge, StatusBadge } from './Badges.jsx';
import { formatDate } from '../utils/format.js';

// compact=true is used on the dashboard (no start date / actions column).
export default function TaskTable({ tasks, onOpen, onEdit, onDelete, canManage, compact }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Task</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Status</th>
            {!compact && <th>Start</th>}<th>Due</th>{!compact && <th><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className="title-cell"><button onClick={() => onOpen(t)}>{t.title}</button></td>
              <td>{t.project ? <Link to={`/projects/${t.projectId}`}>{t.project.name}</Link> : '—'}</td>
              <td>{t.assignee ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={t.assignee.name} size="sm" />{t.assignee.name}</span> : <span className="muted">Unassigned</span>}</td>
              <td><PriorityBadge value={t.priority} /></td>
              <td><StatusBadge value={t.status} /></td>
              {!compact && <td>{formatDate(t.startDate)}</td>}
              <td>
                <span className={t.overdue ? 'overdue-text' : ''}>{formatDate(t.dueDate)}</span>
                {t.overdue && <> <OverdueBadge /></>}
              </td>
              {!compact && (
                <td>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}><Icon name="edit" size={16} /></button>
                    {canManage?.(t) && <button className="icon-btn" onClick={() => onDelete(t)} aria-label={`Delete ${t.title}`}><Icon name="trash" size={16} /></button>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
