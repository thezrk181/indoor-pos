# Release verification — 2026-11-11

Status: production build verified; live acceptance remains incomplete.

Passed in this run:
- Seven domain tests.
- PGlite migration, authorization/RLS, overlap/block/adjacency, rescheduling, retry idempotency, stale edits, payments/refunds, ledger immutability, overnight pricing, and outside-hours conflict tests.
- Production webpack build including TypeScript checks.
- Production dependency audit: zero reported vulnerabilities.
- Live Supabase auth settings: signup disabled, email auth enabled.
- Anonymous Supabase reservations, payments and snapshot requests denied (401).
- Local production API denies anonymous access (401) and foreign-origin POST (400).
- Login, manifest, offline page, service worker and icons served successfully.
- API/receipt responses use private/no-store; service worker uses no-cache/no-store.
- Fixed signed-out receipt rendering to redirect to login rather than throwing a generic error. Rebuilt successfully and verified both home and receipt login redirect boundaries in the production response.

Not established by these results:
- Unlisted-user denial on live Supabase (embedded suite passed).
- Additional booking-versus-block and rescheduling race scenarios (booking/payment contention passed).
- Physical-device Realtime behavior (independent network clients passed).
- Password-reset link and password-change completion (email delivery confirmed by user).
- Deployed HTTPS session behavior and physical-phone installation/update checks.
- Backup/restore rehearsal.

## Completed live browser acceptance

Brave verified booking CFEF6979 for TEST Acceptance - no real customer: PKR 1,500 price, PKR 500 advance, PKR 1,000 initial balance. Cancellation released occupancy and created PKR 500 refund owed. An excessive PKR 501 refund was rejected. A PKR 500 refund succeeded, leaving net received, balance, and refund owed all zero. Receipt values persisted after reload. The user supplied a screenshot confirming a complete one-page print preview. No real money was exchanged; the clearly labelled cancelled/refunded audit fixture remains in Supabase.

## Live automated verification with supplied test account

- `node scripts/test-live-concurrency.mjs` PASSED: two independently authenticated clients raced overlapping bookings; exactly one committed and the other returned SQLSTATE 23P01. Concurrent payments allowed one success; retry of the winning payment did not duplicate its ledger row. Fixtures were cancelled/refunded and the test ground deactivated.
- `node scripts/test-live-realtime.mjs` PASSED: a second authenticated client received ground changes, recovered a missed change through snapshot after disconnect, resubscribed, and received subsequent events. The ground is inactive and clearly labelled TEST.
- Supabase accepted a password-recovery email request to the supplied test account. The user confirmed inbox delivery. Reset-link/password-change completion remains unverified; no password was changed.

The embedded database suite uses one connection; the above live-client checks supply separate evidence for actual Supabase request contention. These do not yet cover every booking-versus-block/rescheduling race. Production is running locally on port 3000; no deployed URL exists yet. Test credentials remain only in ignored .env.local. Database-management access is still needed for a backup/restore rehearsal.
