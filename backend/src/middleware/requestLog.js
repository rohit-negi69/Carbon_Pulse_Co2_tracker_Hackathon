// Compact request logger: method, path, status, duration.

export function requestLog(req, res, next) {
  if (req.path === '/api/stream') return next(); // long-lived; not useful to log per event
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
}
