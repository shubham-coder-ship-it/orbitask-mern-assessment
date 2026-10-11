import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, signup, addMember } from './helpers.js';
import { setTransportForTests } from '../services/mailer.js';
import { EmailRecord } from '../models/EmailRecord.js';
import { Notification } from '../models/Notification.js';

let app; let admin; let owner; let mia; let bo; let outsider; let project;
let sent = [];
let failFor = null;
const fake = {
  async sendMail(msg) {
    if (failFor === 'all' || (failFor && msg.to === failFor)) throw new Error('550 mailbox unavailable');
    sent.push(msg);
    return { messageId: `<id-${sent.length}@test>` };
  },
};

before(async () => {
  process.env.SMTP_FROM = 'Orbitask <no-reply@orbitask.test>';
  app = await setup();
  admin = await signup(app, 'Root Admin', 'admin@example.com');
  owner = await signup(app, 'Olive Owner', 'owner@example.com');
  mia = await signup(app, 'Mia Member', 'mia@example.com');
  bo = await signup(app, 'Bo Member', 'bo@example.com');
  outsider = await signup(app, 'Out Sider', 'outsider@example.com');
  await admin.c.patch(`/api/users/${owner.user.id}/role`).send({ role: 'admin' });
  project = (await owner.c.post('/api/projects').send({ name: 'Email project' })).body.project;
  await addMember(owner.c, project.id, mia);
  await addMember(owner.c, project.id, bo);
});
after(teardown);
beforeEach(() => { sent = []; failFor = null; setTransportForTests(fake); });

const msg = (extra = {}) => ({ audience: 'users', subject: `Hello ${Math.random()}`, body: 'Quick note', ...extra });

test('recipient list exposes names and roles only, never email addresses', async () => {
  const res = await mia.c.get('/api/email/recipients');
  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes('@example.com'));
  assert.deepEqual(res.body.users.map((u) => u.name).sort(), ['Olive Owner', 'Root Admin']);
});

test('member may email an admin / project owner; accepted status is honest and From is never spoofed', async () => {
  const res = await mia.c.post('/api/email/send').send(msg({ to: [owner.user.id] }));
  assert.equal(res.status, 200);
  assert.equal(res.body.email.status, 'accepted');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, process.env.SMTP_FROM);
  assert.equal(sent[0].replyTo, 'mia@example.com');
  assert.equal(sent[0].to, 'owner@example.com');
  assert.ok(!/delivered/i.test(res.body.message));
  assert.equal((await Notification.countDocuments({ recipientId: owner.user.id, type: 'email.received' })) >= 1, true);
});

test('member-to-member is blocked by default and allowed once an admin enables it', async () => {
  assert.equal((await mia.c.post('/api/email/send').send(msg({ to: [bo.user.id] }))).status, 403);
  assert.equal((await mia.c.post('/api/email/send').send(msg({ audience: 'project', projectId: project.id }))).status, 403);
  assert.equal((await mia.c.patch('/api/workspace/settings').send({ allowMemberToMemberEmail: true })).status, 403);
  assert.equal((await admin.c.patch('/api/workspace/settings').send({ allowMemberToMemberEmail: true })).status, 200);
  assert.equal((await mia.c.post('/api/email/send').send(msg({ to: [bo.user.id] }))).status, 200);
  const team = await mia.c.post('/api/email/send').send(msg({ audience: 'project', projectId: project.id }));
  assert.equal(team.status, 200);
  assert.ok(!sent.some((m) => m.to === 'mia@example.com'), 'sender is not emailed');
  // an outsider still cannot reach project members, even with the setting on
  assert.equal((await outsider.c.post('/api/email/send').send(msg({ to: [bo.user.id] }))).status, 403);
  assert.equal((await mia.c.post('/api/email/send').send(msg({ to: [outsider.user.id] }))).status, 403);
  await admin.c.patch('/api/workspace/settings').send({ allowMemberToMemberEmail: false });
  assert.equal((await mia.c.post('/api/email/send').send(msg({ to: [bo.user.id] }))).status, 403, 'setting persists and is re-checked');
});

