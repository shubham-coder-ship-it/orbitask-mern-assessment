import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Activity } from '../models/Activity.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { requireId } from '../utils/validate.js';
import { validateProject } from '../validators/projectValidators.js';
import { loadProject, requireOwner, sameId } from '../services/access.js';
import { logActivity } from '../services/activityService.js';
import { progressByProject } from '../services/progress.js';
import { notify, notifyMany } from '../services/notificationService.js';
import { createInvite } from './invitationController.js';
import { Invitation } from '../models/Invitation.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function present(projects) {
  const populated = await Project.populate(projects, [
    { path: 'owner', select: 'name email role' },
    { path: 'members', select: 'name email role' },
  ]);
  const stats = await progressByProject(populated.map((p) => p._id));
  return populated.map((p) => ({ ...p.toJSON(), ...stats.get(String(p._id)) }));
}

export const listProjects = asyncHandler(async (req, res) => {
  const { q, status, sort = 'createdAt', order = 'desc' } = req.query;
  const filter = { $or: [{ owner: req.user._id }, { members: req.user._id }] };
  if (status) filter.status = String(status);
  if (q) filter.name = { $regex: escapeRe(String(q)), $options: 'i' };
  const sortField = ['name', 'dueDate', 'createdAt'].includes(sort) ? sort : 'createdAt';
  const projects = await Project.find(filter).sort({ [sortField]: order === 'asc' ? 1 : -1 });
  res.json({ projects: await present(projects) });
});

export const createProject = asyncHandler(async (req, res) => {
  const data = validateProject(req.body);
  const project = await Project.create({ ...data, owner: req.user._id, members: [req.user._id] });
  await logActivity({ actorId: req.user._id, projectId: project._id, action: 'project.created', metadata: { name: project.name } });
  res.status(201).json({ project: (await present([project]))[0] });
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await loadProject(req.params.id, req.user);
  res.json({ project: (await present([project]))[0] });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await loadProject(req.params.id, req.user);
  requireOwner(project, req.user);
  const data = validateProject(req.body, { partial: true });
  const next = { start: data.startDate !== undefined ? data.startDate : project.startDate, due: data.dueDate !== undefined ? data.dueDate : project.dueDate };
  if (next.start && next.due && next.due < next.start) throw new AppError(422, 'Validation failed', { dueDate: 'Due date cannot be before start date' });
  const changed = Object.keys(data);
  const wasStatus = project.status;
  Object.assign(project, data);
  await project.save();
  await logActivity({ actorId: req.user._id, projectId: project._id, action: 'project.updated', metadata: { name: project.name, fields: changed } });
  const archived = data.status === 'archived' && wasStatus !== 'archived';
  await notifyMany(project.members, {
    actorId: req.user._id, type: archived ? 'project.archived' : 'project.updated', title: archived ? 'Project archived' : 'Project updated',
    message: archived ? `“${project.name}” was archived.` : `“${project.name}” was updated (${changed.join(', ')}).`, entityType: 'project', entityId: project._id, link: `/projects/${project._id}`,
  });
  res.json({ project: (await present([project]))[0] });
});

export const deleteProject = asyncHandler(async (req, res) => {
  const project = await loadProject(req.params.id, req.user);
  requireOwner(project, req.user);
  const members = [...project.members];
  await Task.deleteMany({ projectId: project._id });
  await Activity.deleteMany({ projectId: project._id });
  await Invitation.updateMany({ projectId: project._id, status: 'pending' }, { $set: { status: 'cancelled', resolvedAt: new Date() }, $unset: { pendingKey: 1 } });
  await project.deleteOne();
  await notifyMany(members, { actorId: req.user._id, type: 'project.deleted', title: 'Project deleted', message: `“${project.name}” was deleted by its owner.`, entityType: 'project', entityId: project._id, link: null });
  res.json({ ok: true });
});

// Adding a member now means INVITING them: they only join after they accept (see invitationController).
export const addMember = asyncHandler(async (req, res) => {
  req.body = { projectId: req.params.id, userId: req.body?.userId };
  return createInvite(req, res);
});

export const removeMember = asyncHandler(async (req, res) => {
  const project = await loadProject(req.params.id, req.user);
  requireOwner(project, req.user);
  requireId(req.params.userId, 'user id');
  if (sameId(project.owner, req.params.userId)) throw new AppError(400, 'The project owner cannot be removed');
  if (!project.members.some((m) => sameId(m, req.params.userId))) throw new AppError(404, 'User is not a member');
  const user = await User.findById(req.params.userId);
  project.members = project.members.filter((m) => !sameId(m, req.params.userId));
  await project.save();
  // Unassign their open tasks in this project so assignments stay valid.
  await Task.updateMany({ projectId: project._id, assignedTo: req.params.userId }, { $set: { assignedTo: null } });
  await logActivity({ actorId: req.user._id, projectId: project._id, action: 'member.removed', metadata: { name: project.name, member: user?.name } });
  await notify({ recipientId: req.params.userId, actorId: req.user._id, type: 'member.removed', title: 'Removed from project', message: `You were removed from “${project.name}”.`, entityType: 'project', entityId: project._id, link: null });
  res.json({ project: (await present([project]))[0] });
});

// Ownership transfer lets an owner hand a project to another ADMIN member before deleting their account.
export const transferOwnership = asyncHandler(async (req, res) => {
  const project = await loadProject(req.params.id, req.user);
  requireOwner(project, req.user);
  requireId(req.body?.userId, 'user id');
  const target = await User.findOne({ _id: req.body.userId, deletedAt: null });
  if (!target || !project.members.some((m) => sameId(m, target._id))) throw new AppError(422, 'Validation failed', { userId: 'The new owner must be a current member of the project' });
  if (target.role !== 'admin') throw new AppError(422, 'Validation failed', { userId: 'Only an Admin can own a project' });
  if (sameId(target._id, req.user._id)) throw new AppError(422, 'Validation failed', { userId: 'You already own this project' });
  project.owner = target._id;
  await project.save();
  await logActivity({ actorId: req.user._id, projectId: project._id, action: 'project.updated', metadata: { name: project.name, fields: ['owner'] } });
  await notify({ recipientId: target._id, actorId: req.user._id, type: 'project.ownership', title: 'You now own a project', message: `${req.user.name} transferred “${project.name}” to you.`, entityType: 'project', entityId: project._id, link: `/projects/${project._id}` });
  res.json({ project: (await present([project]))[0] });
});
