import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import TaskTable from '../components/TaskTable.jsx';
import TaskBoard from '../components/TaskBoard.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import { PRIORITY, STATUS } from '../utils/format.js';
import { useTaskActions } from '../features/tasks/useTaskActions.jsx';

export default function TasksPage() {
  const { version, openTaskForm } = useApp();
  const actions = useTaskActions();
  const [params, setParams] = useSearchParams();
  const get = (k, d = '') => params.get(k) || d;
  const view = get('view', 'list');
  const page = Number(get('page', 1));
  const [q, setQ] = useState(get('q'));

  // Keep the local search box in sync when the topbar search changes the URL.
  useEffect(() => { setQ(get('q')); }, [params.get('q')]); // eslint-disable-line
  useEffect(() => {
    const id = setTimeout(() => { if (q !== get('q')) update({ q, page: 1 }); }, 300);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v === null || v === undefined || (k === 'page' && Number(v) === 1) ? next.delete(k) : next.set(k, v)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const lookups = useAsync(async () => {
    const [p, u] = await Promise.all([api.get('/projects'), api.get('/users')]);
    return { projects: p.projects, users: u.users };
  }, []);

  const query = { q: get('q'), projectId: get('project'), status: get('status'), priority: get('priority'), assignedTo: get('assignee'), due: get('due'), sort: get('sort', 'createdAt'), page: view === 'board' ? 1 : page, limit: view === 'board' ? 100 : 15 };
  const { data, error, loading, reload } = useAsync(() => api.get('/tasks', query), [JSON.stringify(query), version]);
  const filtered = Boolean(query.q || query.projectId || query.status || query.priority || query.assignedTo || query.due);
  const sel = (key, label, options) => (
    <>
      <label className="sr-only" htmlFor={`f-${key}`}>{label}</label>
      <select id={`f-${key}`} className="select" value={get(key)} onChange={(e) => update({ [key]: e.target.value })}>{options}</select>
    </>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>Tasks</h1><p>{data ? `${data.pagination.total} task${data.pagination.total === 1 ? '' : 's'}${filtered ? ' match your filters' : ''}` : 'Loading…'}</p></div>
        <button className="btn btn-primary" onClick={() => openTaskForm()}><Icon name="plus" size={16} />New Task</button>
      </div>
      <div className="toolbar">
        <div className="search"><Icon name="search" size={16} /><label className="sr-only" htmlFor="task-q">Search tasks</label><input id="task-q" className="input" style={{ paddingLeft: 34, width: '100%' }} placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {sel('project', 'Project', <><option value="">All projects</option>{lookups.data?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</>)}
        {sel('status', 'Status', <><option value="">All statuses</option>{STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</>)}
        {sel('priority', 'Priority', <><option value="">All priorities</option>{PRIORITY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</>)}
        {sel('assignee', 'Assignee', <><option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>{lookups.data?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</>)}
        {sel('due', 'Deadline', <><option value="">Any deadline</option><option value="overdue">Overdue</option><option value="week">Due in 7 days</option><option value="none">No due date</option></>)}
        {sel('sort', 'Sort', <><option value="createdAt">Newest</option><option value="dueDate">Due date</option><option value="priority">Priority</option></>)}
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === 'list'} onClick={() => update({ view: '' })}>List</button>
          <button aria-pressed={view === 'board'} onClick={() => update({ view: 'board' })}>Board</button>
        </div>
        {filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setParams({ ...(view === 'board' ? { view } : {}) }, { replace: true }); }}>Clear filters</button>}
      </div>
      {loading && !data ? <div className="card"><LoadingState /></div> : error ? <div className="card"><ErrorState error={error} onRetry={reload} /></div> : data.tasks.length === 0 && view === 'list' ? (
        <div className="card"><EmptyState title={filtered ? 'No tasks match these filters' : 'No tasks yet'} text={filtered ? 'Try adjusting or clearing the filters.' : 'Create a task to start tracking work.'} action={!filtered && <button className="btn btn-primary" onClick={() => openTaskForm()}>New Task</button>} /></div>
      ) : view === 'board' ? (
        <TaskBoard tasks={data.tasks} onEdit={actions.edit} onDelete={actions.remove} onStatusChange={actions.changeStatus} canManage={actions.canManage} canEdit={actions.canEdit} busyId={actions.busyId} />
      ) : (
        <div className="card">
          <TaskTable tasks={data.tasks} onOpen={actions.edit} onEdit={actions.edit} onDelete={actions.remove} canManage={actions.canManage} />
          <div className="pager">
            <span>Page {data.pagination.page} of {data.pagination.pages}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>Previous</button>
              <button className="btn btn-sm" disabled={page >= data.pagination.pages} onClick={() => update({ page: page + 1 })}>Next</button>
            </span>
          </div>
        </div>
      )}
      {data?.pagination.total > 100 && view === 'board' && <p className="small muted" style={{ marginTop: 10 }}>Showing the first 100 tasks. Use filters to narrow the board.</p>}
      {actions.dialog}
    </>
  );
}
