import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Invitation } from '../models/Invitation.js';
import { Notification } from '../models/Notification.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { throwIfErrors } from '../utils/validate.js';
import { validatePassword } from '../validators/authValidators.js';
import { COOKIE_NAME, cookieOptions, signToken } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { emailConfigured, sendMail } from '../services/mailer.js';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const RESET_TTL_MS = 30 * 60 * 1000;

// validatePassword writes to errors.password; map it to newPassword for these forms.
function newPasswordErrors(body) {
  const e = {};
  validatePassword(body.newPassword, e);
  const errors = {};
  if (e.password) errors.newPassword = e.password;
  if (!errors.newPassword && body.confirmPassword !== body.newPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword } = req.body || {};
  const errors = newPasswordErrors(req.body || {});
  if (typeof currentPassword !== 'string' || !currentPassword) errors.currentPassword = 'Current password is required';
  throwIfErrors(errors);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new AppError(422, 'Validation failed', { currentPassword: 'Current password is incorrect' });
  if (await bcrypt.compare(req.body.newPassword, user.passwordHash)) throw new AppError(422, 'Validation failed', { newPassword: 'New password must be different from the current one' });
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out every other session
  await user.save();
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions()); // keep THIS session signed in
  res.json({ ok: true });
});

// Always answers the same way, whether or not the email belongs to an account.
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const generic = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(422, 'Validation failed', { email: 'Enter a valid email address' });
  const user = await User.findOne({ email, deletedAt: null });
  if (!user) return res.json(generic);

  const token = crypto.randomBytes(32).toString('hex');
  await PasswordReset.deleteMany({ userId: user._id, usedAt: null }); // only the newest link works
  await PasswordReset.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  if (!emailConfigured()) {
    console.error('Password reset requested but email delivery is not configured (set SMTP_* variables).');
    return res.json(generic);
  }
  const link = `${env.clientUrl.split(',')[0].trim()}/reset-password?token=${token}`;
  try {
    await sendMail({
      to: user.email, subject: 'Reset your Orbitask password',
      text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 30 minutes, one use only):\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err.message); // never log the token or link
  }
  res.json(generic);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  const errors = newPasswordErrors(req.body || {});
  throwIfErrors(errors);
  if (typeof token !== 'string' || token.length < 20) throw new AppError(400, 'This reset link is invalid or has expired. Request a new one.');
  // Atomic: marks the token used and only succeeds once, and only before expiry.
  const record = await PasswordReset.findOneAndUpdate({ tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { returnDocument: 'after' });
  if (!record) throw new AppError(400, 'This reset link is invalid or has expired. Request a new one.');
  const user = await User.findOne({ _id: record.userId, deletedAt: null }).select('+passwordHash');
  if (!user) throw new AppError(400, 'This reset link is invalid or has expired. Request a new one.');
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // every existing session is signed out
  await user.save();
  await PasswordReset.deleteMany({ userId: user._id, usedAt: null });
  res.json({ ok: true });
});

// ---------- account deletion ----------
// Policy: accounts are deactivated and anonymised, not erased, so team history (tasks, activity) stays intact.
async function findBlockers(user) {
  const blockers = [];
  const openTasks = await Task.find({ assignedTo: user._id, status: { $ne: 'completed' } }).populate('projectId', 'name').limit(50);
  if (openTasks.length) {
    blockers.push({
      code: 'open_tasks', message: `You still have ${openTasks.length} open task(s) assigned to you. Complete them, or ask the project owner to reassign them.`,
      items: openTasks.map((t) => ({ id: String(t._id), title: t.title, projectId: String(t.projectId?._id), project: t.projectId?.name, status: t.status })),
    });
  }
  const owned = await Project.find({ owner: user._id }).select('name members status');
  if (owned.length) {
    blockers.push({
      code: 'owned_projects', message: `You own ${owned.length} project(s). Transfer ownership to another Admin, or delete the project, before deleting your account.`,
      items: owned.map((p) => ({ id: String(p._id), name: p.name, memberCount: p.members.length })),
    });
  }
  if (user.role === 'admin' && (await User.countDocuments({ role: 'admin', deletedAt: null, _id: { $ne: user._id } })) === 0) {
    blockers.push({ code: 'last_admin', message: 'You are the only Admin. Promote another member to Admin before deleting your account.', items: [] });
  }
  return blockers;
}

export const deletionCheck = asyncHandler(async (req, res) => {
  const blockers = await findBlockers(req.user);
  res.json({ canDelete: blockers.length === 0, role: req.user.role, blockers });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  const { password, confirm } = req.body || {};
  if (confirm !== 'DELETE') throw new AppError(422, 'Validation failed', { confirm: 'Type DELETE to confirm' });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError(422, 'Validation failed', { password: 'Password is incorrect' });

  // 1) Atomically deactivate FIRST. From this moment nobody can assign this user new work or invite them,
  //    so a task assigned "just after" an earlier check cannot slip through.
  const marked = await User.updateOne({ _id: user._id, deletedAt: null }, { $set: { deletedAt: new Date() } });
  if (!marked.modifiedCount) throw new AppError(409, 'This account has already been deleted');

  // 2) Re-run every check now that new assignments are impossible. If anything blocks, roll the mark back.
  const blockers = await findBlockers({ ...user.toObject(), _id: user._id, role: user.role });
  if (blockers.length) {
    await User.updateOne({ _id: user._id }, { $set: { deletedAt: null } });
    throw new AppError(409, 'Your account cannot be deleted yet', { blockers });
  }

  // 3) Anonymise and clean up personal links. Shared work (completed tasks, activity) is kept.
  await User.updateOne({ _id: user._id }, { $set: { name: 'Deleted user', email: `deleted-${user._id}@deleted.invalid`, passwordHash: crypto.randomBytes(32).toString('hex') }, $inc: { tokenVersion: 1 } });
  await Project.updateMany({ members: user._id }, { $pull: { members: user._id } });
  await Invitation.updateMany({ userId: user._id, status: 'pending' }, { $set: { status: 'cancelled', resolvedAt: new Date() }, $unset: { pendingKey: 1 } });
  await Notification.deleteMany({ recipientId: user._id });
  await PasswordReset.deleteMany({ userId: user._id });
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
  res.json({ ok: true });
});
