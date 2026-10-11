import { Notification } from '../models/Notification.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { requireId } from '../utils/validate.js';

// Every query is filtered by recipientId = the authenticated user, so nobody can read or change another user's notifications.
export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
  const filter = { recipientId: req.user._id };
  if (req.query.unread === 'true') filter.isRead = false;
  if (req.query.before) {
    const d = new Date(req.query.before);
    if (Number.isNaN(d.getTime())) throw new AppError(400, 'Invalid "before" cursor');
    filter.createdAt = { $lt: d };
  }
  const items = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).populate('actorId', 'name');
  const hasMore = items.length > limit;
  const page = items.slice(0, limit).map((n) => {
    const o = n.toJSON();
    return { ...o, actor: n.actorId ? { id: String(n.actorId._id), name: n.actorId.name } : null, actorId: n.actorId ? String(n.actorId._id) : null };
  });
  res.json({ notifications: page, hasMore, nextCursor: hasMore ? page[page.length - 1].createdAt : null });
});

export const unreadCount = asyncHandler(async (req, res) => {
  res.json({ count: await Notification.countDocuments({ recipientId: req.user._id, isRead: false }) });
});

export const markRead = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'notification id');
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, recipientId: req.user._id }, { $set: { isRead: true, readAt: new Date() } }, { returnDocument: 'after' });
  if (!n) throw new AppError(404, 'Notification not found');
  res.json({ notification: n });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const r = await Notification.updateMany({ recipientId: req.user._id, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
  res.json({ updated: r.modifiedCount ?? r.nModified ?? 0 });
});
