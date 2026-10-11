import { Task } from '../models/Task.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { requireId } from '../utils/validate.js';
import { validateTask } from '../validators/taskValidators.js';
import { accessibleProjectIds, isOwner, loadProject, sameId, startOfToday } from '../services/access.js';
import { logActivity } from '../services/activityService.js';
import { notify, notifyMany } from '../services/notificationService.js';
import { User } from '../models/User.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const populateOpts = [
  { path: 'projectId', select: 'name' },
  { path: 'assignedTo', select: 'name email' },
  { path: 'createdBy', select: 'name email' },
];

const refId = (v) => (v && typeof v === 'object' ? String(v.id ?? v._id) : v ? String(v) : null);

export function presentTask(task) {
  const o = task.toJSON();
  const project = o.projectId;
  const assignee = o.assignedTo && typeof o.assignedTo === 'object' ? o.assignedTo : null;
  const creator = o.createdBy && typeof o.createdBy === 'object' ? o.createdBy : null;
  return {
    ...o,
    projectId: refId(project),
    project: project && typeof project === 'object' ? { id: refId(project), name: project.name } : undefined,
    assignee: assignee ? { id: refId(assignee), name: assignee.name, email: assignee.email } : null,
    assignedTo: refId(o.assignedTo),
    creator: creator ? { id: refId(creator), name: creator.name } : undefined,
    createdBy: refId(o.createdBy),
    overdue: Boolean(o.dueDate && o.status !== 'completed' && new Date(o.dueDate) < startOfToday()),
  };
}

const populateTask = (q) => q.populate(populateOpts);

async function assertAssignable(project, assigneeId, user) {
  if (!assigneeId) return;
  // A user who is being/has been deleted can never receive new work (closes the deletion race).
  if (!(await User.exists({ _id: assigneeId, deletedAt: null }))) throw new AppError(422, 'Validation failed', { assignedTo: 'That user is no longer available' });
  const isMember = project.members.some((m) => sameId(m, assigneeId));
  if (!isMember) throw new AppError(422, 'Validation failed', { assignedTo: 'Assignee must be a member of the project' });
  // Only the project owner may assign work to other people; others may only take a task themselves.
  if (!isOwner(project, user) && !sameId(assigneeId, user._id)) {
    throw new AppError(403, 'Only the project owner can assign tasks to other members');
  }
}

async function loadTask(id, user) {
  requireId(id, 'task id');
  const task = await Task.findById(id);
  if (!task) throw new AppError(404, 'Task not found');
  const project = await loadProject(task.projectId, user).catch(() => {
    throw new AppError(404, 'Task not found');
  });
  return { task, project };
}

const canEdit = (task, project, user) => isOwner(project, user) || sameId(task.createdBy, user._id) || sameId(task.assignedTo, user._id);
const canDelete = (task, project, user) => isOwner(project, user) || sameId(task.createdBy, user._id);

