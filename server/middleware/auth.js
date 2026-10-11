import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

export const COOKIE_NAME = 'orbitask_token';

export function cookieOptions() {
  const prod = env.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: prod,
    // Frontend and API are on different origins in production, so SameSite=None is required there.
    // CSRF is mitigated by the strict CORS origin plus the required X-Requested-With header (see csrf.js).
    sameSite: prod ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, env.jwtSecret, { expiresIn: '7d' });
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new AppError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError(401, 'Session expired or invalid');
  }
  const user = await User.findById(payload.sub);
  if (!user || user.deletedAt || (user.tokenVersion || 0) !== payload.v) throw new AppError(401, 'Session expired or invalid');
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) return next(new AppError(403, 'You do not have permission to do that'));
  next();
};
