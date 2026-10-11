import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/format.js';
import { pingNotifications } from '../components/NotificationBell.jsx';

const label = (s) => s[0].toUpperCase() + s.slice(1);

function Row({ inv, kind, busyId, onAct }) {
  const pending = inv.status === 'pending';
  const busy = busyId === inv.id;
  const project = inv.project ? <Link to={`/projects/${inv.project.id}`}>{inv.project.name}</Link> : 'a project';
  let text;
  if (kind === 'received') text = <>{inv.invitedBy?.name || 'An admin'} invited you to join {project}</>;
  else if (kind === 'mine') text = <>You asked to join {project}</>;
  else if (kind === 'review') text = <><strong>{inv.user?.name}</strong> asked to join {project}</>;
  else text = <>You invited <strong>{inv.user?.name}</strong> to {project}</>;
  const actions = {
    received: [['accept', 'Accept', 'btn-primary'], ['decline', 'Decline', '']],
    mine: [['cancel', 'Cancel request', '']],
    review: [['approve', 'Approve', 'btn-primary'], ['reject', 'Reject', '']],
    sent: [['cancel', 'Cancel invitation', '']],
  }[kind];
  return (
    <div className="row-item">
      <div className="grow"><div>{text}</div><div className="small muted">{timeAgo(inv.createdAt)}</div></div>
      <span className={`badge ${inv.status}`}>{label(inv.status)}</span>
      {pending && <div className="row-actions">{actions.map(([a, t, c]) => <button key={a} className={`btn btn-sm ${c}`} disabled={busy} onClick={() => onAct(inv, a)}>{t}</button>)}</div>}
    </div>
  );
}

function Discover({ onRequested }) {
  const { data, error, loading, reload } = useAsync(() => api.get('/invitations/discover'), []);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const ask = async (p) => {
    setBusy(p.id); setMsg('');
    try { await api.post('/invitations/request', { projectId: p.id }); await reload(); onRequested(); }
    catch (e) { setMsg(e.message); reload(); } finally { setBusy(''); }
  };
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (data.projects.length === 0) return <EmptyState title="Nothing to join" text="There are no other active projects you could ask to join right now." />;
  return (
    <>
      {msg && <div className="alert error" role="alert" style={{ margin: 14 }}>{msg}</div>}
      {data.projects.map((p) => (
        <div className="row-item" key={p.id}>
          <div className="grow"><div style={{ fontWeight: 500 }}>{p.name}</div><div className="small muted">Owner: {p.owner} · {p.memberCount} member{p.memberCount === 1 ? '' : 's'}{p.description ? ` · ${p.description}` : ''}</div></div>
          {p.hasPending ? <span className="badge pending">Request pending</span> : <button className="btn btn-sm btn-primary" disabled={busy === p.id} onClick={() => ask(p)}>{busy === p.id ? 'Sending…' : 'Request to join'}</button>}
        </div>
      ))}
    </>
  );
}

export default function RequestsPage() {
  const { version, refresh, toast } = useApp();
  const [tab, setTab] = useState('received');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const { data, error: loadError, loading, reload } = useAsync(() => api.get('/invitations'), [version]);

  const act = async (inv, action) => {
    setBusyId(inv.id); setError('');
    try {
      await api.patch(`/invitations/${inv.id}`, { action });
      toast({ accept: 'You joined the project', decline: 'Invitation declined', cancel: 'Cancelled', approve: 'Member added', reject: 'Request rejected' }[action]);
      refresh(); pingNotifications();
    } catch (e) { setError(e.message); reload(); } finally { setBusyId(''); }
  };

  const tabs = [
    ['received', 'Invitations', data?.received], ['review', 'Requests to review', data?.toReview],
    ['mine', 'My requests', data?.myRequests], ['sent', 'Sent invitations', data?.sent], ['discover', 'Find projects'],
  ];
  const pendingCount = (list) => (list || []).filter((i) => i.status === 'pending').length;
  const current = data?.[{ received: 'received', review: 'toReview', mine: 'myRequests', sent: 'sent' }[tab]] || [];
  const empty = { received: 'No invitations', review: 'No join requests', mine: 'No requests', sent: 'No invitations sent' }[tab];

  return (
    <>
      <div className="page-head"><div><h1>Invitations &amp; requests</h1><p>Join projects by invitation, or ask the owner to let you in.</p></div></div>
      <div className="tabs" role="tablist">
        {tabs.map(([id, text, list]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{text}{pendingCount(list) > 0 ? ` (${pendingCount(list)})` : ''}</button>
        ))}
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="card">
        {tab === 'discover' ? <Discover onRequested={() => { toast('Request sent'); refresh(); }} />
          : loading && !data ? <LoadingState /> : loadError ? <ErrorState error={loadError} onRetry={reload} />
          : current.length === 0 ? <EmptyState title={empty} text="Anything new will appear here and in your notifications." />
          : current.map((i) => <Row key={i.id} inv={i} kind={{ received: 'received', review: 'review', mine: 'mine', sent: 'sent' }[tab]} busyId={busyId} onAct={act} />)}
      </div>
    </>
  );
}
