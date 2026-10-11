import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { Avatar, ProjectStatusBadge, Progress } from '../components/Badges.jsx';
import ProjectForm from '../components/ProjectForm.jsx';
import MembersDialog from '../components/MembersDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { PROJECT_STATUS, formatDate } from '../utils/format.js';

export default function ProjectsPage() {
  const { user, isAdmin } = useAuth();
  const { toast, version, refresh } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [modal, setModal] = useState(params.get('new') && isAdmin ? { type: 'form' } : null);
  const [debounced, setDebounced] = useState(q);

  useEffect(() => { const id = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(id); }, [q]);
  useEffect(() => { if (params.get('new')) setParams({}, { replace: true }); }, []); // eslint-disable-line

  const { data, error, loading, reload } = useAsync(() => api.get('/projects', { q: debounced, status, sort, order: sort === 'name' ? 'asc' : 'desc' }), [debounced, status, sort, version]);
  const close = () => setModal(null);

  return (
    <>
      <div className="page-head">
        <div><h1>Projects</h1><p>Everything you own or collaborate on.</p></div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setModal({ type: 'form' })}><Icon name="plus" size={16} />New Project</button>}
      </div>
      <div className="toolbar">
        <div className="search"><Icon name="search" size={16} /><label className="sr-only" htmlFor="proj-q">Search projects</label><input id="proj-q" className="input" style={{ paddingLeft: 34, width: '100%' }} placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="sr-only" htmlFor="proj-status">Status</label>
        <select id="proj-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{PROJECT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <label className="sr-only" htmlFor="proj-sort">Sort</label>
        <select id="proj-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}><option value="createdAt">Newest</option><option value="name">Name</option><option value="dueDate">Due date</option></select>
      </div>
      <div className="card">
        {loading && !data ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> : data.projects.length === 0 ? (
          <EmptyState title={debounced || status ? 'No matching projects' : 'No projects yet'} text={isAdmin ? 'Create a project to start planning work.' : 'Projects you are added to will appear here.'}
            action={isAdmin && !debounced && !status ? <button className="btn btn-primary" onClick={() => setModal({ type: 'form' })}>Create Project</button> : null} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Project Name</th><th>Owner</th><th>Members</th><th>Task Progress</th><th>Due Date</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.projects.map((p) => {
                  const owns = p.owner.id === user.id;
                  return (
                    <tr key={p.id}>
                      <td className="title-cell"><Link to={`/projects/${p.id}`} style={{ fontWeight: 500 }}>{p.name}</Link>{p.description && <div className="small muted" style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description}</div>}</td>
                      <td>{p.owner.name}</td>
                      <td><div className="avatars">{p.members.slice(0, 4).map((m) => <Avatar key={m.id} name={m.name} size="sm" />)}{p.members.length > 4 && <span className="avatar sm">+{p.members.length - 4}</span>}</div></td>
                      <td style={{ minWidth: 190 }}><Progress done={p.completedCount} total={p.taskCount} /></td>
                      <td>{formatDate(p.dueDate)}</td>
                      <td><ProjectStatusBadge value={p.status} /></td>
                      <td>
                        <div className="row-actions">
                          <Link className="btn btn-sm" to={`/projects/${p.id}`}>View</Link>
                          {owns && <>
                            <button className="icon-btn" aria-label={`Edit ${p.name}`} onClick={() => setModal({ type: 'form', project: p })}><Icon name="edit" size={16} /></button>
                            <button className="icon-btn" aria-label={`Manage members of ${p.name}`} onClick={() => setModal({ type: 'members', project: p })}><Icon name="team" size={16} /></button>
                            <button className="icon-btn" aria-label={`Delete ${p.name}`} onClick={() => setModal({ type: 'delete', project: p })}><Icon name="trash" size={16} /></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal?.type === 'form' && <ProjectForm project={modal.project} onClose={close} onSaved={(_p, editing) => { toast(editing ? 'Project updated' : 'Project created'); refresh(); }} />}
      {modal?.type === 'members' && <MembersDialog project={modal.project} onClose={close} onChanged={refresh} />}
      {modal?.type === 'delete' && <ConfirmDialog title="Delete project" message={`Delete “${modal.project.name}” and all of its tasks? This cannot be undone. (To keep the data, set the status to Archived instead.)`}
        onClose={close} onConfirm={async () => { await api.del(`/projects/${modal.project.id}`); toast('Project deleted'); refresh(); }} />}
    </>
  );
}
