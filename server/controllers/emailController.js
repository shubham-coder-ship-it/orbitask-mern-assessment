import { EmailRecord } from '../models/EmailRecord.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { isValidId, throwIfErrors } from '../utils/validate.js';
import { emailConfigured, sendMail } from '../services/mailer.js';
import { emailScope, teamRecipients } from '../services/emailPermissions.js';
import { notify } from '../services/notificationService.js';
import { sameId } from '../services/access.js';

const MAX_RECIPIENTS = 50;

// Names and roles only — email addresses are never sent to the browser.
export const recipients = asyncHandler(async (req, res) => {
  const scope = await emailScope(req.user);
  res.json({
    emailConfigured: emailConfigured(),
    memberToMemberEnabled: scope.memberToMember,
    canEmailWorkspace: scope.isAdmin,
    users: [...scope.allowed.values()].sort((a, b) => a.name.localeCompare(b.name)).map((u) => ({ id: String(u._id), name: u.name, role: u.role })),
    teams: scope.teamsAllowed.map((p) => ({ id: String(p._id), name: p.name, size: teamRecipients(p, req.user, scope.byId).length })),
    note: scope.isAdmin ? null : scope.memberToMember ? null : 'You can email admins and the owners of your projects. An admin can allow members to email each other in Email settings.',
  });
});

export const history = asyncHandler(async (req, res) => {
  const items = await EmailRecord.find({ senderId: req.user._id }).sort({ createdAt: -1 }).limit(30).populate('recipientIds', 'name');
  res.json({
    emails: items.map((e) => ({
      id: String(e._id), subject: e.subject, body: e.body, status: e.status, audience: e.audience, error: e.error, createdAt: e.createdAt,
      recipients: e.recipientIds.map((u) => u.name), sent: e.results.filter((r) => r.ok).length, failed: e.results.filter((r) => !r.ok).length,
    })),
  });
});

export const sendEmail = asyncHandler(async (req, res) => {
  const { audience = 'users', to = [], projectId } = req.body || {};
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.replace(/[\r\n]+/g, ' ').trim() : '';
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const errors = {};
  if (!subject || subject.length > 150) errors.subject = 'Subject is required (max 150 characters)';
  if (!body || body.length > 5000) errors.body = 'Message is required (max 5000 characters)';
  if (!['users', 'project', 'workspace'].includes(audience)) errors.audience = 'Invalid audience';
  throwIfErrors(errors);

  const scope = await emailScope(req.user);
  let ids = [];
  let project = null;
  if (audience === 'workspace') {
    if (!scope.isAdmin) throw new AppError(403, 'Only admins can email the whole workspace');
    ids = [...scope.byId.keys()];
  } else if (audience === 'project') {
    if (!isValidId(projectId)) throw new AppError(422, 'Validation failed', { projectId: 'Choose a team' });
    project = scope.teamsAllowed.find((p) => String(p._id) === String(projectId));
    if (!project) throw new AppError(403, scope.isAdmin || scope.memberToMember ? 'You can only email teams you belong to' : 'Members cannot email whole teams unless an admin allows member-to-member email');
    ids = teamRecipients(project, req.user, scope.byId);
  } else {
    if (!Array.isArray(to) || to.length === 0) throw new AppError(422, 'Validation failed', { to: 'Choose at least one recipient' });
    if (to.length > MAX_RECIPIENTS) throw new AppError(422, 'Validation failed', { to: `You can choose at most ${MAX_RECIPIENTS} recipients` });
    if (!to.every(isValidId)) throw new AppError(422, 'Validation failed', { to: 'Invalid recipient' });
    ids = [...new Set(to.map(String))];
    // Every recipient is verified on the server; the browser's list is never trusted.
    if (ids.some((id) => !scope.allowed.has(id) || sameId(id, req.user._id))) {
      throw new AppError(403, scope.isAdmin || scope.memberToMember ? 'You are not allowed to email one or more of the selected recipients' : 'Members can only email admins and project owners unless an admin allows member-to-member email');
    }
  }
  if (ids.length === 0) throw new AppError(422, 'Validation failed', { to: 'There is nobody to send this message to' });
  if (ids.length > 200) throw new AppError(422, 'Validation failed', { to: 'Too many recipients' });

  // Duplicate-send guard (double click / retry): same sender, subject, body within 30 seconds.
  const dup = await EmailRecord.findOne({ senderId: req.user._id, subject, body, status: { $ne: 'failed' }, createdAt: { $gt: new Date(Date.now() - 30000) } });
  if (dup) throw new AppError(409, 'This exact message was just sent. Wait a moment before sending it again.');

  const record = await EmailRecord.create({ senderId: req.user._id, recipientIds: ids, audience, projectId: project?._id || null, subject, body });
  if (!emailConfigured()) {
    record.status = 'failed';
    record.error = 'Email delivery is not configured on the server';
    await record.save();
    throw new AppError(503, 'Email delivery is not configured on the server, so nothing was sent. Ask the administrator to set the SMTP variables.');
  }

  const users = await User.find({ _id: { $in: ids }, deletedAt: null }).select('name email');
  const text = `${body}\n\n—\nSent by ${req.user.name} via Orbitask. Reply to respond to ${req.user.name} directly.`;
  const results = [];
  for (const u of users) {
    try {
      const r = await sendMail({ to: u.email, subject, text, replyTo: req.user.email });
      results.push({ userId: u._id, ok: true, providerMessageId: r.providerMessageId });
    } catch (err) {
      results.push({ userId: u._id, ok: false, error: String(err.message).slice(0, 200) });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  record.results = results;
  record.status = ok === results.length && ok > 0 ? 'accepted' : ok > 0 ? 'partial' : 'failed';
  if (record.status === 'failed') record.error = 'The mail server rejected every message';
  await record.save();

  if (ok > 0) {
    await Promise.all(results.filter((r) => r.ok).map((r) => notify({ recipientId: r.userId, actorId: req.user._id, type: 'email.received', title: `New email from ${req.user.name}`, message: subject.slice(0, 120), entityType: 'email', entityId: record._id, link: null, dedupeKey: `email:${record._id}:${r.userId}` })));
  }
  const status = record.status === 'failed' ? 502 : 200;
  res.status(status).json({ email: { id: String(record._id), status: record.status, sent: ok, failed: results.length - ok }, message: record.status === 'accepted' ? 'The mail server accepted your message for delivery.' : record.status === 'partial' ? 'Some messages were accepted and some failed.' : 'Sending failed. Nothing was delivered.' });
});
