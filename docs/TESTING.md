# Phase 1 acceptance tests

Use dummy data only in local demo mode. Verify every successful operation survives a browser reload and a server restart.

## Local workflow checks

1. Create a 90-minute booking on an open ground with no phone, a partial advance, and a note. Confirm the visible amount and receipt.
2. Try a partially overlapping booking, exact duplicate, containing interval, and booking inside a maintenance block. Each must fail without adding a customer or payment. An adjacent booking must succeed.
3. Create a 23:30–00:30 next-day booking. Confirm both calendar dates, pricing split, and appearance on the previous operational day.
4. Add a weekday peak rule. Verify a booking crossing the rate boundary; existing booking prices must not change. An overlapping rule must fail.
5. Record an additional payment. Double-click/retry with the same request UUID must not duplicate it. Overpayment must fail.
6. Cancel a paid booking. Require an explicit retain/refund-owed choice. A refund-owed cancellation releases occupancy without reducing actual cash collections until a separate refund transaction is recorded.
7. Record partial/full refunds. Verify immutable transaction history, net collections and remaining refund obligation. Excess refunds must fail.
8. Open the same booking in two tabs, modify it in one, then try to save the stale version in the other. Require refresh instead of overwriting.
9. Change customer contact details, deactivate/reactivate a ground, set a closed weekday, and create/remove a future block.
10. Verify search, status/date/ground filters, customer history, print layout, and WhatsApp text without sending messages to real people.
11. Review reports with empty data and custom periods. Booking value and money collected must remain separate. Refunds use their actual transaction dates.
12. Test at phone/tablet/desktop sizes, keyboard-only navigation, focus trapping/return in dialogs, and reduced-motion settings.
13. Disconnect the browser network. Display a warning and disable mutations; reload to the generic offline screen. Reconnect and verify refresh.
14. Change club branding, then check settings persistence, receipts and the install manifest. Currency cannot change after bookings exist.

## Automated commands

- `npm test`: interval boundaries, exact money parsing, phone normalization, overnight day math, nonexistent DST time rejection, rate boundaries and refund-derived state.
- `npm run test:db`: executes the migration in a PostgreSQL-compatible engine, then tests auth/RLS, direct-write denial, overlap, block conflicts, rescheduling, duplicate requests, payments/refunds, stale versions, immutable ledger and rule ambiguity.
- `npm run typecheck` and `npm run build`: strict TypeScript and production compilation.
- With the local demo running, `node scripts/test-http.mjs` checks the HTTP quote, booking, duplicate/conflicting submissions, receipt, cancellation/refund, origin rejection, manifest and icons. It leaves a clearly named cancelled/refunded acceptance fixture for audit inspection.

Run the production build with the development server stopped. This avoids simultaneous regeneration of Next.js type files on Windows.

The PGlite test's simultaneous promise submissions are processed by a single embedded connection. They verify that competing requests cannot both succeed, but **do not establish independent-session lock behavior**.

## Required live Supabase checks after wiring

1. Disable signup. Create one authorized account and one unlisted test account. The unlisted account must not read customer/financial data or call mutating/quote RPCs. An anonymous request must fail.
2. In two independent clients authenticated as the shared admin, submit the same ground/time using different request UUIDs. Exactly one must commit. Repeat with a booking versus a block and with rescheduling. Confirm SQLSTATE `23P01` is mapped to a friendly conflict response.
3. Repeat concurrent payment attempts approaching the balance: row/settings locking must prevent overpayment. Retry the winning request UUID and verify one ledger row.
4. Validate the `public` Realtime publication, RLS visibility, updates on a second device, disconnect/reconnect, and fallback refresh.
5. Verify secure HTTPS cookie sessions, logout, expired sessions, password recovery, and refresh across installed/browser windows. Test recovery email delivery from the configured SMTP service.
6. Check production responses: no cached sensitive API/receipt responses, no service-role key in browser assets, correct origin rejection, and no demo-mode bypass under `npm start`.
7. Install on Android/desktop; on iOS verify Add to Home Screen guidance. Check manifest/icons/standalone launch, offline screen, and an update with an unsaved form. A service-worker update must wait for explicit reload.
8. Perform and document a backup/restore rehearsal before commercial launch.
