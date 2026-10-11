import { Task } from '../models/Task.js';
import { startOfToday } from './access.js';

// Project progress is always derived from task records; projects with no tasks report 0%.
export async function progressByProject(projectIds) {
  const tasks = await Task.find({ projectId: { $in: projectIds } }).select('projectId status dueDate').lean();
  const today = startOfToday();
  const map = new Map();
  for (const id of projectIds) map.set(String(id), { taskCount: 0, completedCount: 0, overdueCount: 0, progress: 0 });
  for (const t of tasks) {
    const row = map.get(String(t.projectId));
    if (!row) continue;
    row.taskCount += 1;
    if (t.status === 'completed') row.completedCount += 1;
    else if (t.dueDate && t.dueDate < today) row.overdueCount += 1;
  }
  for (const row of map.values()) row.progress = row.taskCount ? Math.round((row.completedCount / row.taskCount) * 100) : 0;
  return map;
}
