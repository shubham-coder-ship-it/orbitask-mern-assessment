import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

// Owner hands the project to another member. The server requires the new owner to be an Admin and a member.
export default function TransferDialog({ project, onClose, onDone }) {
  const { user } = useAuth();
  const candidates = project.members.filter((m) => m.id !== user.id);
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError('');
    try { await api.post(`/projects/${project.id}/transfer`, { userId: pick }); onDone(); onClose(); }
    catch (e) { setError(e.details?.userId || e.message); setBusy(false); }
  };
  return (
    <Modal narrow title="Transfer ownership" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-danger" onClick={go} disabled={!pick || busy}>{busy ? 'Transferring…' : 'Transfer'}</button>
    </>}>
      {error && <div className="alert error" role="alert">{error}</div>}
      <p className="small muted" style={{ marginBottom: 12 }}>You will stay a member but lose owner powers. The new owner must be an Admin who is already a member.</p>
      {candidates.length === 0 ? <p>Invite another Admin to this project first.</p> : (
        <div className="field"><label htmlFor="new-owner">New owner</label>
          <select id="new-owner" className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Select a member…</option>
            {candidates.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
    </Modal>
  );
}
