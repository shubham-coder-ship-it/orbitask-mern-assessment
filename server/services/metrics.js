import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { TASK_STATUSES, PRIORITIES } from '../utils/constants.js';
import { accessibleProjectIds, startOfToday } from './access.js';
import { progressByProject } from './progress.js';

// All metrics are computed from records inside projects the user can access.
export async function computeMetrics(user) {
  const projectIds = await accessibleProjectIds(user);
  const projects = await Project.find({ _id: { $in: projectIds } }).select('name members owner status').lean();
  const tasks = await Task.find({ projectId: { $in: projectIds } }).select('status priority dueDate assignedTo projectId').lean();
  const today = startOfToday();

  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0]));
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
  let overdue = 0;
  const workloadMap = new Map();
  for (const t of tasks) {
    byStatus[t.status] += 1;
    byPriority[t.priority] += 1;
    const isOverdue = t.status !== 'completed' && t.dueDate && t.dueDate < today;
    if (isOverdue) overdue += 1;
    if (t.assignedTo) {
      const w = workloadMap.get(String(t.assignedTo)) || { total: 0, open: 0, completed: 0, overdue: 0 };
      w.total += 1;
      if (t.status === 'completed') w.completed += 1;
      else w.open += 1;
      if (isOverdue) w.overdue += 1;
      workloadMap.set(String(t.assignedTo), w);
    }
  }
  const totalTasks = tasks.length;
  const completed = byStatus.completed;
  const progress = await progressByProject(projectIds);
  const memberIds = new Set();
  projects.forEach((p) => {
    memberIds.add(String(p.owner));
    p.members.forEach((m) => memberIds.add(String(m)));
  });
  return {
    projects,
    totalProjects: projects.length,
    totalTasks,
    byStatus,
    byPriority,
    overdue,
    completed,
    inProgress: byStatus.in_progress,
    completionRate: totalTasks ? Math.round((completed / totalTasks) * 100) : 0,
    teamMembers: memberIds.size,
    projectProgress: projects.map((p) => ({ id: String(p._id), name: p.name, status: p.status, ...progress.get(String(p._id)) })),
    workloadMap,
    projectIds,
  };
}
