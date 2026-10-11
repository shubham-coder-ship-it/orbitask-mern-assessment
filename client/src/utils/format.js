export const STATUS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
];
export const PRIORITY = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];
export const PROJECT_STATUS = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const labelOf = (list) => (v) => list.find((x) => x.value === v)?.label || v;
export const statusLabel = labelOf(STATUS);
export const priorityLabel = labelOf(PRIORITY);
export const projectStatusLabel = labelOf(PROJECT_STATUS);

// Dates are stored as UTC midnight, so format in UTC to avoid off-by-one-day shifts.
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export const toInputDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export function timeAgo(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

export function describeActivity(a) {
  const m = a.metadata || {};
  switch (a.action) {
    case 'project.created': return `created project “${m.name}”`;
    case 'project.updated': return `updated project “${m.name}”`;
    case 'member.added': return `added ${m.member || 'a member'} to “${m.name}”`;
    case 'member.removed': return `removed ${m.member || 'a member'} from “${m.name}”`;
    case 'task.created': return `created task “${m.title}”`;
    case 'task.assigned': return `changed the assignee of “${m.title}”`;
    case 'task.status_changed': return `moved “${m.title}” from ${statusLabel(m.from)} to ${statusLabel(m.to)}`;
    case 'task.priority_changed': return `set priority of “${m.title}” to ${priorityLabel(m.to)}`;
    case 'task.completed': return `completed “${m.title}”`;
    case 'task.deleted': return `deleted task “${m.title}”`;
    default: return a.action;
  }
}
