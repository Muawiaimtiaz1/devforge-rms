const crypto = require('crypto');

function signingSecret() {
  return String(process.env.PRINT_AGENT_SECRET || process.env.SESSION_SECRET || 'development-print-agent-secret');
}

function issueRealtimePrintToken(shopId, printers, options = {}) {
  const expiresAt = Number(options.expiresAt || Date.now() + (180 * 24 * 60 * 60 * 1000));
  const body = Buffer.from(JSON.stringify({ shopId: Number(shopId), printers: [...new Set(printers.map(String))], version: 1, expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyRealtimePrintToken(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', signingSecret()).update(body).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch (_) { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const shopId = Number(value.shopId);
    if (!Number.isInteger(shopId) || shopId <= 0 || !Array.isArray(value.printers) || !value.printers.length) return null;
    if (!Number.isFinite(Number(value.expiresAt)) || Number(value.expiresAt) <= Date.now()) return null;
    return { shopId, printers: [...new Set(value.printers.map(String).filter(Boolean))], expiresAt: Number(value.expiresAt) };
  } catch (_) { return null; }
}

module.exports = { issueRealtimePrintToken, verifyRealtimePrintToken };
