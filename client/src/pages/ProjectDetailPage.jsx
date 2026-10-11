import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ErrorState, EmptyState, LoadingState } from '../components/States.jsx';
import { Avatar, ProjectStatusBadge, Progress } from '../components/Badges.jsx';
import TaskTable from '../components/TaskTable.jsx';
import ProjectForm from '../components/ProjectForm.jsx';
import MembersDialog from '../components/MembersDialog.jsx';
import TransferDialog from '../components/TransferDialog.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { describeActivity, formatDate, timeAgo } from '../utils/format.js';
import { useTaskActions } from '../features/tasks/useTaskActions.jsx';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { version, refresh, toast, openTaskForm } = useApp();
  const navigate = useNavigate();
  const actions = useTaskActions();
  const [modal, setModal] = useState(null);
  const { data, error, loading, reload } = useAsync(async () => {
    const [p, t, a] = await Promise.all([api.get(`/projects/${id}`), api.get('/tasks', { projectId: id, limit: 100, sort: 'dueDate' }), api.get('/activity', { projectId: id, limit: 10 })]);
    return { project: p.project, tasks: t.tasks, activity: a.activity };
  }, [id, version]);

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error.status === 404 ? { message: 'This project does not exist or you do not have access to it.' } : error} onRetry={error.status === 404 ? undefined : reload} />;
  const { project, tasks, activity } = data;
  const owns = project.owner.id === user.id;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/projects">Projects</Link> / {project.name}</div>
          <h1>{project.name}</h1>
          <p>{project.description || 'No description provided.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {owns && <><button className="btn" onClick={() => setModal('edit')}><Icon name="edit" size={16} />Edit</button><button className="btn" onClick={() => setModal('members')}><Icon name="team" size={16} />Members</button><button className="btn" onClick={() => setModal('transfer')}>Transfer</button></>}
          <button className="btn btn-primary" onClick={() => openTaskForm({ defaults: { projectId: project.id } })}><Icon name="plus" size={16} />Add Task</button>
        </div>
      </div>
      <div className="project-head-grid">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Tasks ({tasks.length})</h2></div>
            {tasks.length === 0 ? <EmptyState title="No tasks in this project" text="Add the first task to start tracking progress." /> :
              <TaskTable tasks={tasks} onOpen={actions.edit} onEdit={actions.edit} onDelete={actions.remove} canManage={actions.canManage} />}
          </section>
          <section className="card">
            <div className="card-head"><h2>Activity</h2></div>
            {activity.length === 0 ? <EmptyState title="No activity yet" text="Changes to this project will be listed here." /> : (
              <ul className="feed">{activity.map((a) => (
                <li key={a.id}><Avatar name={a.actor?.name || '?'} size="sm" /><div className="text"><strong>{a.actor?.name}</strong> {describeActivity(a)}</div><span className="time">{timeAgo(a.timestamp)}</span></li>
              ))}</ul>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="card"><div className="card-body">
            <dl className="kv">
              <dt>Status</dt><dd><ProjectStatusBadge value={project.status} /></dd>
              <dt>Start date</dt><dd>{formatDate(project.startDate)}</dd>
              <dt>Due date</dt><dd>{formatDate(project.dueDate)}</dd>
              <dt>Owner</dt><dd>{project.owner.name}</dd>
              <dt>Progress</dt><dd>{project.taskCount === 0 ? <span className="muted">No tasks yet</span> : <Progress done={project.completedCount} total={project.taskCount} />}</dd>
              {project.overdueCount > 0 && <><dt>Overdue</dt><dd className="overdue-text">{project.overdueCount} task{project.overdueCount > 1 ? 's' : ''}</dd></>}
            </dl>
          </div></section>
          <section className="card">
            <div className="card-head"><h2>Members ({project.members.length})</h2></div>
            <div className="card-body">{project.members.map((m) => (
              <div className="member-row" key={m.id}><Avatar name={m.name} /><div className="grow"><div style={{ fontWeight: 500 }}>{m.name}</div><div className="small muted">{m.email}</div></div>{m.id === project.owner.id && <span className="small muted">Owner</span>}</div>
            ))}</div>
          </section>
        </div>
      </div>
      {modal === 'edit' && <ProjectForm project={project} onClose={() => setModal(null)} onSaved={() => { toast('Project updated'); refresh(); }} />}
      {modal === 'members' && <MembersDialog project={project} onClose={() => setModal(null)} onChanged={refresh} />}
      {modal === 'transfer' && <TransferDialog project={project} onClose={() => setModal(null)} onDone={() => { toast('Ownership transferred'); refresh(); }} />}
      {actions.dialog}
    </>
  );
}
