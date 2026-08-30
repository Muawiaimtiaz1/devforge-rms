---
name: rms-verification
description: Verify DevForge RMS changes across legacy and React frontends, Express APIs, permissions, tenant isolation, PWA/mobile behavior, production builds, and Render deployment. Use for migration sign-off, regression checks, or release readiness.
---

# RMS Verification

Choose checks based on risk and report evidence, not confidence language.

## Baseline checks

- Run backend syntax checks for changed CommonJS files.
- Run `npm.cmd test` from the RMS root on Windows.
- Run React lint and production build from `frontend/`.
- Run `git diff --check` and inspect the final changed-file list.

## Frontend migration matrix

Exercise:

- direct URL, login redirect, module-card navigation, Switch Modules, browser Back, refresh, logout, and expired session;
- light and dark mode across React and legacy boundaries;
- desktop, tablet, narrow mobile, and installed-PWA navigation;
- loading skeleton, empty, error, unauthorized, and slow-network states;
- profile dropdown, notification badge, installation, and device-notification controls when touched.

Compare the migrated page with the vanilla implementation. Treat omitted behavior as a defect unless explicitly approved.

## Authorization matrix

Test representative Restaurant Admin, Manager, Cashier, Waiter, Kitchen, Rider, Inventory Staff, Accountant, Receptionist, and superadmin behavior when relevant. Verify both visible modules and direct API/URL denial. Confirm wrong-shop IDs cannot read or mutate records.

## Data and workflow checks

For attendance or payroll, test valid transitions, duplicate submissions, concurrency/idempotency, timezone boundaries, overnight shifts, corrections, approval, finalization, and audit records. Reconcile calculated totals independently for representative cases.

## Production checks

- React assets must build under `/app/` and deep links such as `/app/lobby` and `/app/staff` must return the React entry point.
- Legacy `/`, `/dashboard`, and `/api/*` must retain ownership.
- Manifest, service worker, and icons must return valid assets.
- Render builds React but starts only Express.
- Profile remote-database round trips for query-sensitive endpoints; do not accept request-time migration, seeding, or N+1 behavior.

Do not mutate production data for verification. Use staging or read-only checks unless the user explicitly authorizes a controlled production operation.
