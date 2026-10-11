import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import { Avatar } from '../components/Badges.jsx';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';

function ChangePassword() {
  const { toast } = useApp();
  const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const err = {};
    if (!form.currentPassword) err.currentPassword = 'Current password is required';
    if (form.newPassword.length < 8 || !/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) err.newPassword = 'Use at least 8 characters with a letter and a number';
    if (form.confirmPassword !== form.newPassword) err.confirmPassword = 'Passwords do not match';
    setErrors(err); setFormError('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try { await api.post('/auth/change-password', form); setForm(empty); toast('Password changed. Other devices were signed out.'); }
    catch (ex) { setFormError(ex.message); setErrors(ex.details || {}); } finally { setBusy(false); }
  };
  return (
    <section className="card" style={{ maxWidth: 520, marginTop: 20 }}>
      <div className="card-head"><h2>Change password</h2></div>
      <div className="card-body">
        {formError && !Object.keys(errors).length && <div className="alert error" role="alert">{formError}</div>}
        <form onSubmit={submit} noValidate>
          <Field label="Current password" required error={errors.currentPassword}>{(p) => <input className="input" type="password" autoComplete="current-password" {...p} value={form.currentPassword} onChange={set('currentPassword')} />}</Field>
          <Field label="New password" required error={errors.newPassword}>{(p) => <input className="input" type="password" autoComplete="new-password" {...p} value={form.newPassword} onChange={set('newPassword')} />}</Field>
          <Field label="Confirm new password" required error={errors.confirmPassword}>{(p) => <input className="input" type="password" autoComplete="new-password" {...p} value={form.confirmPassword} onChange={set('confirmPassword')} />}</Field>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
        </form>
      </div>
    </section>
  );
}

function DeleteDialog({ onClose, onDeleted }) {
  const [check, setCheck] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [blockers, setBlockers] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/account/deletion-check').then(setCheck).catch((e) => setLoadError(e.message)); }, []);
  const list = blockers || check?.blockers || [];

  const go = async () => {
    setBusy(true); setError(''); setErrors({});
    try { await api.del('/account', { password, confirm }); onDeleted(); }
    catch (ex) {
      if (ex.details?.blockers) setBlockers(ex.details.blockers);
      setErrors(ex.details || {}); setError(ex.message); setBusy(false);
    }
  };
  return (
    <Modal title="Delete account" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-danger" onClick={go} disabled={busy || !check || list.length > 0 || confirm !== 'DELETE' || !password}>{busy ? 'Deleting…' : 'Delete my account'}</button>
    </>}>
      {loadError && <div className="alert error" role="alert">{loadError}</div>}
      {!check && !loadError && <p className="muted">Checking whether your account can be deleted…</p>}
      {error && !errors.blockers && <div className="alert error" role="alert">{error}</div>}
      {list.map((b) => (
        <div className="blocker" key={b.code}>
          <strong>{b.message}</strong>
          {b.items?.length > 0 && <ul>{b.items.map((i) => <li key={i.id}>{i.projectId && i.title ? <><Link to={`/projects/${i.projectId}`} onClick={onClose}>{i.title}</Link> · {i.project}</> : <Link to={`/projects/${i.id}`} onClick={onClose}>{i.name}</Link>}</li>)}</ul>}
        </div>
      ))}
      {check && list.length === 0 && (
        <>
          <p style={{ marginBottom: 12 }}>This signs you out everywhere and permanently removes your sign-in. Your name is replaced with “Deleted user” on past activity; tasks and project history are kept for your team. <strong>This cannot be undone.</strong></p>
          <Field label="Your password" required error={errors.password}>{(p) => <input className="input" type="password" autoComplete="current-password" {...p} value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Field label="Type DELETE to confirm" required error={errors.confirm}>{(p) => <input className="input" autoComplete="off" {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        </>
      )}
    </Modal>
  );
}

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const { toast } = useApp();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Name must be at least 2 characters');
    setSaving(true); setError('');
    try { setUser((await api.patch('/users/me', { name: name.trim() })).user); toast('Profile saved'); }
    catch (ex) { setError(ex.details?.name || ex.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Profile</h1><p>Your account details.</p></div></div>
      <section className="card" style={{ maxWidth: 520 }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <Avatar name={user.name} size="lg" />
            <div><div style={{ fontWeight: 600 }}>{user.name}</div><div className="muted small" style={{ textTransform: 'capitalize' }}>{user.role}</div></div>
          </div>
          <form onSubmit={save} noValidate>
            <Field label="Full name" required error={error}>{(p) => <input className="input" {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Email" hint="Email cannot be changed.">{(p) => <input className="input" {...p} value={user.email} disabled />}</Field>
            <Field label="Role" hint="Roles are assigned by the system, not self-selected.">{(p) => <input className="input" {...p} value={user.role} disabled style={{ textTransform: 'capitalize' }} />}</Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={saving || name.trim() === user.name}>{saving ? 'Saving…' : 'Save changes'}</button>
              <button type="button" className="btn" onClick={logout}>Log out</button>
            </div>
          </form>
        </div>
      </section>
      <ChangePassword />
      <section className="card danger-zone" style={{ maxWidth: 520, marginTop: 20 }}>
        <div className="card-head"><h2>Delete account</h2></div>
        <div className="card-body">
          <p className="small muted" style={{ marginBottom: 12 }}>Permanently delete your account. We check for anything that must be handled first, such as open tasks or projects you own.</p>
          <button className="btn btn-danger" onClick={() => setDeleting(true)}>Delete my account…</button>
        </div>
      </section>
      {deleting && <DeleteDialog onClose={() => setDeleting(false)} onDeleted={() => { setUser(null); }} />}
    </>
  );
}
