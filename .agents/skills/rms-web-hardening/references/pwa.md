# PWA Reliability

Inspect `public/manifest.json`, service-worker registration, `public/service-worker.js`, icons, scopes, MIME types, HTTPS behavior, deployment paths, and push subscription lifecycle.

- Use cache-first only for immutable hashed assets. Choose network-first or stale-while-revalidate deliberately for safe read-only resources. Use network-only for authentication, writes, payments, and sensitive personalized responses unless a designed offline workflow requires otherwise.
- Version named caches, remove obsolete caches during activation, accept only successful expected-origin responses, and bound cache growth.
- Never cache session responses, private APIs, secrets, mutation responses, or opaque failures accidentally.
- Treat `skipWaiting()` and `clients.claim()` as release decisions because immediate activation can mix an old page with a new worker. Coordinate reloads when compatibility matters.
- Never imply an order or payment succeeded offline before server confirmation.
- Keep manifest `id`, `start_url`, and `scope` consistent. Verify icon files, sizes, purposes, and content types.
- Request notification permission after an explanatory user action. Handle denied, expired, rotated, and duplicate push subscriptions.
- Validate push payloads and restrict notification navigation to safe same-origin locations.

Verify a production build over HTTPS: first and repeat loads, offline launch, update activation, old-cache cleanup, logout followed by offline access, installation, notification navigation, and failed-network recovery.
