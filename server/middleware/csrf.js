import { AppError } from '../utils/AppError.js';

// Cookie auth + cross-origin means browsers could send forged form posts. A custom header cannot be
// set by a plain cross-site form, and CORS only allows our client origin to send it.
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'orbitask') return next(new AppError(403, 'Missing CSRF header'));
  next();
}
