import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as projects from '../controllers/projectController.js';
import * as tasks from '../controllers/taskController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as activity from '../controllers/activityController.js';
import * as notifications from '../controllers/notificationController.js';
import * as invitations from '../controllers/invitationController.js';
import * as roles from '../controllers/roleController.js';
import * as account from '../controllers/accountController.js';
import * as settings from '../controllers/settingsController.js';
import * as email from '../controllers/emailController.js';

const router = Router();

router.get('/health', (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({ status: dbConnected ? 'ok' : 'degraded', database: dbConnected ? 'connected' : 'disconnected', uptime: Math.round(process.uptime()) });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: { message: 'Too many attempts, please try again later' } },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: { message: 'Too many reset requests, please try again later' } },
});
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  validate: { keyGeneratorIpFallback: false },
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: { message: 'You have sent too many emails this hour. Please try again later.' } },
});

router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/forgot-password', resetLimiter, account.forgotPassword);
router.post('/auth/reset-password', authLimiter, account.resetPassword);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/logout', requireAuth, auth.logout);
router.get('/auth/me', requireAuth, auth.me);

router.use(requireAuth);

router.post('/auth/change-password', account.changePassword);
router.get('/account/deletion-check', account.deletionCheck);
router.delete('/account', account.deleteAccount);

router.get('/notifications', notifications.listNotifications);
router.get('/notifications/unread-count', notifications.unreadCount);
router.post('/notifications/read-all', notifications.markAllRead);
router.patch('/notifications/:id/read', notifications.markRead);

router.get('/invitations', invitations.listInvitations);
router.get('/invitations/discover', invitations.discoverProjects);
router.post('/invitations', requireRole('admin'), invitations.createInvite);
router.post('/invitations/request', invitations.createRequest);
router.patch('/invitations/:id', invitations.resolveInvitation);

router.get('/users/search', requireRole('admin'), users.searchUsers);
router.patch('/users/:id/role', requireRole('admin'), roles.changeRole);
router.get('/admin/audit', requireRole('admin'), roles.auditLog);

router.get('/workspace/settings', settings.getWorkspaceSettings);
router.patch('/workspace/settings', requireRole('admin'), settings.updateWorkspaceSettings);

router.get('/email/recipients', email.recipients);
router.get('/email/history', email.history);
router.post('/email/send', emailLimiter, email.sendEmail);

router.get('/users', users.listUsers);
router.patch('/users/me', users.updateMe);
router.get('/users/:id', users.getUser);

router.get('/projects', projects.listProjects);
router.post('/projects', requireRole('admin'), projects.createProject);
router.get('/projects/:id', projects.getProject);
router.patch('/projects/:id', projects.updateProject);
router.delete('/projects/:id', projects.deleteProject);
router.post('/projects/:id/members', projects.addMember);
router.post('/projects/:id/transfer', projects.transferOwnership);
router.delete('/projects/:id/members/:userId', projects.removeMember);

router.get('/tasks', tasks.listTasks);
router.post('/tasks', tasks.createTask);
router.get('/tasks/:id', tasks.getTask);
router.patch('/tasks/:id', tasks.updateTask);
router.delete('/tasks/:id', tasks.deleteTask);

router.get('/dashboard/stats', dashboard.stats);
router.get('/dashboard/deadlines', dashboard.deadlines);
router.get('/analytics', dashboard.analytics);
router.get('/activity', activity.listActivity);

export default router;
