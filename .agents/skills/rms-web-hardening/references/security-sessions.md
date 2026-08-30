# Security, Sessions, and Cookies

## Security boundary

Map authentication, allowed roles or permissions, tenant ownership, input sources, sensitive output, and state changes. Check HTTP and Socket.IO independently.

- Validate body, params, and query data at the boundary with explicit schemas and size limits.
- Parameterize database values and allowlist dynamic columns, sort directions, filenames, MIME types, redirects, and outbound URLs.
- Enforce object-level authorization in the service or query that accesses the object.
- For uploads, enforce byte limits, inspect content rather than trusting the extension, generate server-side names, and keep executable content outside public paths.
- Return non-sensitive errors and redact secrets and personal data from diagnostics.
- Review CSP, framing, MIME sniffing, referrer policy, transport security, CORS, rate limits, and proxy trust against the real deployment. Never enable `trust proxy` blindly.
- Never expose secrets through client bundles, source defaults, manifests, service-worker caches, or logs.

## Sessions

- Require a strong environment-provided session secret in production.
- Regenerate the session ID after login and privilege changes. Destroy the server-side session on logout, then clear the cookie with matching attributes.
- Store only required identity and authorization context. Define refresh or invalidation when permissions change.
- Ensure the Knex session store has indexed lookup and expiry, cleanup of expired rows, bounded failure behavior, and compatibility with horizontal scaling.
- Protect state-changing requests against CSRF based on the deployment and cookie model.

## Cookies

- Authentication cookies should normally use `HttpOnly`, HTTPS-only `Secure`, an intentional `SameSite` value, narrow `Path`, and deliberate expiry.
- Base `Secure` behavior on verified HTTPS/proxy configuration so local HTTP works without weakening production.
- Never put authentication tokens or sensitive user data in JavaScript-readable cookies or browser storage.
- Keep preference cookies separate. Encode values safely and avoid broad `Domain` scope unless required.
- Cross-site credentials require `SameSite=None; Secure`, explicit CORS origins, correct credential handling, and CSRF protection.

## Verify

Test unauthenticated and insufficient-role access, cross-tenant IDs, session fixation, logout invalidation, expiry, malformed input, cookie attributes under production-like HTTPS, and CSRF-sensitive operations. Do not print live credentials in tests.