test('only admins can email the whole workspace; one message per recipient', async () => {
  assert.equal((await mia.c.post('/api/email/send').send(msg({ audience: 'workspace' }))).status, 403);
  const res = await admin.c.post('/api/email/send').send(msg({ audience: 'workspace' }));
  assert.equal(res.status, 200);
  assert.equal(sent.length, 4);
  assert.ok(sent.every((m) => !String(m.to).includes(',')));
});

test('header injection is neutralised and validation is enforced', async () => {
  const res = await admin.c.post('/api/email/send').send(msg({ to: [mia.user.id], subject: 'Hi\r\nBcc: evil@x.com' }));
  assert.equal(res.status, 200);
  assert.ok(!/[\r\n]/.test(sent[0].subject));
  assert.equal((await admin.c.post('/api/email/send').send({ audience: 'users', to: [mia.user.id], subject: '', body: '' })).status, 422);
  assert.equal((await admin.c.post('/api/email/send').send(msg({ to: [] }))).status, 422);
  assert.equal((await admin.c.post('/api/email/send').send(msg({ to: ['nope'] }))).status, 422);
  assert.equal((await admin.c.post('/api/email/send').send(msg({ to: [admin.user.id] }))).status, 403, 'cannot email yourself');
});

test('provider failure is reported as failed (502), partial is partial, nothing is called delivered', async () => {
  failFor = 'all';
  const f = await admin.c.post('/api/email/send').send(msg({ to: [mia.user.id] }));
  assert.equal(f.status, 502);
  assert.equal(f.body.email.status, 'failed');
  failFor = 'bo@example.com';
  const p = await admin.c.post('/api/email/send').send(msg({ to: [mia.user.id, bo.user.id] }));
  assert.equal(p.status, 200);
  assert.equal(p.body.email.status, 'partial');
  assert.equal(p.body.email.sent, 1);
  assert.equal(p.body.email.failed, 1);
});

test('not configured => 503 and a failed record, nothing sent', async () => {
  setTransportForTests(null);
  const saved = process.env.SMTP_HOST; const savedFrom = process.env.SMTP_FROM;
  delete process.env.SMTP_HOST; delete process.env.SMTP_FROM;
  try {
    const res = await admin.c.post('/api/email/send').send(msg({ to: [mia.user.id] }));
    assert.equal(res.status, 503);
    assert.equal(sent.length, 0);
    assert.equal((await mia.c.get('/api/email/recipients')).body.emailConfigured, false);
  } finally {
    if (saved) process.env.SMTP_HOST = saved;
    process.env.SMTP_FROM = savedFrom;
  }
});

test('duplicate sends within 30s are refused; history is private to the sender', async () => {
  const body = msg({ to: [mia.user.id], subject: 'Once only' });
  assert.equal((await admin.c.post('/api/email/send').send(body)).status, 200);
  assert.equal((await admin.c.post('/api/email/send').send(body)).status, 409);
  assert.equal(sent.length, 1);
  const mine = (await admin.c.get('/api/email/history')).body.emails;
  assert.ok(mine.some((e) => e.subject === 'Once only'));
  assert.ok(!JSON.stringify(mine).includes('@example.com'));
  const theirs = (await mia.c.get('/api/email/history')).body.emails;
  assert.ok(!theirs.some((e) => e.subject === 'Once only'), 'recipients cannot read the sender history');
  assert.equal(await EmailRecord.countDocuments({ subject: 'Once only' }), 1);
});

test('email endpoints require authentication', async () => {
  const { client } = await import('./helpers.js');
  const anon = client(app);
  assert.equal((await anon.get('/api/email/recipients')).status, 401);
  assert.equal((await anon.post('/api/email/send').send(msg({ to: [mia.user.id] }))).status, 401);
  assert.equal((await anon.get('/api/email/history')).status, 401);
});
