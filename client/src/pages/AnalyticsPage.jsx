import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { Progress } from '../components/Badges.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import { PRIORITY, STATUS } from '../utils/format.js';

function Distribution({ title, items, counts, total }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2></div>
      <div className="card-body">
        {items.map((i) => (
          <div className="dist-row" key={i.value}>
            <span>{i.label}</span>
            <div className="progress" aria-hidden="true"><span style={{ width: `${total ? (counts[i.value] / total) * 100 : 0}%` }} /></div>
            <strong>{counts[i.value]}</strong>
          </div>
        ))}
        <p className="small muted">{items.map((i) => `${i.label}: ${counts[i.value]}`).join(' · ')}</p>
      </div>
    </section>
  );
}

export default function AnalyticsPage() {
  const { version } = useApp();
  const { data, error, loading, reload } = useAsync(() => api.get('/analytics'), [version]);
  return (
    <>
      <div className="page-head"><div><h1>Analytics</h1><p>Calculated from the tasks in projects you can access.</p></div></div>
      {loading && !data ? <div className="card"><LoadingState /></div> : error ? <div className="card"><ErrorState error={error} onRetry={reload} /></div> : data.totalTasks === 0 && data.projectProgress.length === 0 ? (
        <div className="card"><EmptyState title="No data yet" text="Create projects and tasks to see analytics." /></div>
      ) : (
        <>
          <div className="grid-4">
            <div className="card stat"><div className="label">Total tasks</div><div className="value">{data.totalTasks}</div></div>
            <div className="card stat"><div className="label">Completion rate</div><div className="value">{data.completionRate}%</div></div>
            <div className={`card stat ${data.overdue ? 'warn' : ''}`}><div className="label">Overdue</div><div className="value">{data.overdue}</div></div>
            <div className="card stat"><div className="label">Projects</div><div className="value">{data.projectProgress.length}</div></div>
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
            <Distribution title="Tasks by status" items={STATUS} counts={data.byStatus} total={data.totalTasks} />
            <Distribution title="Tasks by priority" items={PRIORITY} counts={data.byPriority} total={data.totalTasks} />
          </div>
          <div className="stack">
            <section className="card">
              <div className="card-head"><h2>Project completion</h2></div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Project</th><th>Progress</th><th>Open</th><th>Overdue</th></tr></thead>
                <tbody>{data.projectProgress.map((p) => (
                  <tr key={p.id}><td><Link to={`/projects/${p.id}`}>{p.name}</Link></td><td style={{ minWidth: 200 }}>{p.taskCount === 0 ? <span className="muted">No tasks</span> : <Progress done={p.completedCount} total={p.taskCount} />}</td><td>{p.taskCount - p.completedCount}</td><td className={p.overdueCount ? 'overdue-text' : ''}>{p.overdueCount}</td></tr>
                ))}</tbody>
              </table></div>
            </section>
            {data.workload && (
              <section className="card">
                <div className="card-head"><h2>Workload by member</h2></div>
                {data.workload.length === 0 ? <EmptyState title="No assigned tasks" text="Assign tasks to see workload." /> : (
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>Member</th><th>Open</th><th>Completed</th><th>Overdue</th></tr></thead>
                    <tbody>{data.workload.map((w) => <tr key={w.user.id}><td>{w.user.name}</td><td>{w.open}</td><td>{w.completed}</td><td className={w.overdue ? 'overdue-text' : ''}>{w.overdue}</td></tr>)}</tbody>
                  </table></div>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
