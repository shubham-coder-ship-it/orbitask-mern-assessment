import { useState } from 'react';
import Field from '../components/Field.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/format.js';

const STATUS_TEXT = { accepted: 'Accepted by mail server', partial: 'Partly accepted', failed: 'Failed', queued: 'Queued' };

function Settings({ enabled, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async (e) => {
    setBusy(true); setError('');
    try { await api.patch('/workspace/settings', { allowMemberToMemberEmail: e.target.checked }); onChanged(); } catch (ex) { setError(ex.message); } finally { setBusy(false); }
  };
  return (
    <section className="card" style={{ marginBottom: 20 }}><div className="card-body">
      {error && <div className="alert error" role="alert">{error}</div>}
      <label className="switch-row"><input type="checkbox" checked={enabled} disabled={busy} onChange={toggle} />
        <span><strong>Let members email one another</strong><br /><span className="small muted">When off, members can only email Admins and the owners of their projects.</span></span>
      </label>
    </div></section>
  );
}

export default function MessagesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(() => api.get('/email/recipients'), []);
  const hist = useAsync(() => api.get('/email/history'), []);
  const [audience, setAudience] = useState('users');
  const [to, setTo] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const toggle = (id) => setTo((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    const err = {};
    if (!subject.trim()) err.subject = 'Subject is required';
    if (!body.trim()) err.body = 'Message is required';
    if (audience === 'users' && to.length === 0) err.to = 'Choose at least one recipient';
    if (audience === 'project' && !projectId) err.projectId = 'Choose a team';
    setErrors(err); setResult(null);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      const r = await api.post('/email/send', { audience, to, projectId, subject, body });
      setResult({ type: r.email.status === 'accepted' ? 'success' : 'warn', text: r.message });
      toast(r.email.status === 'accepted' ? 'Mail server accepted your message' : 'Message partly sent');
      setSubject(''); setBody(''); setTo([]); hist.reload();
    } catch (ex) { setResult({ type: 'error', text: ex.message }); setErrors(ex.details || {}); hist.reload(); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Messages</h1><p>Send an email to people in your workspace. Addresses stay private.</p></div></div>
      {isAdmin && <Settings enabled={data.memberToMemberEnabled} onChanged={reload} />}
      {!data.emailConfigured && <div className="alert warn" role="alert">Email delivery is not configured on this server, so messages cannot be sent yet. An administrator needs to set the SMTP variables.</div>}
      {data.note && <div className="alert info">{data.note}</div>}
      <section className="card"><div className="card-body">
        {result && <div className={`alert ${result.type}`} role={result.type === 'error' ? 'alert' : 'status'}>{result.text}</div>}
        <form onSubmit={send} noValidate>
          <Field label="Send to">{(p) => (
            <select className="select" {...p} value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="users">Selected people</option>
              {data.teams.length > 0 && <option value="project">A project team</option>}
              {data.canEmailWorkspace && <option value="workspace">Everyone in the workspace</option>}
            </select>)}
          </Field>
          {audience === 'users' && (
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
              <legend className="small" style={{ fontWeight: 500, marginBottom: 5 }}>Recipients</legend>
              {data.users.length === 0 ? <p className="small muted">There is nobody you can email yet.</p> : (
                <div className="recipient-list">{data.users.map((u) => <label key={u.id}><input type="checkbox" checked={to.includes(u.id)} onChange={() => toggle(u.id)} />{u.name} <span className="small muted" style={{ textTransform: 'capitalize' }}>{u.role}</span></label>)}</div>
              )}
              {errors.to && <span className="field-error">{errors.to}</span>}
            </fieldset>
          )}
          {audience === 'project' && (
            <Field label="Team" error={errors.projectId}>{(p) => (
              <select className="select" {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select a project…</option>
                {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.size} recipient{t.size === 1 ? '' : 's'})</option>)}
              </select>)}
            </Field>
          )}
          <Field label="Subject" required error={errors.subject}>{(p) => <input className="input" maxLength={150} {...p} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
          <Field label="Message" required error={errors.body}>{(p) => <textarea className="textarea" rows={6} maxLength={5000} {...p} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
          <button className="btn btn-primary" disabled={busy || !data.emailConfigured}>{busy ? 'Sending…' : 'Send email'}</button>
        </form>
      </div></section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="card-head"><h2>Your sent messages</h2></div>
        {hist.loading && !hist.data ? <LoadingState /> : hist.error ? <ErrorState error={hist.error} onRetry={hist.reload} />
          : hist.data.emails.length === 0 ? <EmptyState title="Nothing sent yet" text="Messages you send appear here with their status." />
          : hist.data.emails.map((m) => (
            <div className="row-item" key={m.id}>
              <div className="grow"><div style={{ fontWeight: 500 }}>{m.subject}</div><div className="small muted">To {m.recipients.slice(0, 3).join(', ')}{m.recipients.length > 3 ? ` +${m.recipients.length - 3}` : ''} · {timeAgo(m.createdAt)}</div></div>
              <span className={`badge ${m.status}`} title={m.error || ''}>{STATUS_TEXT[m.status] || m.status}</span>
            </div>
          ))}
      </section>
    </>
  );
}
