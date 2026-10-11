import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { Avatar, OverdueBadge, PriorityBadge, Progress } from '../components/Badges.jsx';
import TaskTable from '../components/TaskTable.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { describeActivity, formatDate, timeAgo } from '../utils/format.js';
import { useTaskActions } from '../features/tasks/useTaskActions.jsx';

function Stat({ label, value, icon, warn }) {
  return (
    <div className={`card stat ${warn && value > 0 ? 'warn' : ''}`}>
      <div className="label">{label}<Icon name={icon} size={16} /></div>
      <div className="value">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { version, openTaskForm } = useApp();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const actions = useTaskActions();
  const { data, error, loading, reload } = useAsync(async () => {
    const [stats, deadlines, activity] = await Promise.all([api.get('/dashboard/stats'), api.get('/dashboard/deadlines'), api.get('/activity', { limit: 8 })]);
    return { stats, deadlines: deadlines.deadlines, activity: activity.activity };
  }, [version]);

  const head = (
    <div className="page-head">
      <div><h1>Overview</h1><p>Track your projects and keep work moving.</p></div>
      <button className="btn btn-primary" onClick={() => openTaskForm()}><Icon name="plus" size={16} />New Task</button>
    </div>
  );
  if (loading && !data) return <>{head}<LoadingState /></>;
  if (error) return <>{head}<ErrorState error={error} onRetry={reload} /></>;
  const { stats, deadlines, activity } = data;
  const t = stats.totals;

  if (t.projects === 0) {
    return <>{head}<div className="card"><EmptyState title="Welcome to Orbitask" text={isAdmin ? 'Create your first project, then add tasks and invite teammates.' : 'You have not been added to a project yet. Ask an admin to add you.'}
      action={isAdmin ? <Link className="btn btn-primary" to="/projects?new=1">Create a project</Link> : null} /></div></>;
  }

  return (
    <>
      {head}
      <div className="grid-4">
        <Stat label="Total Projects" value={t.projects} icon="projects" />
        <Stat label="Total Tasks" value={t.tasks} icon="tasks" />
        <Stat label="In Progress" value={t.inProgress} icon="clock" />
        <Stat label="Overdue" value={t.overdue} icon="alert" warn />
      </div>
      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Recent Activity</h2></div>
            {activity.length === 0 ? <EmptyState title="No activity yet" text="Actions in your projects will appear here." /> : (
              <ul className="feed">
                {activity.map((a) => (
                  <li key={a.id}>
                    <Avatar name={a.actor?.name || '?'} size="sm" />
                    <div className="text"><strong>{a.actor?.name}</strong> {describeActivity(a)}{a.project && <div className="small muted">{a.project.name}</div>}</div>
                    <span className="time">{timeAgo(a.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <div className="card-head"><h2>Recent Tasks</h2><Link to="/tasks" className="small">View all tasks</Link></div>
            {stats.recentTasks.length === 0 ? <EmptyState title="No tasks yet" text="Create a task to get started." action={<button className="btn btn-primary" onClick={() => openTaskForm()}>New Task</button>} /> :
              <TaskTable compact tasks={stats.recentTasks} onOpen={actions.edit} onEdit={actions.edit} />}
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Upcoming Deadlines</h2></div>
            {deadlines.length === 0 ? <EmptyState title="Nothing due" text="Open tasks with due dates appear here." /> : (
              <ul className="feed">
                {deadlines.map((d) => (
                  <li key={d.id}>
                    <div className="text">
                      <a className="deadline" href="#open" onClick={(e) => { e.preventDefault(); actions.edit(d); }}><span className="t">{d.title}</span></a>
                      <div className="small muted">{d.project?.name} · <span className={d.overdue ? 'overdue-text' : ''}>{formatDate(d.dueDate)}</span></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}><PriorityBadge value={d.priority} />{d.overdue && <OverdueBadge />}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <div className="card-head"><h2>Project Progress</h2><Link to="/projects" className="small">All projects</Link></div>
            <div className="card-body">
              {stats.projectProgress.map((p) => (
                <div key={p.id} style={{ marginBottom: 14 }}>
                  <Link to={`/projects/${p.id}`} style={{ fontWeight: 500, color: 'inherit' }}>{p.name}</Link>
                  <Progress done={p.completedCount} total={p.taskCount} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {actions.dialog}
    </>
  );
}
