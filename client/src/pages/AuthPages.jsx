import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogoMark } from '../components/Icon.jsx';
import Field from '../components/Field.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthShell({ title, lead, children, footer }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><LogoMark /><span>Orbitask</span></div>
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
        {children}
        <p className="auth-foot">{footer}</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const err = {};
    if (!EMAIL_RE.test(form.email)) err.email = 'Enter a valid email address';
    if (!form.password) err.password = 'Password is required';
    setErrors(err); setFormError('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try { await login(form); navigate('/dashboard', { replace: true }); }
    catch (ex) { setFormError(ex.message); setErrors(ex.details || {}); setBusy(false); }
  };

  return (
    <AuthShell title="Sign in" lead="Welcome back. Enter your details to continue." footer={<>New to Orbitask? <Link to="/register">Create an account</Link></>}>
      {formError && <div className="alert error" role="alert">{formError}</div>}
      <form onSubmit={submit} noValidate>
        <Field label="Email" error={errors.email}>{(p) => <input className="input" type="email" autoComplete="email" {...p} value={form.email} onChange={set('email')} />}</Field>
        <Field label="Password" error={errors.password}>{(p) => <PasswordInput autoComplete="current-password" {...p} value={form.password} onChange={set('password')} />}</Field>
        <div className="forgot-row"><Link to="/forgot-password">Forgot password?</Link></div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const err = {};
    if (form.name.trim().length < 2) err.name = 'Enter your full name';
    if (!EMAIL_RE.test(form.email)) err.email = 'Enter a valid email address';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) err.password = 'Use at least 8 characters with a letter and a number';
    if (form.confirmPassword !== form.password) err.confirmPassword = 'Passwords do not match';
    setErrors(err); setFormError('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try { await register(form); navigate('/dashboard', { replace: true }); }
    catch (ex) { setFormError(ex.message); setErrors(ex.details || {}); setBusy(false); }
  };

  return (
    <AuthShell title="Create your account" lead="Start organizing projects and tasks with your team." footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
      {formError && <div className="alert error" role="alert">{formError}</div>}
      <form onSubmit={submit} noValidate>
        <Field label="Full name" required error={errors.name}>{(p) => <input className="input" autoComplete="name" {...p} value={form.name} onChange={set('name')} />}</Field>
        <Field label="Email" required error={errors.email}>{(p) => <input className="input" type="email" autoComplete="email" {...p} value={form.email} onChange={set('email')} />}</Field>
        <Field label="Password" required error={errors.password} hint="At least 8 characters, with a letter and a number.">{(p) => <input className="input" type="password" autoComplete="new-password" {...p} value={form.password} onChange={set('password')} />}</Field>
        <Field label="Confirm password" required error={errors.confirmPassword}>{(p) => <input className="input" type="password" autoComplete="new-password" {...p} value={form.confirmPassword} onChange={set('confirmPassword')} />}</Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}
