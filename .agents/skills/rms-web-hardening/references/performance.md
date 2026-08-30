# Performance

## Measure

Match evidence to the complaint: response latency and query count for APIs; startup, event-loop delay, memory, and throughput for Node; Core Web Vitals, route transitions, bundle size, and long tasks for the browser. Record build mode, data size, device, network, and workload.

## Backend

- Fix dominant query, network, and serialization costs before JavaScript micro-optimizations.
- Avoid synchronous CPU-heavy or filesystem work on request paths. Bound concurrency and payload sizes.
- Cache only with an explicit key, `shop_id` boundary, invalidation rule, maximum age, and memory bound.
- Configure compression and HTTP/static caching by content type and deployment topology. Do not recompress compressed assets or publicly cache private responses.
- Inspect Socket.IO fan-out, room scope, duplicate emissions, and listener cleanup.

## Frontend

- Analyze the production Vite build. Split separate routes or heavy optional features, but avoid fragmentation that does not reduce critical work.
- Lazy-load large optional libraries and media. Serve appropriately sized images and reserve layout dimensions.
- Remove duplicate fetches, unnecessary render cascades, oversized DOM lists, and repeated expensive calculations. Memoize only when profiling shows value.
- Cache hashed assets immutably; keep HTML and manifests short-lived or revalidated so releases update safely.
- Verify that HTTP and service-worker caches cannot indefinitely pin an old release.

## Verify

Repeat the same before/after scenario and report a median or useful distribution, not a single best run. Confirm correctness with realistic data, run the production build, inspect chunks, and verify user-visible results on representative hardware and network conditions.
