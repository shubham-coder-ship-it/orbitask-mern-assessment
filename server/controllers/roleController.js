import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { requireId } from '../utils/validate.js';
import { ROLES } from '../utils/constants.js';
import { notify } from '../services/notificationService.js';

const activeAdmins = () => User.countDocuments({ role: 'admin', deletedAt: null });

// Roles are global account permissions in Orbitask (there are no per-team roles), so a role change applies
// everywhere. It takes effect on the very next request because requireAuth reloads the user from MongoDB each time.
export const changeRole = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'user id');
  const role = req.body?.role;
  if (!ROLES.includes(role)) throw new AppError(422, 'Validation failed', { role: `Role must be one of: ${ROLES.join(', ')}` });
  const target = await User.findOne({ _id: req.params.id, deletedAt: null });
  if (!target) throw new AppError(404, 'User not found');
  if (target.role === role) throw new AppError(409, `${target.name} is already ${role === 'admin' ? 'an Admin' : 'a Member'}`);

  const previous = target.role;
  // Conditional update: only applies if the role is still what we just read (guards against a concurrent change).
  const updated = await User.updateOne({ _id: target._id, role: previous, deletedAt: null }, { $set: { role } });
  if (!updated.modifiedCount) throw new AppError(409, 'This user was just changed by someone else. Refresh and try again.');

  // Last-administrator protection: if that left no admin, undo the change and refuse.
  if (role === 'member' && (await activeAdmins()) === 0) {
    await User.updateOne({ _id: target._id }, { $set: { role: previous } });
    throw new AppError(409, 'You cannot remove the last administrator. Promote another member to Admin first.');
  }

  await AuditLog.create({ actorId: req.user._id, subjectId: target._id, action: 'role.changed', from: previous, to: role });
  await notify({
    recipientId: target._id, actorId: req.user._id, type: 'role.changed', title: 'Your role changed',
    message: `${req.user.name} changed your role from ${previous} to ${role}.`, entityType: 'user', entityId: target._id, link: '/profile',
  });
  res.json({ user: await User.findById(target._id) });
});

export const auditLog = asyncHandler(async (_req, res) => {
  const items = await AuditLog.find().sort({ timestamp: -1 }).limit(50).populate('actorId', 'name').populate('subjectId', 'name');
  res.json({
    entries: items.map((a) => ({ id: String(a._id), action: a.action, from: a.from, to: a.to, timestamp: a.timestamp, actor: a.actorId?.name || 'Deleted user', subject: a.subjectId?.name || 'Deleted user' })),
  });
});
