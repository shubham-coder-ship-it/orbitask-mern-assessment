import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, signup, addMember } from './helpers.js';

let app;
let admin; let alice; let bob; let carol;
let project;

before(async () => {
  app = await setup();
  admin = await signup(app, 'Admin One', 'admin@example.com'); // first user => admin
  alice = await signup(app, 'Alice Member', 'alice@example.com');
  bob = await signup(app, 'Bob Member', 'bob@example.com');
  carol = await signup(app, 'Carol Outsider', 'carol@example.com');
  const res = await admin.c.post('/api/projects').send({ name: 'Apollo', description: 'Moon', startDate: '2026-01-01', dueDate: '2026-12-31' });
  project = res.body.project;
  await addMember(admin.c, project.id, alice);
  await addMember(admin.c, project.id, bob);
});
after(teardown);

const mk = (c, body) => c.post('/api/tasks').send({ projectId: project.id, title: 'Task', ...body });

test('only admins can create projects', async () => {
  assert.equal(project.progress, 0);
  assert.equal(project.taskCount, 0);
  const res = await alice.c.post('/api/projects').send({ name: 'Nope' });
  assert.equal(res.status, 403);
});

test('project validation: dates and name', async () => {
  const res = await admin.c.post('/api/projects').send({ name: 'X', startDate: '2026-05-01', dueDate: '2026-04-01' });
  assert.equal(res.status, 422);
  assert.ok(res.body.error.details.name && res.body.error.details.dueDate);
});

test('non-members cannot see or touch a project (404)', async () => {
  assert.equal((await carol.c.get(`/api/projects/${project.id}`)).status, 404);
  assert.equal((await carol.c.patch(`/api/projects/${project.id}`).send({ name: 'Hacked' })).status, 404);
  assert.equal((await carol.c.get('/api/projects')).body.projects.length, 0);
  assert.equal((await mk(carol.c, {})).status, 404);
});

test('members can view but not edit/delete the project or manage members', async () => {
  assert.equal((await alice.c.get(`/api/projects/${project.id}`)).status, 200);
  assert.equal((await alice.c.patch(`/api/projects/${project.id}`).send({ name: 'Renamed' })).status, 403);
  assert.equal((await alice.c.delete(`/api/projects/${project.id}`)).status, 403);
  assert.equal((await alice.c.post(`/api/projects/${project.id}/members`).send({ userId: carol.user.id })).status, 403);
  assert.equal((await alice.c.post('/api/invitations').send({ projectId: project.id, userId: carol.user.id })).status, 403);
});

test('invalid ids return 400', async () => {
  assert.equal((await admin.c.get('/api/projects/not-an-id')).status, 400);
  assert.equal((await admin.c.get('/api/tasks/123')).status, 400);
});

test('task create validates fields and relationships', async () => {
  assert.equal((await mk(admin.c, { title: '' })).status, 422);
  assert.equal((await mk(admin.c, { priority: 'huge' })).status, 422);
  assert.equal((await mk(admin.c, { status: 'nope' })).status, 422);
  assert.equal((await mk(admin.c, { startDate: '2026-03-10', dueDate: '2026-03-01' })).status, 422);
  const outsider = await mk(admin.c, { assignedTo: carol.user.id });
  assert.equal(outsider.status, 422);
  assert.ok(outsider.body.error.details.assignedTo);
});

test('owner can assign to members; members can only self-assign', async () => {
  const t = await mk(admin.c, { title: 'Assigned', assignedTo: alice.user.id, priority: 'high' });
  assert.equal(t.status, 201);
  assert.equal(t.body.task.assignee.name, 'Alice Member');
  assert.equal((await mk(alice.c, { title: 'Sneaky', assignedTo: bob.user.id })).status, 403);
  assert.equal((await mk(alice.c, { title: 'Mine', assignedTo: alice.user.id })).status, 201);
});

test('task update/delete permissions', async () => {
  const t = (await mk(admin.c, { title: 'Owner task', assignedTo: alice.user.id })).body.task;
  // assignee can update status
  const ok = await alice.c.patch(`/api/tasks/${t.id}`).send({ status: 'in_progress' });
  assert.equal(ok.status, 200);
  // unrelated member cannot update or delete
  assert.equal((await bob.c.patch(`/api/tasks/${t.id}`).send({ status: 'completed' })).status, 403);
  assert.equal((await bob.c.delete(`/api/tasks/${t.id}`)).status, 403);
  // assignee (not creator/owner) cannot delete
  assert.equal((await alice.c.delete(`/api/tasks/${t.id}`)).status, 403);
  // assignee cannot reassign to someone else
  assert.equal((await alice.c.patch(`/api/tasks/${t.id}`).send({ assignedTo: bob.user.id })).status, 403);
  // outsider sees 404
  assert.equal((await carol.c.get(`/api/tasks/${t.id}`)).status, 404);
  // project cannot be changed
  assert.equal((await admin.c.patch(`/api/tasks/${t.id}`).send({ projectId: project.id })).status, 422);
  // owner can delete
  assert.equal((await admin.c.delete(`/api/tasks/${t.id}`)).status, 200);
  assert.equal((await admin.c.get(`/api/tasks/${t.id}`)).status, 404);
});

