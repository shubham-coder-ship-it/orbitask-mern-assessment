import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, signup, client } from './helpers.js';
import { notify } from '../services/notificationService.js';
import { Notification } from '../models/Notification.js';

let app; let admin; let sam; let eve; let outsider; let project;

before(async () => {
  app = await setup();
  admin = await signup(app, 'Admin Owner', 'admin@example.com');
  sam = await signup(app, 'Sam Member', 'sam@example.com');
  eve = await signup(app, 'Eve Creator', 'eve@example.com');
  outsider = await signup(app, 'Olive Outsider', 'olive@example.com');
  project = (await admin.c.post('/api/projects').send({ name: 'Notify Project' })).body.project;
  for (const u of [sam, eve]) {
    const inv = (await admin.c.post(`/api/projects/${project.id}/members`).send({ userId: u.user.id })).body.invitation;
    await u.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' });
  }
});
after(teardown);

const mine = async (u, q = '') => (await u.c.get(`/api/notifications${q}`)).body;

test('assigning a task notifies only the assignee (not the actor, not outsiders)', async () => {
  const t = await admin.c.post('/api/tasks').send({ projectId: project.id, title: 'Assigned task', assignedTo: sam.user.id });
  assert.equal(t.status, 201);
  const samList = (await mine(sam)).notifications.filter((n) => n.type === 'task.assigned');
  assert.equal(samList.length, 1);
  assert.equal(samList[0].entityType, 'task');
  assert.equal(samList[0].entityId, t.body.task.id);
  assert.equal(samList[0].isRead, false);
  assert.equal((await mine(admin)).notifications.filter((n) => n.type === 'task.assigned').length, 0);
  assert.equal((await mine(outsider)).notifications.length, 0);
});

test('status/priority/title changes notify assignee and creator, never unrelated users', async () => {
  const t = (await eve.c.post('/api/tasks').send({ projectId: project.id, title: 'Eve task', assignedTo: eve.user.id })).body.task;
  await admin.c.patch(`/api/tasks/${t.id}`).send({ assignedTo: sam.user.id });
  const samBefore = (await mine(sam)).notifications.length;
  const res = await admin.c.patch(`/api/tasks/${t.id}`).send({ priority: 'urgent', title: 'Eve task renamed' });
  assert.equal(res.status, 200);
  const samAfter = await mine(sam);
  assert.equal(samAfter.notifications.length, samBefore + 1);
  assert.equal(samAfter.notifications[0].type, 'task.updated');
  const eveList = (await mine(eve)).notifications.map((n) => n.type);
  assert.ok(eveList.includes('task.unassigned'), 'old assignee told they were unassigned');
  assert.ok(eveList.includes('task.updated'), 'creator told about the update');
  assert.equal((await mine(outsider)).notifications.length, 0);
  await admin.c.patch(`/api/tasks/${t.id}`).send({ status: 'completed' });
  assert.equal((await mine(sam)).notifications[0].type, 'task.completed');
  await admin.c.patch(`/api/tasks/${t.id}`).send({ status: 'in_progress' });
  assert.equal((await mine(sam)).notifications[0].type, 'task.reopened');
  await admin.c.delete(`/api/tasks/${t.id}`);
  assert.equal((await mine(sam)).notifications[0].type, 'task.deleted');
});

test('a no-op update creates no notification', async () => {
  const t = (await admin.c.post('/api/tasks').send({ projectId: project.id, title: 'Quiet task', assignedTo: sam.user.id })).body.task;
  const n = (await mine(sam)).notifications.length;
  await admin.c.patch(`/api/tasks/${t.id}`).send({ title: 'Quiet task', priority: t.priority });
  assert.equal((await mine(sam)).notifications.length, n);
});

test('unread count, mark one, mark all — and read state persists across a fresh login', async () => {
  const before = (await sam.c.get('/api/notifications/unread-count')).body.count;
  assert.ok(before >= 2);
  const first = (await mine(sam)).notifications[0];
  assert.equal((await sam.c.patch(`/api/notifications/${first.id}/read`)).status, 200);
  assert.equal((await sam.c.get('/api/notifications/unread-count')).body.count, before - 1);
  const fresh = client(app); // new browser session = "after refresh / sign in again"
  await fresh.post('/api/auth/login').send({ email: 'sam@example.com', password: 'Passw0rdOK' });
  const again = (await fresh.get('/api/notifications')).body.notifications.find((n) => n.id === first.id);
  assert.equal(again.isRead, true);
  assert.ok(again.readAt);
  assert.equal((await fresh.post('/api/notifications/read-all')).status, 200);
  assert.equal((await fresh.get('/api/notifications/unread-count')).body.count, 0);
  assert.equal((await mine(sam, '?unread=true')).notifications.length, 0);
});

test('users can neither read nor modify another user’s notifications', async () => {
  const mineSam = (await mine(sam)).notifications[0];
  assert.equal((await outsider.c.patch(`/api/notifications/${mineSam.id}/read`)).status, 404);
  const adminList = (await mine(admin)).notifications.map((n) => n.id);
  assert.ok(!adminList.includes(mineSam.id));
  // outsider "read all" must not flip anyone else's state
  await admin.c.post('/api/tasks').send({ projectId: project.id, title: 'Another', assignedTo: sam.user.id });
  await outsider.c.post('/api/notifications/read-all');
  assert.ok((await sam.c.get('/api/notifications/unread-count')).body.count >= 1);
  assert.equal((await sam.c.patch('/api/notifications/not-an-id/read')).status, 400);
});

test('cursor pagination returns everything exactly once', async () => {
  for (let i = 0; i < 5; i += 1) await notify({ recipientId: outsider.user.id, actorId: admin.user.id, type: 'test', title: `n${i}` });
  const p1 = (await outsider.c.get('/api/notifications?limit=2')).body;
  assert.equal(p1.notifications.length, 2);
  assert.equal(p1.hasMore, true);
  const p2 = (await outsider.c.get(`/api/notifications?limit=2&before=${encodeURIComponent(p1.nextCursor)}`)).body;
  assert.ok(p2.notifications.every((n) => !p1.notifications.some((x) => x.id === n.id)));
  assert.equal((await outsider.c.get('/api/notifications?before=garbage')).status, 400);
});

test('notify() is idempotent for a dedupeKey and never self-notifies', async () => {
  const args = { recipientId: eve.user.id, actorId: admin.user.id, type: 'x', title: 'dup', dedupeKey: 'k1' };
  await notify(args);
  await notify(args);
  assert.equal(await Notification.countDocuments({ dedupeKey: 'k1' }), 1);
  assert.equal(await notify({ recipientId: eve.user.id, actorId: eve.user.id, type: 'x', title: 'self' }), null);
});

test('unauthenticated access is refused', async () => {
  assert.equal((await client(app).get('/api/notifications')).status, 401);
});
