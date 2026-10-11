import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, signup } from './helpers.js';
import { Invitation } from '../models/Invitation.js';
import { Project } from '../models/Project.js';
import { User } from '../models/User.js';

let app; let admin; let admin2; let sam; let tia; let ned; let project;
const members = async () => (await Project.findById(project.id)).members.map(String);
const types = async (u) => (await u.c.get('/api/notifications')).body.notifications.map((n) => n.type);

before(async () => {
  app = await setup();
  admin = await signup(app, 'Admin One', 'admin@example.com');
  sam = await signup(app, 'Sam Member', 'sam@example.com');
  tia = await signup(app, 'Tia Member', 'tia@example.com');
  ned = await signup(app, 'Ned Member', 'ned@example.com');
  admin2 = await signup(app, 'Admin Two', 'admin2@example.com');
  await User.updateOne({ _id: admin2.user.id }, { role: 'admin' });
  project = (await admin.c.post('/api/projects').send({ name: 'Join Project' })).body.project;
});
after(teardown);

test('inviting creates a pending invitation, notifies the invitee, and does NOT add them yet', async () => {
  const res = await admin.c.post('/api/invitations').send({ projectId: project.id, userId: sam.user.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.invitation.status, 'pending');
  assert.ok(!(await members()).includes(sam.user.id));
  assert.ok((await types(sam)).includes('invitation.received'));
  const inbox = (await sam.c.get('/api/invitations')).body;
  assert.equal(inbox.received.length, 1);
  assert.equal(inbox.received[0].project.name, 'Join Project');
  assert.equal((await admin.c.get('/api/invitations')).body.sent.length, 1);
  assert.equal(inbox.received[0].invitedBy.name, 'Admin One');
});

test('duplicate pending invitations are rejected, even when sent at the same instant', async () => {
  const again = await admin.c.post('/api/invitations').send({ projectId: project.id, userId: sam.user.id });
  assert.equal(again.status, 409);
  const results = await Promise.all([1, 2, 3].map(() => admin.c.post('/api/invitations').send({ projectId: project.id, userId: tia.user.id })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(await Invitation.countDocuments({ projectId: project.id, userId: tia.user.id, status: 'pending' }), 1);
});

test('only the invited person can accept or decline; others get 404', async () => {
  const inv = (await sam.c.get('/api/invitations')).body.received[0];
  assert.equal((await ned.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' })).status, 404);
  assert.equal((await admin.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' })).status, 403);
  assert.equal((await sam.c.patch(`/api/invitations/${inv.id}`).send({ action: 'approve' })).status, 403);
  assert.equal((await sam.c.patch(`/api/invitations/${inv.id}`).send({ action: 'bogus' })).status, 422);
  assert.ok(!(await members()).includes(sam.user.id));
});

test('accepting adds the member exactly once, notifies the admin, and cannot be repeated', async () => {
  const inv = (await sam.c.get('/api/invitations')).body.received[0];
  // Two simultaneous accepts. On MongoDB the conditional update lets exactly one win; the local FerretDB test
  // database does not isolate concurrent updates, so here we assert the invariants that must hold either way.
  const [a, b] = await Promise.all([1, 2].map(() => sam.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' })));
  assert.ok([a.status, b.status].includes(200));
  assert.ok([a.status, b.status].every((s) => [200, 409].includes(s)));
  assert.equal((await members()).filter((m) => m === sam.user.id).length, 1, 'added exactly once');
  assert.equal((await types(admin)).filter((t) => t === 'invitation.accepted').length, 1, 'admin notified exactly once');
  assert.equal((await sam.c.get(`/api/projects/${project.id}`)).status, 200);
  assert.equal((await sam.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' })).status, 409);
});

test('declining never adds the member and notifies the admin', async () => {
  const inv = (await tia.c.get('/api/invitations')).body.received[0];
  assert.equal((await tia.c.patch(`/api/invitations/${inv.id}`).send({ action: 'decline' })).status, 200);
  assert.ok(!(await members()).includes(tia.user.id));
  assert.ok((await types(admin)).includes('invitation.declined'));
  assert.equal((await tia.c.get(`/api/projects/${project.id}`)).status, 404);
});

test('cancelled and expired invitations cannot be accepted', async () => {
  const inv = (await admin.c.post('/api/invitations').send({ projectId: project.id, userId: ned.user.id })).body.invitation;
  assert.equal((await ned.c.patch(`/api/invitations/${inv.id}`).send({ action: 'cancel' })).status, 403);
  assert.equal((await admin.c.patch(`/api/invitations/${inv.id}`).send({ action: 'cancel' })).status, 200);
  assert.equal((await ned.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' })).status, 409);
  assert.ok((await types(ned)).includes('invitation.cancelled'));

  const inv2 = (await admin.c.post('/api/invitations').send({ projectId: project.id, userId: ned.user.id })).body.invitation;
  await Invitation.updateOne({ _id: inv2.id }, { expiresAt: new Date(Date.now() - 1000) });
  const res = await ned.c.patch(`/api/invitations/${inv2.id}`).send({ action: 'accept' });
  assert.equal(res.status, 409);
  assert.match(res.body.error.message, /expired/i);
  assert.ok(!(await members()).includes(ned.user.id));
  assert.equal((await Invitation.findById(inv2.id)).status, 'expired');
});

test('inviting rules: members cannot invite, non-owner admins cannot, existing members and unknown users rejected', async () => {
  assert.equal((await sam.c.post('/api/invitations').send({ projectId: project.id, userId: ned.user.id })).status, 403);
  assert.equal((await admin2.c.post('/api/invitations').send({ projectId: project.id, userId: ned.user.id })).status, 404);
  assert.equal((await admin.c.post('/api/invitations').send({ projectId: project.id, userId: sam.user.id })).status, 409);
  assert.equal((await admin.c.post('/api/invitations').send({ projectId: project.id, userId: '64b64b64b64b64b64b64b64b' })).status, 404);
  assert.equal((await admin.c.post('/api/invitations').send({ projectId: 'x', userId: ned.user.id })).status, 400);
});

test('user search is admin-only, needs 2+ characters and returns minimal fields', async () => {
  assert.equal((await sam.c.get('/api/users/search?q=ne')).status, 403);
  assert.equal((await admin.c.get('/api/users/search?q=n')).status, 422);
  const r = (await admin.c.get('/api/users/search?q=ned')).body.users;
  assert.equal(r.length, 1);
  assert.deepEqual(Object.keys(r[0]).sort(), ['email', 'id', 'name']);
});

test('join request: owner is notified, duplicates blocked, members cannot approve their own request', async () => {
  const discover = (await ned.c.get('/api/invitations/discover')).body.projects;
  assert.ok(discover.some((p) => p.id === project.id));
  assert.ok(!(await sam.c.get('/api/invitations/discover')).body.projects.some((p) => p.id === project.id), 'members do not see their own project');
  const req1 = await ned.c.post('/api/invitations/request').send({ projectId: project.id });
  assert.equal(req1.status, 201);
  assert.ok(!(await members()).includes(ned.user.id));
  assert.ok((await types(admin)).includes('request.received'));
  assert.equal((await ned.c.post('/api/invitations/request').send({ projectId: project.id })).status, 409);
  assert.equal((await sam.c.post('/api/invitations/request').send({ projectId: project.id })).status, 409, 'already a member');
  const id = req1.body.invitation.id;
  assert.equal((await ned.c.patch(`/api/invitations/${id}`).send({ action: 'approve' })).status, 403);
  assert.equal((await sam.c.patch(`/api/invitations/${id}`).send({ action: 'approve' })).status, 404);
  assert.equal((await admin2.c.patch(`/api/invitations/${id}`).send({ action: 'approve' })).status, 404);
  assert.equal((await admin.c.get('/api/invitations')).body.toReview.length, 1);
  assert.ok(!(await members()).includes(ned.user.id));
});

test('approving adds the member once and notifies them; rejecting does not add', async () => {
  const id = (await admin.c.get('/api/invitations')).body.toReview[0].id;
  const [a, b] = await Promise.all([1, 2].map(() => admin.c.patch(`/api/invitations/${id}`).send({ action: 'approve' })));
  assert.ok([a.status, b.status].includes(200));
  assert.equal((await members()).filter((m) => m === ned.user.id).length, 1, 'added exactly once');
  assert.equal((await types(ned)).filter((t) => t === 'request.approved').length, 1, 'notified exactly once');
  assert.equal((await admin.c.patch(`/api/invitations/${id}`).send({ action: 'approve' })).status, 409, 'a later repeat is refused');

  const p2 = (await admin.c.post('/api/projects').send({ name: 'Second Project' })).body.project;
  const rq = (await tia.c.post('/api/invitations/request').send({ projectId: p2.id })).body.invitation;
  assert.equal((await admin.c.patch(`/api/invitations/${rq.id}`).send({ action: 'reject' })).status, 200);
  assert.ok(!(await Project.findById(p2.id)).members.map(String).includes(tia.user.id));
  assert.ok((await types(tia)).includes('request.rejected'));
  assert.equal((await tia.c.get(`/api/projects/${p2.id}`)).status, 404);
});

test('a requester can cancel only their own pending request', async () => {
  const p3 = (await admin.c.post('/api/projects').send({ name: 'Third Project' })).body.project;
  const rq = (await tia.c.post('/api/invitations/request').send({ projectId: p3.id })).body.invitation;
  assert.equal((await sam.c.patch(`/api/invitations/${rq.id}`).send({ action: 'cancel' })).status, 404);
  assert.equal((await tia.c.patch(`/api/invitations/${rq.id}`).send({ action: 'cancel' })).status, 200);
  assert.equal((await admin.c.patch(`/api/invitations/${rq.id}`).send({ action: 'approve' })).status, 409);
  // after cancelling, a fresh request is allowed again
  assert.equal((await tia.c.post('/api/invitations/request').send({ projectId: p3.id })).status, 201);
});

test('deleting a project cancels its pending invitations and a stale accept is refused', async () => {
  const p4 = (await admin.c.post('/api/projects').send({ name: 'Doomed' })).body.project;
  const inv = (await admin.c.post('/api/invitations').send({ projectId: p4.id, userId: sam.user.id })).body.invitation;
  await admin.c.delete(`/api/projects/${p4.id}`);
  assert.equal((await sam.c.patch(`/api/invitations/${inv.id}`).send({ action: 'accept' })).status, 409);
  assert.equal((await sam.c.get('/api/invitations')).body.received.length, 0);
});

test('archived projects reject new invitations and requests', async () => {
  const p5 = (await admin.c.post('/api/projects').send({ name: 'Old' })).body.project;
  await admin.c.patch(`/api/projects/${p5.id}`).send({ status: 'archived' });
  assert.equal((await admin.c.post('/api/invitations').send({ projectId: p5.id, userId: tia.user.id })).status, 409);
  assert.equal((await tia.c.post('/api/invitations/request').send({ projectId: p5.id })).status, 404);
});

test('POST /projects/:id/members now sends an invitation instead of adding directly', async () => {
  const p6 = (await admin.c.post('/api/projects').send({ name: 'Legacy route' })).body.project;
  const r = await admin.c.post(`/api/projects/${p6.id}/members`).send({ userId: sam.user.id });
  assert.equal(r.status, 201);
  assert.ok(!(await Project.findById(p6.id)).members.map(String).includes(sam.user.id));
});

test('team list shows the names of the projects each person belongs to', async () => {
  const p = (await admin.c.post('/api/projects').send({ name: 'Visible Name' })).body.project;
  const users = (await admin.c.get('/api/users')).body.users;
  const me = users.find((u) => u.id === admin.user.id);
  assert.ok(me.projects.some((x) => x.name === 'Visible Name' && x.id === p.id));
});
