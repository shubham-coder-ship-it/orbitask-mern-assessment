import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/AppError.js';
import { computeMetrics } from '../services/metrics.js';
import { accessibleProjectIds, startOfToday } from '../services/access.js';
import { presentTask } from './taskController.js';

const populateOpts = [
  { path: 'projectId', select: 'name' },
  { path: 'assignedTo', select: 'name email' },
  { path: 'createdBy', select: 'name email' },
];

export const stats = asyncHandler(async (req, res) => {
  const m = await computeMetrics(req.user);
  const recent = await Task.find({ projectId: { $in: m.projectIds } }).sort({ updatedAt: -1 }).limit(8).populate(populateOpts);
  res.json({
    totals: {
      projects: m.totalProjects,
      tasks: m.totalTasks,
      inProgress: m.inProgress,
      overdue: m.overdue,
      completed: m.completed,
      completionRate: m.completionRate,
      teamMembers: m.teamMembers,
    },
    byStatus: m.byStatus,
    projectProgress: m.projectProgress,
    recentTasks: recent.map(presentTask),
  });
});

export const deadlines = asyncHandler(async (req, res) => {
  const projectIds = await accessibleProjectIds(req.user);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 8));
  const tasks = await Task.find({ projectId: { $in: projectIds }, status: { $ne: 'completed' }, dueDate: { $ne: null } })
    .sort({ dueDate: 1 })
    .limit(limit)
    .populate(populateOpts);
  res.json({ deadlines: tasks.map(presentTask), today: startOfToday() });
});

export const analytics = asyncHandler(async (req, res) => {
  const m = await computeMetrics(req.user);
  let workload = null;
  if (req.user.role === 'admin') {
    const users = await User.find({ _id: { $in: [...m.workloadMap.keys()] } }).select('name email');
    workload = users.map((u) => ({ user: { id: String(u._id), name: u.name }, ...m.workloadMap.get(String(u._id)) })).sort((a, b) => b.open - a.open);
  }
  res.json({
    byStatus: m.byStatus,
    byPriority: m.byPriority,
    totalTasks: m.totalTasks,
    completionRate: m.completionRate,
    overdue: m.overdue,
    projectProgress: m.projectProgress,
    workload,
  });
});
