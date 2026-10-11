import { Invitation } from '../models/Invitation.js';
import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { requireId } from '../utils/validate.js';
import { isOwner, loadProject, sameId } from '../services/access.js';
import { logActivity } from '../services/activityService.js';
import { notify } from '../services/notificationService.js';

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const pendingKey = (projectId, userId) => `${projectId}:${userId}`;
const populate = [
  { path: 'projectId', select: 'name owner status' },
  { path: 'userId', select: 'name email' },
  { path: 'invitedBy', select: 'name' },
];

function present(inv) {
  const o = inv.toJSON();
  const p = o.projectId;
  return {
    ...o,
    projectId: String(p?._id ?? p?.id ?? p),
    project: p && typeof p === 'object' ? { id: String(p._id ?? p.id), name: p.name, ownerId: String(p.owner) } : null,
    user: o.userId && typeof o.userId === 'object' ? { id: String(o.userId._id ?? o.userId.id), name: o.userId.name, email: o.userId.email } : null,
    userId: String(o.userId?._id ?? o.userId?.id ?? o.userId),
    invitedBy: o.invitedBy && typeof o.invitedBy === 'object' ? { id: String(o.invitedBy._id ?? o.invitedBy.id), name: o.invitedBy.name } : null,
  };
}

// Marks stale pending invites as expired so they can never be accepted.
async function expireStale() {
  const stale = await Invitation.find({ type: 'invite', status: 'pending', expiresAt: { $lt: new Date() } });
  for (const inv of stale) {
    await Invitation.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'expired', resolvedAt: new Date() }, $unset: { pendingKey: 1 } });
  }
}

// Atomic pending -> next transition: only ONE of two racing requests can win.
async function transition(id, extraFilter, status, resolvedBy) {
  return Invitation.findOneAndUpdate(
    { _id: id, status: 'pending', ...extraFilter },
    { $set: { status, resolvedAt: new Date(), resolvedBy }, $unset: { pendingKey: 1 } },
    { returnDocument: 'after' }
  );
}

async function createPending(data) {
  try {
    return await Invitation.create({ ...data, pendingKey: pendingKey(data.projectId, data.userId) });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'A pending invitation or request already exists for this person and project');
    throw err;
  }
}

export const listInvitations = asyncHandler(async (req, res) => {
  await expireStale();
  const me = req.user._id;
  const owned = await Project.find({ owner: me }).select('_id');
  const ownedIds = owned.map((p) => p._id);
  const [received, mine, toReview, sent] = await Promise.all([
    Invitation.find({ type: 'invite', userId: me, status: 'pending' }).sort({ createdAt: -1 }).populate(populate),
    Invitation.find({ type: 'request', userId: me }).sort({ createdAt: -1 }).limit(20).populate(populate),
    Invitation.find({ type: 'request', projectId: { $in: ownedIds }, status: 'pending' }).sort({ createdAt: -1 }).populate(populate),
    Invitation.find({ type: 'invite', projectId: { $in: ownedIds }, status: 'pending' }).sort({ createdAt: -1 }).populate(populate),
  ]);
  res.json({ received: received.map(present), myRequests: mine.map(present), toReview: toReview.map(present), sent: sent.map(present) });
});

// Projects a user could ask to join. Only minimal, non-sensitive fields are returned.
export const discoverProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find({ status: 'active', owner: { $ne: req.user._id }, members: { $ne: req.user._id } }).populate('owner', 'name').sort({ name: 1 }).limit(100);
  const pending = await Invitation.find({ userId: req.user._id, status: 'pending' }).select('projectId type');
  const pendingIds = new Set(pending.map((p) => String(p.projectId)));
  res.json({ projects: projects.map((p) => ({ id: String(p._id), name: p.name, description: (p.description || '').slice(0, 140), owner: p.owner?.name, memberCount: p.members.length, hasPending: pendingIds.has(String(p._id)) })) });
});

