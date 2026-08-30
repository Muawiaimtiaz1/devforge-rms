---
name: rms-backend-modules
description: Implement new DevForge RMS backend capabilities as modular-monolith modules with Express, Knex, Zod, sessions, permissions, and transactions. Use for new APIs or business workflows; preserve legacy routes unless migration is requested.
---

# RMS Backend Modules

Build new capabilities under `src/modules/<module>/` while keeping existing `routes/` and `services/` stable.

## Module shape

Use the smallest useful subset of:

```text
<module>.routes.js
<module>.controller.js
<module>.service.js
<module>.repository.js
<module>.schema.js
<module>.permissions.js
```

Mount the module explicitly in `server.js`. Keep `/api/auth/*` and existing session behavior unchanged.

## Invariants

- Enforce authentication and authorization on the backend; hidden React buttons are not security.
- Add permission keys to the central catalog and API-policy mapping when applicable.
- Scope every tenant-owned read and write by `shop_id` derived from the authenticated session, not client input.
- Validate IDs, enums, dates, money, and payload shape before business logic.
- Use database transactions for workflows that modify multiple records or modules.
- Return the existing JSON error format and meaningful HTTP status codes.
- Avoid request-time schema creation, seeding, or data migration. Deployment/startup initialization must be idempotent and bulk-oriented.
- Avoid N+1 queries. Load related roles, permissions, attendance, or payroll items in bulk.
- Preserve SQLite development compatibility only where the existing project still relies on it; PostgreSQL production correctness is mandatory.

## Cross-module access

Expose intentional service methods or read models. Never import another module's repository or issue writes directly against its tables. Use immutable IDs and explicit transaction ownership.

## API changes

Prefer additive, backward-compatible endpoints. When replacing a legacy endpoint, document consumers and keep the old contract until both frontends have migrated.

## Verification

Run syntax checks, relevant tests, and database-backed timing checks for query-sensitive work. Exercise unauthorized, forbidden, wrong-shop, invalid-input, success, and conflict paths.
