const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isAllowedOrigin(req, origin, options = {}) {
  if (!origin) return true;
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  const configuredOrigins = String(options.allowedOrigins || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (origin === expectedOrigin || configuredOrigins.includes(origin)) return true;
  if (options.isProduction) return false;
  try { return new URL(origin).hostname === req.hostname; } catch { return false; }
}

function createCsrfProtection(options = {}) {
  return (req, res, next) => {
    if (!req.session?.user || SAFE_METHODS.has(req.method)) return next();
    const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
    if (fetchSite === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site request rejected.', code: 'CSRF_REJECTED' });
    }
    if (!isAllowedOrigin(req, req.get('origin'), options)) {
      return res.status(403).json({ error: 'Request origin is not allowed.', code: 'CSRF_REJECTED' });
    }
    return next();
  };
}

module.exports = { createCsrfProtection, isAllowedOrigin };
