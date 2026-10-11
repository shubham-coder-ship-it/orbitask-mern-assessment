import { useState } from 'react';
import Modal from './Modal.jsx';

export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal narrow title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-danger" onClick={go} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
    </>}>
      {error && <div className="alert error" role="alert">{error}</div>}
      <p>{message}</p>
    </Modal>
  );
}
