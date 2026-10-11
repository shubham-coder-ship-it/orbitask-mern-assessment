// Development-only demo data. Refuses to run in production.
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Activity } from '../models/Activity.js';

if (env.nodeEnv === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}
await connectDB(env.mongoUri);
await Promise.all([User.deleteMany({}), Project.deleteMany({}), Task.deleteMany({}), Activity.deleteMany({})]);
const passwordHash = await bcrypt.hash('Password123', 12);
const [admin, sam, priya] = await User.create([
  { name: 'Demo Admin', email: 'admin@orbitask.dev', passwordHash, role: 'admin' },
  { name: 'Sam Rivera', email: 'sam@orbitask.dev', passwordHash },
  { name: 'Priya Nair', email: 'priya@orbitask.dev', passwordHash },
]);
const day = (n) => new Date(Date.now() + n * 86400000);
const web = await Project.create({ name: 'Website Relaunch', description: 'Redesign and migrate the marketing site.', owner: admin._id, members: [admin._id, sam._id, priya._id], startDate: day(-14), dueDate: day(30) });
await Task.create([
  { title: 'Audit existing pages', projectId: web._id, createdBy: admin._id, assignedTo: sam._id, status: 'completed', priority: 'medium', completedAt: day(-3), dueDate: day(-5) },
  { title: 'Design new homepage', projectId: web._id, createdBy: admin._id, assignedTo: priya._id, status: 'in_review', priority: 'high', dueDate: day(2) },
  { title: 'Migrate blog content', projectId: web._id, createdBy: admin._id, assignedTo: sam._id, status: 'in_progress', priority: 'medium', dueDate: day(-1) },
  { title: 'Set up analytics', projectId: web._id, createdBy: admin._id, status: 'todo', priority: 'low', dueDate: day(10) },
]);
await Activity.create({ actorId: admin._id, projectId: web._id, action: 'project.created', metadata: { name: web.name } });
console.log('Seeded demo data. Login: admin@orbitask.dev / Password123');
await mongoose.disconnect();
