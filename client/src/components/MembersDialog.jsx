import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { Avatar } from './Badges.jsx';
import { api } from '../services/api.js';

// Owner-only. Adding someone now means INVITING them: they join only after they accept.
export default function MembersDialog({ project: initial, onClose, onChanged }) {
  const [project, setProject] = useState(initial);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sent, setSent] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const loadSent = () => api.get('/invitations').then((r) => setSent(r.sent.filter((i) => i.projectId === project.id && i.status === 'pending'))).catch((e) => setError(e.message));
  useEffect(() => { loadSent(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    const id = ++seq.current;
    setSearching(true);
    const t = setTimeout(() => {
      api.get('/users/search', { q: q.trim() }).then((r) => id === seq.current && setResults(r.users)).catch((e) => id === seq.current && setError(e.message)).finally(() => id === seq.current && setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const invite = async (u) => {
    setBusy(true); setError(''); setNote('');
    try { await api.post('/invitations', { projectId: project.id, userId: u.id }); setNote(`Invitation sent to ${u.name}. They join once they accept.`); setQ(''); setResults([]); await loadSent(); onChanged(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const cancel = async (inv) => {
    setBusy(true); setError('');
    try { await api.patch(`/invitations/${inv.id}`, { action: 'cancel' }); await loadSent(); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (m) => {
    setBusy(true); setError('');
    try { const r = await api.del(`/projects/${project.id}/members/${m.id}`); setProject(r.project); onChanged(r.project); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const memberIds = new Set(project.members.map((m) => m.id));

  return (
    <Modal title={`Members · ${project.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      {error && <div className="alert error" role="alert">{error}</div>}
      {note && <div className="alert success" role="status">{note}</div>}
      <div className="field">
        <label htmlFor="invite-search">Invite a registered user</label>
        <input id="invite-search" className="input" type="search" placeholder="Search by name or email (2+ letters)" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {searching && <span className="small muted">Searching…</span>}
        {q.trim().length >= 2 && !searching && results.length === 0 && <span className="small muted">No matching users.</span>}
        {results.length > 0 && (
          <div className="suggest">
            {results.map((u) => (
              <button key={u.id} type="button" disabled={busy || memberIds.has(u.id) || sent.some((i) => i.userId === u.id)} onClick={() => invite(u)}>
                <Avatar name={u.name} size="sm" /><span style={{ flex: 1 }}><strong>{u.name}</strong> <span className="small muted">{u.email}</span></span>
                <span className="small muted">{memberIds.has(u.id) ? 'Already a member' : sent.some((i) => i.userId === u.id) ? 'Invited' : 'Invite'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {sent.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="small muted" style={{ marginBottom: 4 }}>Pending invitations</div>
          {sent.map((i) => (
            <div className="member-row" key={i.id}><Avatar name={i.user?.name || '?'} /><div className="grow">{i.user?.name}</div><span className="badge pending">Pending</span><button className="btn btn-sm" disabled={busy} onClick={() => cancel(i)}>Cancel</button></div>
          ))}
        </div>
      )}
      <div>
        {project.members.map((m) => (
          <div className="member-row" key={m.id}>
            <Avatar name={m.name} />
            <div className="grow"><div style={{ fontWeight: 500 }}>{m.name}</div><div className="small muted">{m.email}</div></div>
            {m.id === project.owner.id ? <span className="small muted">Owner</span>
              : <button className="btn btn-sm" disabled={busy} onClick={() => remove(m)}>Remove</button>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
