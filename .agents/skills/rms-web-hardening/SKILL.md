---
name: rms-web-hardening
description: Audit and improve DevForge RMS database queries, application security, sessions and cookies, PWA reliability, and backend or frontend speed. Use for focused diagnosis, review, or implementation in these areas.
---

# RMS Web Hardening

Improve the requested area without changing product behavior, authorization rules, or deployment assumptions unless the user explicitly requests that change.

## Workflow

1. Inspect the relevant runtime code, configuration, schema, migrations, and tests.
2. Establish a measurable bottleneck, failure, or threat before editing. Prefer query plans, timings, request traces, production builds, and reproducible browser checks over intuition.
3. Read only the relevant guide:
   - Database work: [references/database.md](references/database.md)
   - Security, sessions, and cookies: [references/security-sessions.md](references/security-sessions.md)
   - PWA and service workers: [references/pwa.md](references/pwa.md)
   - Backend or frontend speed: [references/performance.md](references/performance.md)
4. Make the smallest coherent change and preserve unrelated work.
5. Run focused regression checks, followed by applicable existing tests, lint, and production build.

## Project invariants

- The backend is Express with Knex and supports both `better-sqlite3` and PostgreSQL. Preserve both dialects unless the task explicitly targets one.
- Tenant-owned access must enforce `shop_id` in the server-side query. Never trust a client-provided shop or user identity when the authenticated session supplies it.
- UI visibility is not authorization. Enforce permissions on HTTP and Socket.IO server paths.
- Never log passwords, secrets, session IDs, cookies, push credentials, or authentication tokens.
- Do not cache authenticated API responses or private tenant data in a shared server cache, public HTTP cache, or service worker.
- Do not add a dependency when the current platform or stack provides a small, maintainable solution. Explain operational impact when a dependency is justified.

## Handoff

Report the risk or bottleneck addressed, changed files, before/after evidence when optimizing, checks performed, and any migration, environment variable, proxy setting, cache invalidation, or rollout requirement. State precisely what remains unverified.
