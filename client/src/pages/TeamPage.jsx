import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Badges.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { timeAgo } from '../utils/format.js';

function AuditLog() {
  const { version } = useApp();
  const { data, error, loading, reload } = useAsync(() => api.get('/admin/audit'), [version]);
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <div className="card-head"><h2>Role change history</h2></div>
      {loading && !data ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} />
        : data.entries.length === 0 ? <EmptyState title="No role changes yet" text="Promotions and demotions are recorded here." />
        : data.entries.map((a) => (
          <div className="row-item" key={a.id}>
            <div className="grow"><strong>{a.actor}</strong> changed <strong>{a.subject}</strong> from {a.from} to {a.to}</div>
            <span className="small muted">{timeAgo(a.timestamp)}</span>
          </div>
        ))}
    </section>
  );
}

export default function TeamPage() {
  const { version, refresh, toast } = useApp();
  const { user, isAdmin } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get('/users'), [version]);
  const [pending, setPending] = useState(null); // { user, role }

  const change = async () => {
    await api.patch(`/users/${pending.user.id}/role`, { role: pending.role });
    toast(`${pending.user.name} is now ${pending.role === 'admin' ? 'an Admin' : 'a Member'}`);
    refresh();
  };

  return (
    <>
      <div className="page-head"><div><h1>Team</h1><p>Registered members you work with.{isAdmin ? ' As an Admin you can change roles.' : ''}</p></div></div>
      <div className="card">
        {loading && !data ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> : data.users.length === 0 ? <EmptyState title="No team members" text="Members appear once they register and join a project." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Member</th><th>Role</th><th>Projects</th><th>Assigned</th><th>Completed</th>{isAdmin && <th>Actions</th>}</tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={u.name} /><div><div style={{ fontWeight: 500 }}>{u.name}</div><div className="small muted">{u.email}</div></div></div></td>
                    <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                    <td>{u.projects.length ? u.projects.map((p, i) => <span key={p.id}>{i > 0 && ', '}<Link to={`/projects/${p.id}`}>{p.name}</Link></span>) : <span className="muted">None</span>}</td>
                    <td>{u.assignedCount}</td>
                    <td>{u.completedCount}</td>
                    {isAdmin && <td>
                      <button className="btn btn-sm" onClick={() => setPending({ user: u, role: u.role === 'admin' ? 'member' : 'admin' })}>
                        {u.role === 'admin' ? 'Make Member' : 'Make Admin'}{u.id === user.id ? ' (me)' : ''}
                      </button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {isAdmin && <AuditLog />}
      {pending && (
        <ConfirmDialog title="Change role" confirmLabel="Change role" onClose={() => setPending(null)} onConfirm={change}
          message={pending.role === 'admin'
            ? `Make ${pending.user.name} an Admin? They will be able to create projects, invite people, change roles and email the workspace.`
            : `Make ${pending.user.name} a Member? They will immediately lose Admin powers.${pending.user.id === user.id ? ' This is your own account.' : ''}`} />
      )}
    </>
  );
}
