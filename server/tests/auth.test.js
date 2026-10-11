import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setup, teardown, client, signup } from './helpers.js';
import { User } from '../models/User.js';

let app;
before(async () => { app = await setup(); });
after(teardown);

test('first registered user becomes admin, later users are members and cannot self-elevate', async () => {
  const a = await signup(app, 'Ada Admin', 'ada@example.com');
  assert.equal(a.res.status, 201);
  assert.equal(a.user.role, 'admin');
  const c = client(app);
  const res = await c.post('/api/auth/register').send({ name: 'Mal Member', email: 'mal@example.com', password: 'Passw0rdOK', confirmPassword: 'Passw0rdOK', role: 'admin' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'member');
});

test('never returns password hash and stores a bcrypt hash', async () => {
  const { user, res } = await signup(app, 'Hash Check', 'hash@example.com');
  assert.equal(res.body.user.passwordHash, undefined);
  const doc = await User.findById(user.id).select('+passwordHash');
  assert.match(doc.passwordHash, /^\$2[aby]\$/);
  assert.notEqual(doc.passwordHash, 'Passw0rdOK');
});

test('duplicate email (case-insensitive) is rejected', async () => {
  await signup(app, 'Dup One', 'dup@example.com');
  const { res } = await signup(app, 'Dup Two', 'DUP@example.com');
  assert.equal(res.status, 409);
});

test('invalid registration input returns 422 with field errors', async () => {
  const c = client(app);
  const res = await c.post('/api/auth/register').send({ name: 'x', email: 'nope', password: 'short', confirmPassword: 'other' });
  assert.equal(res.status, 422);
  assert.ok(res.body.error.details.name && res.body.error.details.email && res.body.error.details.password);
  const res2 = await c.post('/api/auth/register').send({ name: 'Good Name', email: 'g@example.com', password: 'Passw0rdOK', confirmPassword: 'Different1' });
  assert.equal(res2.status, 422);
  assert.ok(res2.body.error.details.confirmPassword);
});

test('login succeeds, /me works, bad credentials get 401', async () => {
  await signup(app, 'Login User', 'login@example.com');
  const c = client(app);
  const ok = await c.post('/api/auth/login').send({ email: 'login@example.com', password: 'Passw0rdOK' });
  assert.equal(ok.status, 200);
  assert.ok(ok.headers['set-cookie'][0].includes('HttpOnly'));
  assert.equal((await c.get('/api/auth/me')).body.user.email, 'login@example.com');
  const bad = await client(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'WrongPass1' });
  assert.equal(bad.status, 401);
  const unknown = await client(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'WrongPass1' });
  assert.equal(unknown.status, 401);
});

test('protected routes require authentication', async () => {
  const res = await client(app).get('/api/projects');
  assert.equal(res.status, 401);
  const bogus = await request(app).get('/api/auth/me').set('Cookie', 'orbitask_token=garbage');
  assert.equal(bogus.status, 401);
});

test('mutations without the CSRF header are rejected', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'Passw0rdOK' });
  assert.equal(res.status, 403);
});

test('logout invalidates the previous token server-side', async () => {
  const { c } = await signup(app, 'Out User', 'out@example.com');
  const cookie = (await c.post('/api/auth/login').send({ email: 'out@example.com', password: 'Passw0rdOK' })).headers['set-cookie'][0].split(';')[0];
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  const replay = await request(app).get('/api/auth/me').set('Cookie', cookie);
  assert.equal(replay.status, 401);
});

test('profile update changes name only', async () => {
  const { c } = await signup(app, 'Prof User', 'prof@example.com');
  const res = await c.patch('/api/users/me').send({ name: 'Renamed User', role: 'admin', email: 'x@example.com' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, 'Renamed User');
  assert.equal(res.body.user.role, 'member');
  assert.equal(res.body.user.email, 'prof@example.com');
});

test('health endpoint reports database state', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'connected');
});
