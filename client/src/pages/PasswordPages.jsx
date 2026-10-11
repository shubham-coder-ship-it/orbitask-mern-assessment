import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Field from '../components/Field.jsx';
import { AuthShell } from './AuthPages.jsx';
import { api } from '../services/api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address');
    setBusy(true); setError('');
    try { await api.post('/auth/forgot-password', { email }); setDone(true); }
    catch (ex) { setError(ex.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Reset your password" lead="Enter your account email and we’ll send a reset link if an account exists." footer={<Link to="/login">Back to sign in</Link>}>
      {done ? <div className="alert info" role="status">If an account exists for that email, a reset link is on its way. The link expires soon and works once.</div> : (
        <form onSubmit={submit} noValidate>
          <Field label="Email" error={error}>{(p) => <input className="input" type="email" autoComplete="email" {...p} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const err = {};
    if (form.newPassword.length < 8 || !/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) err.newPassword = 'Use at least 8 characters with a letter and a number';
    if (form.confirmPassword !== form.newPassword) err.confirmPassword = 'Passwords do not match';
    setErrors(err); setFormError('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try { await api.post('/auth/reset-password', { token, ...form }); setDone(true); setTimeout(() => navigate('/login', { replace: true }), 2500); }
    catch (ex) { setFormError(ex.message); setErrors(ex.details || {}); setBusy(false); }
  };

  if (!token) return <AuthShell title="Link not valid" lead="This reset link is missing its token." footer={<Link to="/forgot-password">Request a new link</Link>} />;
  return (
    <AuthShell title="Choose a new password" lead="You’ll be signed out everywhere and asked to sign in again." footer={<Link to="/login">Back to sign in</Link>}>
      {done ? <div className="alert success" role="status">Password updated. Redirecting you to sign in…</div> : (
        <>
          {formError && <div className="alert error" role="alert">{formError} <Link to="/forgot-password">Request a new link</Link></div>}
          <form onSubmit={submit} noValidate>
            <Field label="New password" required error={errors.newPassword} hint="At least 8 characters, with a letter and a number.">{(p) => <input className="input" type="password" autoComplete="new-password" {...p} value={form.newPassword} onChange={set('newPassword')} />}</Field>
            <Field label="Confirm new password" required error={errors.confirmPassword}>{(p) => <input className="input" type="password" autoComplete="new-password" {...p} value={form.confirmPassword} onChange={set('confirmPassword')} />}</Field>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