test('completing a task sets completedAt, reopening clears it', async () => {
  const t = (await mk(admin.c, { title: 'Complete me' })).body.task;
  const done = (await admin.c.patch(`/api/tasks/${t.id}`).send({ status: 'completed' })).body.task;
  assert.ok(done.completedAt);
  const reopened = (await admin.c.patch(`/api/tasks/${t.id}`).send({ status: 'todo' })).body.task;
  assert.equal(reopened.completedAt, undefined);
});

test('cross-project isolation for task lists and filters', async () => {
  const other = (await carol.c.post('/api/projects').send({ name: 'Nope' })).status; // member cannot create
  assert.equal(other, 403);
  const list = await carol.c.get('/api/tasks');
  assert.equal(list.body.tasks.length, 0);
  assert.equal((await carol.c.get(`/api/tasks?projectId=${project.id}`)).status, 404);
});

test('search, filters, sort and pagination', async () => {
  const p2 = (await admin.c.post('/api/projects').send({ name: 'Zeus' })).body.project;
  for (let i = 1; i <= 5; i += 1) {
    await admin.c.post('/api/tasks').send({ projectId: p2.id, title: `Zeus item ${i}`, priority: i % 2 ? 'urgent' : 'low', dueDate: `2030-01-0${i}` });
  }
  const q = await admin.c.get('/api/tasks?q=zeus%20item');
  assert.equal(q.body.pagination.total, 5);
  const byProject = await admin.c.get(`/api/tasks?projectId=${p2.id}&priority=urgent`);
  assert.equal(byProject.body.pagination.total, 3);
  assert.ok(byProject.body.tasks.every((t) => t.projectId === p2.id && t.priority === 'urgent'));
  const page = await admin.c.get(`/api/tasks?projectId=${p2.id}&limit=2&page=3&sort=dueDate`);
  assert.equal(page.body.tasks.length, 1);
  assert.equal(page.body.pagination.pages, 3);
  const prio = await admin.c.get(`/api/tasks?projectId=${p2.id}&sort=priority`);
  assert.equal(prio.body.tasks[0].priority, 'urgent');
  const mine = await alice.c.get('/api/tasks?assignedTo=me');
  assert.ok(mine.body.tasks.every((t) => t.assignedTo === alice.user.id));
  // regex characters are escaped, not interpreted
  assert.equal((await admin.c.get('/api/tasks?q=.*')).body.pagination.total, 0);
});

test('removing a member unassigns their tasks; owner cannot be removed', async () => {
  const p = (await admin.c.post('/api/projects').send({ name: 'Members' })).body.project;
  await addMember(admin.c, p.id, bob);
  const t = (await admin.c.post('/api/tasks').send({ projectId: p.id, title: 'Bob work', assignedTo: bob.user.id })).body.task;
  assert.equal((await admin.c.post(`/api/projects/${p.id}/members`).send({ userId: bob.user.id })).status, 409);
  assert.equal((await admin.c.delete(`/api/projects/${p.id}/members/${admin.user.id}`)).status, 400);
  assert.equal((await admin.c.delete(`/api/projects/${p.id}/members/${bob.user.id}`)).status, 200);
  assert.equal((await admin.c.get(`/api/tasks/${t.id}`)).body.task.assignedTo, null);
  assert.equal((await bob.c.get(`/api/projects/${p.id}`)).status, 404);
});

test('project progress is derived from tasks; deleting a project removes its tasks', async () => {
  const p = (await admin.c.post('/api/projects').send({ name: 'Progress' })).body.project;
  const ids = [];
  for (const title of ['aa', 'bb', 'cc', 'dd']) ids.push((await admin.c.post('/api/tasks').send({ projectId: p.id, title })).body.task.id);
  await admin.c.patch(`/api/tasks/${ids[0]}`).send({ status: 'completed' });
  const got = (await admin.c.get(`/api/projects/${p.id}`)).body.project;
  assert.equal(got.taskCount, 4);
  assert.equal(got.completedCount, 1);
  assert.equal(got.progress, 25);
  await admin.c.patch(`/api/projects/${p.id}`).send({ progress: 100 });
  assert.equal((await admin.c.get(`/api/projects/${p.id}`)).body.project.progress, 25);
  assert.equal((await admin.c.delete(`/api/projects/${p.id}`)).status, 200);
  assert.equal((await admin.c.get(`/api/tasks/${ids[1]}`)).status, 404);
});

test('archived projects reject new tasks', async () => {
  const p = (await admin.c.post('/api/projects').send({ name: 'Archived one' })).body.project;
  await admin.c.patch(`/api/projects/${p.id}`).send({ status: 'archived' });
  assert.equal((await admin.c.post('/api/tasks').send({ projectId: p.id, title: 'late' })).status, 409);
});
