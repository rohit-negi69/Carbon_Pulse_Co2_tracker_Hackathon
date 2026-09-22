// Centralised error handling so routes only ever call next(err).

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}`, hint: 'GET /api/docs lists every endpoint' });
}

export function errorHandler(err, _req, res, _next) {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}