export const createInvite = asyncHandler(async (req, res) => {
  const { projectId, userId } = req.body || {};
  requireId(projectId, 'project id');
  requireId(userId, 'user id');
  const project = await loadProject(projectId, req.user);
  if (!isOwner(project, req.user)) throw new AppError(403, 'Only the project owner can invite members');
  if (['archived', 'completed'].includes(project.status)) throw new AppError(409, 'Cannot invite people to an archived or completed project');
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new AppError(404, 'User not found');
  if (project.members.some((m) => sameId(m, user._id))) throw new AppError(409, 'User is already a member');
  const inv = await createPending({ projectId, userId, invitedBy: req.user._id, type: 'invite', expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  await notify({
    recipientId: user._id, actorId: req.user._id, type: 'invitation.received', title: 'Project invitation',
    message: `${req.user.name} invited you to join “${project.name}”.`, entityType: 'invitation', entityId: inv._id, link: '/requests', dedupeKey: `invite:${inv._id}:created`,
  });
  await logActivity({ actorId: req.user._id, projectId: project._id, action: 'member.invited', metadata: { name: project.name, member: user.name } });
  await inv.populate(populate);
  res.status(201).json({ invitation: present(inv) });
});

export const createRequest = asyncHandler(async (req, res) => {
  const { projectId } = req.body || {};
  requireId(projectId, 'project id');
  const project = await Project.findById(projectId);
  if (!project || project.status !== 'active') throw new AppError(404, 'Project not found');
  if (isOwner(project, req.user) || project.members.some((m) => sameId(m, req.user._id))) throw new AppError(409, 'You are already a member of this project');
  const inv = await createPending({ projectId, userId: req.user._id, type: 'request' });
  await notify({
    recipientId: project.owner, actorId: req.user._id, type: 'request.received', title: 'Request to join your project',
    message: `${req.user.name} asked to join “${project.name}”.`, entityType: 'invitation', entityId: inv._id, link: '/requests', dedupeKey: `request:${inv._id}:created`,
  });
  await inv.populate(populate);
  res.status(201).json({ invitation: present(inv) });
});

export const resolveInvitation = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'invitation id');
  await expireStale();
  const action = req.body?.action;
  const allowed = ['accept', 'decline', 'cancel', 'approve', 'reject'];
  if (!allowed.includes(action)) throw new AppError(422, 'Validation failed', { action: `Action must be one of: ${allowed.join(', ')}` });
  const inv = await Invitation.findById(req.params.id);
  if (!inv) throw new AppError(404, 'Invitation not found');
  const project = await Project.findById(inv.projectId);
  const me = req.user._id;
  const isInvitee = sameId(inv.userId, me);
  const owner = project && isOwner(project, req.user);

  // Who may do what. Anyone else gets 404 so existence isn't leaked.
  const rules = {
    accept: inv.type === 'invite' && isInvitee,
    decline: inv.type === 'invite' && isInvitee,
    cancel: (inv.type === 'invite' && owner) || (inv.type === 'request' && isInvitee),
    approve: inv.type === 'request' && owner,
    reject: inv.type === 'request' && owner,
  };
  if (!rules[action]) {
    const involved = isInvitee || owner;
    throw new AppError(involved ? 403 : 404, involved ? 'You are not allowed to do that with this invitation' : 'Invitation not found');
  }
  if (inv.status !== 'pending') throw new AppError(409, `This ${inv.type} is already ${inv.status}`);
  if (!project) {
    await transition(inv._id, {}, 'cancelled', me);
    throw new AppError(409, 'The project no longer exists');
  }
  if (inv.type === 'invite' && inv.expiresAt && inv.expiresAt < new Date()) {
    await transition(inv._id, {}, 'expired', me);
    throw new AppError(409, 'This invitation has expired');
  }

  const nextStatus = { accept: 'accepted', decline: 'declined', cancel: 'cancelled', approve: 'approved', reject: 'rejected' }[action];
  const updated = await transition(inv._id, {}, nextStatus, me);
  if (!updated) throw new AppError(409, 'This request was just changed by someone else. Refresh and try again.');

  if (action === 'accept' || action === 'approve') {
    // $addToSet is atomic and idempotent: the member can never be added twice.
    await Project.updateOne({ _id: project._id }, { $addToSet: { members: inv.userId } });
    await logActivity({ actorId: me, projectId: project._id, action: 'member.added', metadata: { name: project.name, member: (await User.findById(inv.userId))?.name } });
  }

  const link = `/projects/${project._id}`;
  const base = { actorId: me, entityType: 'invitation', entityId: inv._id };
  if (action === 'accept') await notify({ ...base, recipientId: inv.invitedBy || project.owner, type: 'invitation.accepted', title: 'Invitation accepted', message: `${req.user.name} joined “${project.name}”.`, link, dedupeKey: `invite:${inv._id}:accepted` });
  if (action === 'decline') await notify({ ...base, recipientId: inv.invitedBy || project.owner, type: 'invitation.declined', title: 'Invitation declined', message: `${req.user.name} declined to join “${project.name}”.`, link: '/requests', dedupeKey: `invite:${inv._id}:declined` });
  if (action === 'approve') await notify({ ...base, recipientId: inv.userId, type: 'request.approved', title: 'Join request approved', message: `You can now access “${project.name}”.`, link, dedupeKey: `request:${inv._id}:approved` });
  if (action === 'reject') await notify({ ...base, recipientId: inv.userId, type: 'request.rejected', title: 'Join request declined', message: `Your request to join “${project.name}” was not approved.`, link: '/requests', dedupeKey: `request:${inv._id}:rejected` });
  if (action === 'cancel' && inv.type === 'invite') await notify({ ...base, recipientId: inv.userId, type: 'invitation.cancelled', title: 'Invitation cancelled', message: `The invitation to “${project.name}” was withdrawn.`, link: '/requests', dedupeKey: `invite:${inv._id}:cancelled` });

  await updated.populate(populate);
  res.json({ invitation: present(updated) });
});
