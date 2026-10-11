import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { validateRegister, validateLogin } from '../validators/authValidators.js';
import { COOKIE_NAME, cookieOptions, signToken } from '../middleware/auth.js';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 10);

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = validateRegister(req.body);
  if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists', { email: 'Email already registered' });
  // Controlled first-admin setup: only when FIRST_USER_ADMIN=true AND no users exist yet.
  const isFirst = env.firstUserAdmin && (await User.countDocuments()) === 0;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash, role: isFirst ? 'admin' : 'member' });
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  res.status(201).json({ user });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = validateLogin(req.body);
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'Invalid email or password');
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  res.json({ user });
});

export const logout = asyncHandler(async (req, res) => {
  // Bumping tokenVersion invalidates every token issued before logout (server-side invalidation).
  if (req.user) await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});
