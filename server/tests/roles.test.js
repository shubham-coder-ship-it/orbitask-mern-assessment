import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, signup } from './helpers.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';

let app; let admin; let mia; let bo;
before(async () => {
  app = await setup();
  admin = await signup(app, 'Root Admin', 'admin@example.com');
  mia = await signup(app, 'Mia Member', 'mia@example.com');
  bo = await signup(app, 'Bo Member', 'bo@example.com');
});
after(teardown);

test('members cannot change roles or promote themselves', async () => {
  assert.equal((await mia.c.patch(`/api/users/${mia.user.id}/role`).send({ role: 'admin' })).status, 403);
  assert.equal((await mia.c.patch(`/api/users/${bo.user.id}/role`).send({ role: 'admin' })).status, 403);
  assert.equal((await mia.c.get('/api/admin/audit')).status, 403);
  assert.equal((await User.findById(mia.user.id)).role, 'member');
});

test('validation: unknown role, bad id, unknown user, no-op change', async () => {
  assert.equal((await admin.c.patch(`/api/users/${mia.user.id}/role`).send({ role: 'owner' })).status, 422);
  assert.equal((await admin.c.patch('/api/users/zzz/role').send({ role: 'admin' })).status, 400);
  assert.equal((await admin.c.patch('/api/users/64b64b64b64b64b64b64b64b/role').send({ role: 'admin' })).status, 404);
  assert.equal((await admin.c.patch(`/api/users/${mia.user.id}/role`).send({ role: 'member' })).status, 409);
});

test('admin promotes a member: audit record, notification, and the new power applies on the very next request', async () => {
  assert.equal((await mia.c.post('/api/projects').send({ name: 'Nope' })).status, 403);
  const res = await admin.c.patch(`/api/users/${mia.user.id}/role`).send({ role: 'admin' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal((await mia.c.post('/api/projects').send({ name: 'Mia project' })).status, 201, 'same session, no re-login needed');
  const note = (await mia.c.get('/api/notifications')).body.notifications.find((n) => n.type === 'role.changed');
  assert.ok(note && note.entityType === 'user');
  const audit = (await admin.c.get('/api/admin/audit')).body.entries[0];
  assert.equal(audit.from, 'member');
  assert.equal(audit.to, 'admin');
  assert.equal(audit.actor, 'Root Admin');
  assert.equal(audit.subject, 'Mia Member');
  assert.ok(audit.timestamp);
});

test('a demoted admin loses admin powers immediately', async () => {
  assert.equal((await admin.c.patch(`/api/users/${mia.user.id}/role`).send({ role: 'member' })).status, 200);
  assert.equal((await mia.c.post('/api/projects').send({ name: 'Blocked now' })).status, 403);
  assert.equal((await mia.c.patch(`/api/users/${bo.user.id}/role`).send({ role: 'admin' })).status, 403);
  assert.equal(await AuditLog.countDocuments({ subjectId: mia.user.id }), 2);
});

test('the last administrator cannot be demoted, even by themselves', async () => {
  const res = await admin.c.patch(`/api/users/${admin.user.id}/role`).send({ role: 'member' });
  assert.equal(res.status, 409);
  assert.match(res.body.error.message, /last administrator/i);
  assert.equal((await User.findById(admin.user.id)).role, 'admin');
  assert.equal((await admin.c.get('/api/auth/me')).body.user.role, 'admin');
});

test('with two admins one may step down; two admins demoting each other at once can never leave zero admins', async () => {
  await admin.c.patch(`/api/users/${bo.user.id}/role`).send({ role: 'admin' });
  const [a, b] = await Promise.all([
    admin.c.patch(`/api/users/${bo.user.id}/role`).send({ role: 'member' }),
    bo.c.patch(`/api/users/${admin.user.id}/role`).send({ role: 'member' }),
  ]);
  assert.ok([a.status, b.status].every((s) => [200, 401, 403, 409].includes(s)));
  assert.ok((await User.countDocuments({ role: 'admin', deletedAt: null })) >= 1);
});
