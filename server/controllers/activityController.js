import { Activity } from '../models/Activity.js';
import { asyncHandler, AppError } from '../utils/AppError.js';
import { accessibleProjectIds } from '../services/access.js';
import { requireId } from '../utils/validate.js';

export const listActivity = asyncHandler(async (req, res) => {
  let projectIds = await accessibleProjectIds(req.user);
  if (req.query.projectId) {
    requireId(req.query.projectId, 'project id');
    if (!projectIds.some((id) => String(id) === req.query.projectId)) throw new AppError(404, 'Project not found');
    projectIds = [req.query.projectId];
  }
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
  const items = await Activity.find({ projectId: { $in: projectIds } })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('actorId', 'name')
    .populate('projectId', 'name');
  res.json({
    activity: items.map((a) => ({
      id: String(a._id),
      action: a.action,
      actor: a.actorId ? { id: String(a.actorId._id), name: a.actorId.name } : null,
      project: a.projectId ? { id: String(a.projectId._id), name: a.projectId.name } : null,
      taskId: a.taskId ? String(a.taskId) : null,
      metadata: a.metadata,
      timestamp: a.timestamp,
    })),
  });
});
