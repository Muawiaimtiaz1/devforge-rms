const test = require('node:test');
const assert = require('node:assert/strict');
const { createCsrfProtection, isAllowedOrigin } = require('../src/modules/session-security/csrf');

function request(overrides = {}) {
  const headers = overrides.headers || {};
  return {
    method: 'POST', protocol: 'https', hostname: 'rms.example.com',
    session: { user: { id: 1 } },
    get(name) { return name === 'host' ? 'rms.example.com' : headers[name]; },
    ...overrides,
  };
}

test('production CSRF validation permits same and configured origins only', () => {
  const req = request();
  assert.equal(isAllowedOrigin(req, 'https://rms.example.com', { isProduction: true }), true);
  assert.equal(isAllowedOrigin(req, 'https://admin.example.com', { isProduction: true, allowedOrigins: 'https://admin.example.com' }), true);
  assert.equal(isAllowedOrigin(req, 'https://evil.example', { isProduction: true }), false);
});

test('CSRF middleware rejects authenticated cross-site mutations', () => {
  const req = request({ headers: { 'sec-fetch-site': 'cross-site' } });
  let response;
  const res = { status(code) { response = { code }; return this; }, json(body) { response.body = body; return this; } };
  createCsrfProtection({ isProduction: true })(req, res, () => assert.fail('next must not run'));
  assert.deepEqual(response, { code: 403, body: { error: 'Cross-site request rejected.', code: 'CSRF_REJECTED' } });
});

test('CSRF middleware allows safe methods and unauthenticated requests', () => {
  let calls = 0;
  const middleware = createCsrfProtection({ isProduction: true });
  middleware(request({ method: 'GET' }), {}, () => { calls += 1; });
  middleware(request({ session: null }), {}, () => { calls += 1; });
  assert.equal(calls, 2);
});
