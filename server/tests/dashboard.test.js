import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, signup, addMember } from './helpers.js';

let app;
let adminClient;
before(async () => { app = await setup(); });
after(teardown);

test('empty database yields zeros, not fake numbers', async () => {
  const { c } = await signup(app, 'Empty Admin', 'empty@example.com');
  adminClient = c; // first user => admin
  const s = (await c.get('/api/dashboard/stats')).body;
  assert.deepEqual(s.totals, { projects: 0, tasks: 0, inProgress: 0, overdue: 0, completed: 0, completionRate: 0, teamMembers: 0 });
  assert.equal((await c.get('/api/dashboard/deadlines')).body.deadlines.length, 0);
  assert.equal((await c.get('/api/activity')).body.activity.length, 0);
});

test('stats, overdue, deadlines, activity and scoping are computed from real records', async () => {
  const admin = adminClient;
  const mem = await signup(app, 'Member Two', 'member2@example.com');
  const outsider = await signup(app, 'Out Sider', 'outsider@example.com');
  const p = (await admin.post('/api/projects').send({ name: 'Metrics' })).body.project;
  await addMember(admin, p.id, mem);
  const past = '2020-01-01';
  const future = '2099-01-01';
  const t1 = (await admin.post('/api/tasks').send({ projectId: p.id, title: 'Overdue one', dueDate: past, priority: 'urgent', assignedTo: mem.user.id })).body.task;
  await admin.post('/api/tasks').send({ projectId: p.id, title: 'Future one', dueDate: future, status: 'in_progress' });
  const t3 = (await admin.post('/api/tasks').send({ projectId: p.id, title: 'Done late', dueDate: past })).body.task;
  await admin.patch(`/api/tasks/${t3.id}`).send({ status: 'completed' });
  assert.equal(t1.overdue, true);

  const s = (await admin.get('/api/dashboard/stats')).body;
  assert.equal(s.totals.projects, 1);
  assert.equal(s.totals.tasks, 3);
  assert.equal(s.totals.overdue, 1); // completed task is not overdue
  assert.equal(s.totals.inProgress, 1);
  assert.equal(s.totals.completionRate, 33);
  assert.equal(s.totals.teamMembers, 2);
  assert.equal(s.projectProgress[0].completedCount, 1);

  const d = (await admin.get('/api/dashboard/deadlines')).body.deadlines;
  assert.equal(d.length, 2);
  assert.equal(d[0].title, 'Overdue one');
  assert.equal(d[0].overdue, true);

  const act = (await admin.get('/api/activity')).body.activity.map((a) => a.action);
  for (const a of ['project.created', 'member.added', 'task.created', 'task.assigned', 'task.completed', 'task.status_changed']) assert.ok(act.includes(a), a);

  // member of the project sees the same scope; outsider sees nothing
  assert.equal((await mem.c.get('/api/dashboard/stats')).body.totals.tasks, 3);
  assert.equal((await outsider.c.get('/api/dashboard/stats')).body.totals.tasks, 0);
  assert.equal((await outsider.c.get('/api/activity')).body.activity.length, 0);
  assert.equal((await outsider.c.get(`/api/activity?projectId=${p.id}`)).status, 404);

  const an = (await admin.get('/api/analytics')).body;
  assert.equal(an.byPriority.urgent, 1);
  assert.equal(an.workload.find((w) => w.user.name === 'Member Two').overdue, 1);
  assert.equal((await mem.c.get('/api/analytics')).body.workload, null);

  const team = (await mem.c.get('/api/users')).body.users;
  assert.equal(team.length, 2);
  assert.equal(team.find((u) => u.name === 'Member Two').assignedCount, 1);
  assert.equal((await outsider.c.get(`/api/users/${mem.user.id}`)).status, 404);
});