export const listTasks = asyncHandler(async (req, res) => {
  const { q, projectId, status, priority, assignedTo, due, sort = 'createdAt', order } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  let projectIds = await accessibleProjectIds(req.user);
  const filter = {};
  if (projectId) {
    requireId(projectId, 'project id');
    if (!projectIds.some((id) => String(id) === String(projectId))) throw new AppError(404, 'Project not found');
    projectIds = [projectId];
  }
  filter.projectId = { $in: projectIds };
  if (q) filter.title = { $regex: escapeRe(String(q)), $options: 'i' };
  if (status) filter.status = String(status);
  if (priority) filter.priority = String(priority);
  if (assignedTo === 'me') filter.assignedTo = req.user._id;
  else if (assignedTo === 'unassigned') filter.assignedTo = null;
  else if (assignedTo) {
    requireId(assignedTo, 'assignee id');
    filter.assignedTo = assignedTo;
  }
  const today = startOfToday();
  if (due === 'overdue') {
    filter.dueDate = { $lt: today };
    filter.status = { $ne: 'completed' };
  } else if (due === 'week') {
    const end = new Date(today.getTime() + 7 * 86400000);
    filter.dueDate = { $gte: today, $lte: end };
  } else if (due === 'none') filter.dueDate = null;

  const sortField = { dueDate: 'dueDate', priority: 'priorityRank', createdAt: 'createdAt' }[sort] || 'createdAt';
  const dir = (order || (sort === 'dueDate' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
  const [total, tasks] = await Promise.all([
    Task.countDocuments(filter),
    populateTask(Task.find(filter).sort({ [sortField]: dir, _id: -1 }).skip((page - 1) * limit).limit(limit)),
  ]);
  res.json({ tasks: tasks.map(presentTask), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

export const createTask = asyncHandler(async (req, res) => {
  const data = validateTask(req.body);
  const project = await loadProject(data.projectId, req.user);
  if (['archived', 'completed'].includes(project.status)) throw new AppError(409, 'Cannot add tasks to an archived or completed project');
  await assertAssignable(project, data.assignedTo, req.user);
  const task = new Task({ ...data, createdBy: req.user._id });
  if (task.status === 'completed') task.completedAt = new Date();
  await task.save();
  const meta = { title: task.title, project: project.name };
  await logActivity({ actorId: req.user._id, projectId: project._id, taskId: task._id, action: 'task.created', metadata: meta });
  if (task.assignedTo) await logActivity({ actorId: req.user._id, projectId: project._id, taskId: task._id, action: 'task.assigned', metadata: { ...meta, assigneeId: String(task.assignedTo) } });
  if (task.assignedTo) await notify({ recipientId: task.assignedTo, actorId: req.user._id, type: 'task.assigned', title: 'New task assigned to you', message: `“${task.title}” in ${project.name}.`, entityType: 'task', entityId: task._id, link: `/projects/${project._id}` });
  await task.populate(populateOpts);
  res.status(201).json({ task: presentTask(task) });
});

export const getTask = asyncHandler(async (req, res) => {
  const { task } = await loadTask(req.params.id, req.user);
  await task.populate(populateOpts);
  res.json({ task: presentTask(task) });
});

export const updateTask = asyncHandler(async (req, res) => {
  const { task, project } = await loadTask(req.params.id, req.user);
  if (!canEdit(task, project, req.user)) throw new AppError(403, 'You can only edit tasks you created, are assigned to, or own the project of');
  const data = validateTask(req.body, { partial: true });
  if (data.assignedTo !== undefined && String(data.assignedTo) !== String(task.assignedTo || '')) await assertAssignable(project, data.assignedTo, req.user);
  const iso = (d) => (d ? new Date(d).toISOString() : '');
  const snapshot = () => ({ title: task.title, description: task.description || '', priority: task.priority, status: task.status, dueDate: iso(task.dueDate), startDate: iso(task.startDate) });
  const before = { ...snapshot(), assignedTo: task.assignedTo ? String(task.assignedTo) : null };
  Object.assign(task, data);
  const start = task.startDate;
  const due = task.dueDate;
  if (start && due && due < start) throw new AppError(422, 'Validation failed', { dueDate: 'Due date cannot be before start date' });
  if (before.status !== task.status) task.completedAt = task.status === 'completed' ? new Date() : undefined;
  await task.save();

  const base = { actorId: req.user._id, projectId: project._id, taskId: task._id };
  const meta = { title: task.title, project: project.name };
  if (before.status !== task.status) {
    await logActivity({ ...base, action: 'task.status_changed', metadata: { ...meta, from: before.status, to: task.status } });
    if (task.status === 'completed') await logActivity({ ...base, action: 'task.completed', metadata: meta });
  }
  if (before.priority !== task.priority) await logActivity({ ...base, action: 'task.priority_changed', metadata: { ...meta, from: before.priority, to: task.priority } });
  const after = task.assignedTo ? String(task.assignedTo) : null;
  if (before.assignedTo !== after) await logActivity({ ...base, action: 'task.assigned', metadata: { ...meta, assigneeId: after } });

  // Notifications: assignee changes go to the old and new assignee; other changes go to the current assignee and creator.
  const link = `/projects/${project._id}`;
  const ref = { entityType: 'task', entityId: task._id, link };
  if (before.assignedTo !== after) {
    if (after) await notify({ recipientId: after, actorId: req.user._id, type: 'task.assigned', title: 'Task assigned to you', message: `“${task.title}” in ${project.name}.`, ...ref });
    if (before.assignedTo) await notify({ recipientId: before.assignedTo, actorId: req.user._id, type: 'task.unassigned', title: 'Task unassigned', message: `“${task.title}” is no longer assigned to you.`, ...ref });
  }
  const now = snapshot();
  const touched = ['title', 'description', 'priority', 'dueDate', 'startDate', 'status'].filter((k) => before[k] !== now[k]);
  if (touched.length) {
    const reopened = before.status === 'completed' && task.status !== 'completed';
    const completed = before.status !== 'completed' && task.status === 'completed';
    const type = completed ? 'task.completed' : reopened ? 'task.reopened' : 'task.updated';
    const title = completed ? 'Task completed' : reopened ? 'Task reopened' : 'Task updated';
    await notifyMany([after, task.createdBy], { actorId: req.user._id, type, title, message: `“${task.title}” — changed ${touched.join(', ')}.`, ...ref });
  }
  await task.populate(populateOpts);
  res.json({ task: presentTask(task) });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const { task, project } = await loadTask(req.params.id, req.user);
  if (!canDelete(task, project, req.user)) throw new AppError(403, 'Only the task creator or project owner can delete this task');
  await logActivity({ actorId: req.user._id, projectId: project._id, action: 'task.deleted', metadata: { title: task.title, project: project.name } });
  await task.deleteOne();
  await notifyMany([task.assignedTo, task.createdBy], { actorId: req.user._id, type: 'task.deleted', title: 'Task deleted', message: `“${task.title}” in ${project.name} was deleted.`, entityType: 'task', entityId: task._id, link: null });
  res.json({ ok: true });
});

