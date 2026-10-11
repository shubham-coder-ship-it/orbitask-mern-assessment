import { throwIfErrors, str } from '../utils/validate.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePassword(password, errors) {
  if (typeof password !== 'string' || password.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Password must contain a letter and a number';
  else if (password.length > 128) errors.password = 'Password is too long';
}

export function validateRegister(body = {}) {
  const errors = {};
  const name = str(body.name);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name || typeof name !== 'string' || name.length < 2 || name.length > 80) errors.name = 'Name must be 2–80 characters';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  validatePassword(body.password, errors);
  if (!errors.password && body.confirmPassword !== body.password) errors.confirmPassword = 'Passwords do not match';
  throwIfErrors(errors);
  // role is intentionally ignored: public registration can never choose a role
  return { name, email, password: body.password };
}

export function validateLogin(body = {}) {
  const errors = {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (typeof body.password !== 'string' || !body.password) errors.password = 'Password is required';
  throwIfErrors(errors);
  return { email, password: body.password };
}

export function validateProfile(body = {}) {
  const errors = {};
  const out = {};
  if (body.name !== undefined) {
    const name = str(body.name);
    if (typeof name !== 'string' || name.length < 2 || name.length > 80) errors.name = 'Name must be 2–80 characters';
    else out.name = name;
  }
  throwIfErrors(errors);
  return out;
}
