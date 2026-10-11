import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, signup, client } from './helpers.js';
import { setTransportForTests } from '../services/mailer.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { PasswordReset } from '../models/PasswordReset.js';

let app; let admin; let admin2; let mem; let proj;
const sent = [];
const goodTransport = { sendMail: async (m) => { sent.push(m); return { messageId: `<id${sent.length}@test>` }; } };
const PW = 'Passw0rdOK';
const login = async (email, password = PW) => { const c = client(app); const r = await c.post('/api/auth/login').send({ email, password }); return { c, r }; };

before(async () => {
  app = await setup();
  admin = await signup(app, 'Ada Admin', 'ada@example.com');
  admin2 = await signup(app, 'Bea Admin', 'bea@example.com');
  mem = await signup(app, 'Max Member', 'max@example.com');
  await User.updateOne({ _id: admin2.user.id }, { role: 'admin' });
  proj = (await admin.c.post('/api/projects').send({ name: 'Acct project' })).body.project;
  const inv = (await admin.c.post(`/api/projects/${proj.id}/members`).send({ userId: mem.user.id })).body.invitation;
  await mem.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' });
});
beforeEach(() => { sent.length = 0; setTransportForTests(goodTransport); });
after(async () => { setTransportForTests(null); await teardown(); });

test('change password: validates, verifies the current password, rotates other sessions', async () => {
  const other = await login('max@example.com'); // a second device
  const c = mem.c;
  const body = (o) => ({ currentPassword: PW, newPassword: 'NewPassw0rd9', confirmPassword: 'NewPassw0rd9', ...o });
  assert.equal((await c.post('/api/auth/change-password').send(body({ currentPassword: 'WrongPass1' }))).status, 422);
  assert.equal((await c.post('/api/auth/change-password').send(body({ confirmPassword: 'Different1' }))).status, 422);
  assert.equal((await c.post('/api/auth/change-password').send(body({ newPassword: 'short', confirmPassword: 'short' }))).status, 422);
  assert.equal((await c.post('/api/auth/change-password').send(body({ newPassword: PW, confirmPassword: PW }))).status, 422, 'must differ');
  const ok = await c.post('/api/auth/change-password').send(body());
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 200, 'this session stays signed in');
  assert.equal((await other.c.get('/api/auth/me')).status, 401, 'other sessions are signed out');
  assert.equal((await login('max@example.com', PW)).r.status, 401);
  assert.equal((await login('max@example.com', 'NewPassw0rd9')).r.status, 200);
  const hash = (await User.findById(mem.user.id).select('+passwordHash')).passwordHash;
  assert.match(hash, /^\$2[aby]\$/);
  assert.ok(!hash.includes('NewPassw0rd9'));
  assert.equal(JSON.stringify(ok.body).includes('$2'), false);
  mem.pw = 'NewPassw0rd9';
});

test('forgot password gives the same answer for known and unknown emails and emails a one-time link', async () => {
  const known = await client(app).post('/api/auth/forgot-password').send({ email: 'ada@example.com' });
  const unknown = await client(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(sent.length, 1, 'only the real account gets an email');
  assert.equal(sent[0].to, 'ada@example.com');
  assert.match(sent[0].text, /reset-password\?token=[0-9a-f]{64}/);
  assert.equal((await client(app).post('/api/auth/forgot-password').send({ email: 'not-an-email' })).status, 422);
});

test('reset token: stored only as a hash, works once, then dies; sessions are signed out', async () => {
  sent.length = 0;
  await client(app).post('/api/auth/forgot-password').send({ email: 'bea@example.com' });
  const token = sent[0].text.match(/token=([0-9a-f]{64})/)[1];
  const stored = await PasswordReset.find({ userId: admin2.user.id });
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0].tokenHash, token);
  assert.ok(!JSON.stringify(stored).includes(token), 'plaintext token is not in the database');
  const reset = (t, pw = 'ResetPassw0rd1', conf = pw) => client(app).post('/api/auth/reset-password').send({ token: t, newPassword: pw, confirmPassword: conf });
  assert.equal((await reset(token, 'weak', 'weak')).status, 422);
  assert.equal((await reset(token, 'ResetPassw0rd1', 'Mismatch11')).status, 422);
  assert.equal((await reset('f'.repeat(64))).status, 400, 'unknown token');
  assert.equal((await reset(token)).status, 200);
  assert.equal((await reset(token, 'AnotherPassw0rd2')).status, 400, 'a used token cannot be reused');
  assert.equal((await admin2.c.get('/api/auth/me')).status, 401, 'old session is gone');
  assert.equal((await login('bea@example.com', 'ResetPassw0rd1')).r.status, 200);
  assert.equal((await login('bea@example.com', PW)).r.status, 401);
});

