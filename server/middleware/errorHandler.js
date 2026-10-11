export function notFound(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: { message: 'Request body too large' } });
  if (err.code === 11000) return res.status(409).json({ error: { message: 'Duplicate value', details: err.keyValue ? { field: Object.keys(err.keyValue)[0] } : undefined } });
  if (err.name === 'ValidationError') {
    const details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return res.status(422).json({ error: { message: 'Validation failed', details } });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal server error' : err.message, details: err.details } });
}
