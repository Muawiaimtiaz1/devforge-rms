# Staff Management architecture and rules

- `staff` owns employee identity; `users` owns login accounts.
- `attendance` owns schedules, immutable clock events, append-only daily marks, corrections, and approved payroll snapshots.
- `leave` owns leave policy, balances, requests, and immutable balance history.
- `payroll` consumes an approved attendance snapshot and owns compensation, runs, line items, payslips, reversals, and advance recovery.
- `documents` owns private metadata and audited file access; bytes live only in `STAFF_DOCUMENT_STORAGE_DIR`.
- `staff-activity` reads operational sources in bulk and owns tasks, notes, recognition, disciplinary records, and their history. It does not create an HR performance score.

All tenant-owned reads and writes derive `shop_id` from the authenticated session. New capabilities are mounted below `/api/*` and rendered as separate lazy-loaded panels under `/app/staff`.