test('expired reset tokens are rejected and a newer request replaces older links', async () => {
  sent.length = 0;
  await client(app).post('/api/auth/forgot-password').send({ email: 'ada@example.com' });
  const first = sent[0].text.match(/token=([0-9a-f]{64})/)[1];
  await client(app).post('/api/auth/forgot-password').send({ email: 'ada@example.com' });
  const second = sent[1].text.match(/token=([0-9a-f]{64})/)[1];
  const reset = (t) => client(app).post('/api/auth/reset-password').send({ token: t, newPassword: 'FreshPassw0rd3', confirmPassword: 'FreshPassw0rd3' });
  assert.equal((await reset(first)).status, 400, 'older link no longer works');
  await PasswordReset.updateMany({ userId: admin.user.id }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await reset(second)).status, 400, 'expired');
});

test('when email is not configured, reset requests stay generic and nothing crashes', async () => {
  setTransportForTests(null);
  const r = await client(app).post('/api/auth/forgot-password').send({ email: 'ada@example.com' });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 0);
});

test('a failing mail server does not leak whether the account exists', async () => {
  setTransportForTests({ sendMail: async () => { throw new Error('SMTP down'); } });
  const known = await client(app).post('/api/auth/forgot-password').send({ email: 'ada@example.com' });
  const unknown = await client(app).post('/api/auth/forgot-password').send({ email: 'zzz@example.com' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
});

test('member deletion is blocked while open tasks are assigned, and the API says which', async () => {
  const mc = (await login('max@example.com', 'NewPassw0rd9')).c;
  const t = (await admin.c.post('/api/tasks').send({ projectId: proj.id, title: 'Max must finish', assignedTo: mem.user.id })).body.task;
  const check = (await mc.get('/api/account/deletion-check')).body;
  assert.equal(check.canDelete, false);
  const blk = check.blockers.find((b) => b.code === 'open_tasks');
  assert.equal(blk.items[0].title, 'Max must finish');
  assert.equal(blk.items[0].project, 'Acct project');
  const del = await mc.delete('/api/account').send({ password: 'NewPassw0rd9', confirm: 'DELETE' });
  assert.equal(del.status, 409);
  assert.ok(del.body.error.details.blockers.length);
  assert.equal((await User.findById(mem.user.id)).deletedAt, null, 'rolled back: account is still active');
  assert.equal((await mc.get('/api/auth/me')).status, 200);
  mem.taskId = t.id;
});

test('deletion needs the right password and the typed confirmation, then anonymises and signs out', async () => {
  await admin.c.patch(`/api/tasks/${mem.taskId}`).send({ status: 'completed' });
  const mc = (await login('max@example.com', 'NewPassw0rd9')).c;
  assert.equal((await mc.get('/api/account/deletion-check')).body.canDelete, true);
  assert.equal((await mc.delete('/api/account').send({ password: 'WrongPass1', confirm: 'DELETE' })).status, 422);
  assert.equal((await mc.delete('/api/account').send({ password: 'NewPassw0rd9', confirm: 'delete' })).status, 422);
  assert.equal((await mc.delete('/api/account').send({ password: 'NewPassw0rd9', confirm: 'DELETE' })).status, 200);
  assert.equal((await mc.get('/api/auth/me')).status, 401);
  assert.equal((await login('max@example.com', 'NewPassw0rd9')).r.status, 401);
  const u = await User.findById(mem.user.id);
  assert.ok(u.deletedAt);
  assert.equal(u.name, 'Deleted user');
  assert.ok(u.email.endsWith('@deleted.invalid'));
  assert.ok(!(await admin.c.get(`/api/projects/${proj.id}`)).body.project.members.some((m) => m.id === mem.user.id));
  assert.equal(await Task.countDocuments({ _id: mem.taskId }), 1, 'team work history is kept');
  assert.equal((await admin.c.get('/api/users')).body.users.some((x) => x.id === mem.user.id), false);
  assert.equal((await mc.delete('/api/account').send({ password: 'x', confirm: 'DELETE' })).status, 401);
});

test('nobody can be assigned work after deleting their account; a re-registered email is free', async () => {
  const res = await admin.c.post('/api/tasks').send({ projectId: proj.id, title: 'Ghost task', assignedTo: mem.user.id });
  assert.ok([403, 422].includes(res.status));
  assert.equal((await signup(app, 'Max Again', 'max@example.com')).res.status, 201);
});

test('admin deletion is blocked by owned projects and by being the last admin; transfer unblocks it', async () => {
  const solo = await signup(app, 'Solo Setup', 'solo@example.com');
  await User.updateMany({ _id: { $in: [admin.user.id, admin2.user.id] } }, { role: 'member' }); // make Solo the only admin
  await User.updateOne({ _id: solo.user.id }, { role: 'admin' });
  const check = (await solo.c.get('/api/account/deletion-check')).body;
  assert.equal(check.canDelete, false);
  assert.ok(check.blockers.some((b) => b.code === 'last_admin'));
  assert.equal((await solo.c.delete('/api/account').send({ password: PW, confirm: 'DELETE' })).status, 409);

  await User.updateOne({ _id: admin.user.id }, { role: 'admin' });
  const p = (await solo.c.post('/api/projects').send({ name: 'Solo owns this' })).body.project;
  const blocked = (await solo.c.get('/api/account/deletion-check')).body;
  assert.ok(blocked.blockers.some((b) => b.code === 'owned_projects' && b.items[0].name === 'Solo owns this'));
  assert.equal((await solo.c.delete('/api/account').send({ password: PW, confirm: 'DELETE' })).status, 409);

  // transfer rules: new owner must be an Admin AND a member of the project
  assert.equal((await solo.c.post(`/api/projects/${p.id}/transfer`).send({ userId: admin.user.id })).status, 422, 'not a member yet');
  const inv = (await solo.c.post('/api/invitations').send({ projectId: p.id, userId: admin.user.id })).body.invitation;
  const adminC = (await login('ada@example.com')).c;
  assert.ok(adminC);
  await adminC.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' });
  assert.equal((await adminC.post(`/api/projects/${p.id}/transfer`).send({ userId: admin.user.id })).status, 403, 'only the owner can transfer');
  assert.equal((await solo.c.post(`/api/projects/${p.id}/transfer`).send({ userId: admin.user.id })).status, 200);
  assert.equal((await solo.c.get('/api/account/deletion-check')).body.canDelete, true);
  assert.equal((await solo.c.delete('/api/account').send({ password: PW, confirm: 'DELETE' })).status, 200);
  assert.equal((await solo.c.get('/api/auth/me')).status, 401);
  assert.equal((await User.findById(solo.user.id)).deletedAt !== null, true);
});

test('deleting an account only ever affects the caller', async () => {
  const x = await signup(app, 'Xavier X', 'x@example.com');
  const y = await signup(app, 'Yolanda Y', 'y@example.com');
  assert.equal((await x.c.delete('/api/account').send({ password: PW, confirm: 'DELETE', userId: y.user.id, id: y.user.id })).status, 200);
  assert.equal((await User.findById(y.user.id)).deletedAt, null);
  assert.equal((await y.c.get('/api/auth/me')).status, 200);
});
