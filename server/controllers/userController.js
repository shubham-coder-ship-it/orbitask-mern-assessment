import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { requireId } from '../utils/validate.js';
import { validateProfile } from '../validators/authValidators.js';
import { accessibleProjectIds, sameId } from '../services/access.js';

async function visibleUserIds(user) {
  const projects = await Project.find({ $or: [{ owner: user._id }, { members: user._id }] }).select('name owner members');
  const ids = new Set([String(user._id)]);
  projects.forEach((p) => {
    ids.add(String(p.owner));
    p.members.forEach((m) => ids.add(String(m)));
  });
  return { ids: [...ids], projects };
}

export const listUsers = asyncHandler(async (req, res) => {
  const { ids, projects } = await visibleUserIds(req.user);
  const filter = req.user.role === 'admin' ? { deletedAt: null } : { _id: { $in: ids }, deletedAt: null };
  const users = await User.find(filter).sort({ name: 1 });
  const projectIds = await accessibleProjectIds(req.user);
  const tasks = await Task.find({ projectId: { $in: projectIds }, assignedTo: { $ne: null } }).select('assignedTo status').lean();
  const counts = new Map();
  for (const t of tasks) {
    const c = counts.get(String(t.assignedTo)) || { assigned: 0, completed: 0 };
    c.assigned += 1;
    if (t.status === 'completed') c.completed += 1;
    counts.set(String(t.assignedTo), c);
  }
  const data = users.map((u) => {
    const c = counts.get(String(u._id)) || { assigned: 0, completed: 0 };
    const mine = projects
      .filter((p) => sameId(p.owner, u._id) || p.members.some((m) => sameId(m, u._id)))
      .map((p) => ({ id: String(p._id), name: p.name }));
    return { ...u.toJSON(), assignedCount: c.assigned, completedCount: c.completed, projects: mine };
  });
  res.json({ users: data });
});

export const getUser = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'user id');
  const { ids } = await visibleUserIds(req.user);
  if (req.user.role !== 'admin' && !ids.includes(req.params.id)) throw new AppError(404, 'User not found');
  const user = await User.findOne({ _id: req.params.id, deletedAt: null });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const updates = validateProfile(req.body); // role and email cannot be changed here
  Object.assign(req.user, updates);
  await req.user.save();
  res.json({ user: req.user });
});

// Admin-only lookup used by the "Invite member" dialog. Returns the minimum needed to pick a person.
export const searchUsers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) throw new AppError(422, 'Validation failed', { q: 'Type at least 2 characters' });
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({ deletedAt: null, _id: { $ne: req.user._id }, $or: [{ name: re }, { email: re }] }).sort({ name: 1 }).limit(10);
  res.json({ users: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email })) });
});
