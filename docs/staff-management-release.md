# Staff Management release and rollback

## Release scope

The Staff workspace is a React modular-monolith feature at `/app/staff`. Express owns `/api/*`, session authentication, authorization, private document delivery, and PostgreSQL transactions. The legacy dashboard remains available.

## Required production configuration

- `DB_CLIENT=postgres` and a Neon/PostgreSQL connection.
- A strong `SESSION_SECRET`.
- `TRUST_PROXY=true` only behind the trusted Render proxy.
- `SESSION_COOKIE_SECURE=true` on HTTPS production.
- `STAFF_DOCUMENT_STORAGE_DIR` must point to a private persistent disk directory outside `public/`. Back up this directory together with the database; document metadata alone cannot restore files.
- Build with `npm --prefix frontend run build`; start only Express with `npm start`.

## Release sequence

1. Back up PostgreSQL and the private staff-document directory.
2. Deploy code while the existing additive schema remains compatible.
3. Run `npm run postgres:schema`. This now applies the base schema and all modular Staff migrations idempotently.
4. Run `node scripts/check-staff-schema.js`, `node scripts/check-staff-activity.js`, and `node scripts/check-staff-release.js`.
5. Build the React production assets and verify `/app/staff`, `/app/lobby`, `/dashboard`, `/api/auth/me`, `/manifest.json`, `/service-worker.js`, and `/offline.html`.
6. Sign out and sign in after permission changes so the current UI immediately reflects the latest role grants.

## Rollback

1. Redeploy the preceding application revision.
2. Do not drop Staff, attendance, leave, payroll, document, or audit tables. All schema changes are additive; retaining them keeps historical records and lets the earlier code ignore unknown tables.
3. Keep private document storage mounted during rollback. Never move it into `public/`.
4. If a payroll run was finalized, reverse it through the payroll workflow; never edit or delete its rows.
5. If attendance or leave data needs correction, use audited corrections/reversals rather than deleting raw history.
6. Restore PostgreSQL and private files from the same backup point only for a full disaster recovery, because mismatched snapshots can orphan document metadata or files.

## PWA update behavior

The worker caches only the public offline shell, icons, manifest, and immutable hashed React assets. It never caches `/api/*` or authenticated HTML. A user who is offline sees a non-sensitive offline page. Worker updates wait for the normal lifecycle to avoid mixing an old page with a newly activated worker.
