---
name: rms-architecture
description: Design or review DevForge RMS architecture, module boundaries, migrations, and cross-module dependencies. Use for new RMS capabilities, structural refactors, or deciding where code belongs; do not use for isolated cosmetic edits.
---

# RMS Architecture

Preserve the working system while evolving it into a modular monolith.

## Architectural baseline

- Existing backend code remains in `routes/`, `services/`, `authorization/`, and `db/` unless a requested change genuinely requires touching it.
- New business capabilities belong under `src/modules/<module>/`.
- The legacy frontend remains in `public/`; new and migrated work belongs in `frontend/src/modules/`.
- Both frontends use the same Express APIs, session authentication, authorization system, PostgreSQL database, and deployment.
- Production serves legacy pages from `/`, React from `/app/*`, and APIs from `/api/*`.

## New backend modules

Prefer this internal dependency flow:

```text
route -> controller -> service -> repository -> database
                  \-> schema validation
```

- Routes bind URLs and middleware.
- Controllers translate HTTP input/output.
- Services own business rules, workflows, and transaction boundaries.
- Repositories own queries and persistence mapping.
- Schemas validate untrusted input.
- A module may call another module's public service, never its repository or tables directly.

Keep the structure proportional. Omit a controller or repository when it would be a pass-through with no useful boundary.

## Domain boundaries

- `users` owns login accounts, passwords, roles, and permissions.
- `staff` owns employee identity and employment information; a staff profile may optionally reference a user account.
- `attendance` owns schedules, clock events, breaks, absence, leave, and approved attendance summaries.
- `payroll` owns salary configuration, payroll periods, calculations, adjustments, and payslips.
- Attendance depends on Staff. Payroll depends on Staff and approved Attendance summaries. Staff must not depend on Attendance or Payroll.

## Change policy

Before changing structure, trace callers, routes, permissions, database tables, and production serving. Prefer an additive migration:

1. Add the new boundary alongside legacy code.
2. Reuse existing APIs when their contract is sound.
3. Keep legacy entry points operational until replacement parity is verified.
4. Redirect one entry point at a time.
5. Remove legacy code only after its remaining callers are gone.

Do not introduce microservices, micro-frontends, a second authentication system, or a second source of truth without an explicit architectural decision from the user.

## Required decisions for a new module

State its owner, public API, tables, permissions, tenant scope, transaction boundaries, audit requirements, frontend routes, and dependencies before implementation. Flag ambiguous ownership rather than allowing two modules to update the same records.
