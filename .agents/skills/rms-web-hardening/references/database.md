# Database Queries

## Diagnose

- Trace a representative request to every query and count round trips. Look for N+1 access, unbounded reads, unnecessary columns, client-side filtering, repeated aggregates, and long transactions.
- Verify tables and indexes in `db/schema.sql`, `db/postgres-schema.sql`, and relevant migrations rather than inferring them from code.
- Use `EXPLAIN QUERY PLAN` for SQLite. Use `EXPLAIN (ANALYZE, BUFFERS)` for safe PostgreSQL reads; do not execute mutating statements through `EXPLAIN ANALYZE` against live data.

## Improve

- Prefer bounded, set-based queries and select only needed columns.
- Include `shop_id` in reads, writes, deletes, joins, uniqueness rules, and cache keys for tenant-owned data.
- Parameterize values. Choose dynamic identifiers, filters, and sort expressions from fixed allowlists.
- Put equality columns before range or ordering columns when designing composite indexes. Avoid redundant indexes and account for write cost.
- Use deterministic ordering for pagination. Prefer keyset pagination for large or changing datasets when its API tradeoff is acceptable.
- Use short transactions for multi-step invariants and pass the transaction object through every participating query.
- Check SQLite/PostgreSQL differences in booleans, dates, case-insensitive matching, JSON, `RETURNING`, conflict handling, placeholders, and locking.
- Add schema changes through the repository migration path, not only startup-time initialization.

## Verify

Compare plans, query counts, rows examined or returned, and timings using representative data and the same workload. Test tenant isolation, empty results, boundary pages, rollback, and concurrent writes where relevant.
