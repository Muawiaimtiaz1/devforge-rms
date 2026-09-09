Analytics migration verification

Run from the repository root:

- npm --prefix frontend run dev (keep the Vite server on port 5173 running)
- npm --prefix frontend run test:analytics
- npm --prefix frontend run test:tip-filter
- node --test tests/tips-date-filter.test.js

Browser checks use installed Microsoft Edge and mocked API responses. They never read or modify business records. Analytics checks compile an independent legacy stylesheet and compare all 11 tab texts and viewport heights at desktop, tablet, and phone sizes. Tablet and phone checks cover both themes. They also exercise filters, print invocation, retry, empty data, and access denial. Screenshots and temporary baseline CSS are written under the ignored root tmp directory.

The React analytics page is /app/analytics. The original /dashboard#analytics renderer remains available. Its backend calculations, fixed percentage indicators, stock labels, and report/print behavior are intentionally preserved for the later analytics fixes.

The Record Tip date filter uses Asia/Karachi calendar dates and defaults to Today. It filters by payment time, falling back to updated time and then creation time, matching the existing selector. Yesterday, Today + Yesterday, All Time, and Custom Range are supported. Search and table filters apply within that range. Collection amounts, shifts, order eligibility, and shop/staff access are unchanged.
