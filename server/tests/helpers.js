import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.FIRST_USER_ADMIN = 'true';

let memory;

export async function setup() {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  const dbName = `orbitask_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await mongoose.connect(uri, { dbName });
  const { createApp } = await import('../app.js');
  return createApp();
}

export async function teardown() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memory) await memory.stop();
}

// An agent keeps the auth cookie and always sends the CSRF header.
export function client(app) {
  const agent = request.agent(app);
  const wrap = (m) => (url) => agent[m](url).set('X-Requested-With', 'orbitask');
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), delete: wrap('delete'), raw: agent };
}

export async function signup(app, name, email, password = 'Passw0rdOK') {
  const c = client(app);
  const res = await c.post('/api/auth/register').send({ name, email, password, confirmPassword: password });
  return { c, user: res.body.user, res };
}

// Owner invites a user and the user accepts (membership now requires acceptance).
export async function addMember(ownerClient, projectId, member) {
  const inv = await ownerClient.post(`/api/projects/${projectId}/members`).send({ userId: member.user.id });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const acc = await member.c.patch(`/api/invitations/${inv.body.invitation.id}`).send({ action: 'accept' });
  if (acc.status !== 200) throw new Error(`accept failed: ${acc.status}`);
  return inv.body.invitation;
}
