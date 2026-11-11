# Phase 1 — Supabase connected

## Live configuration — November 11, 2026

Supabase is connected through `.env.local`; demo mode is disabled. Admin login, session persistence, Realtime subscription, and saved settings/ground/rate changes were verified in the browser. Anonymous table and snapshot access are denied.

Pavilion Cricket Club has two active grounds, The Oval and The Pavilion, with normal hours 16:00–02:00 daily. Standard pricing is PKR 1,500/hour; full-calendar-day Saturday and Sunday rules charge PKR 2,000/hour on both grounds. The schedule's **Show all hours** control allows off-hours selection with a recorded admin override and unchanged conflict protection. Live quotes verified weekday and weekend pricing outside normal hours. No fictional bookings or payments were added to the live database.

Remaining launch checks include password recovery/SMTP, multi-device Realtime, independent PostgreSQL-session concurrency, HTTPS deployment, and physical-device PWA installation/update.

## Earlier dummy-data verification

Continued from the existing implementation; no rebuild or data reset was performed.

## Ready for user acceptance testing

The local app was tested with persistent fictional data, scheduling and booking forms, customers, hours/rate configuration, payments/refunds, cancellation decisions, receipts, reports, and responsive desktop/mobile views. Those demo records remain separate from the live Supabase database.

Verified:

- Production compilation and strict TypeScript passed.
- Seven domain tests passed.
- SQL migration and database integrity/authorization suite passed, including overlap constraints, atomic writes, immutable ledger, duplicate retries, stale edits, overnight pricing and refunds.
- HTTP acceptance checks passed for quotes, creation, retries, conflicts, receipt rendering, cancellation/refund, origin protection, manifest and PWA assets.
- Browser booking entry saved a fictional test reservation, persisted through reload/server restart, and displayed its receipt actions.
- Mobile booking details and payment entry were exercised; a fictional additional payment updated the displayed balance from PKR 3,000 to PKR 2,000.
- Mobile bookings render as cards. Icon-only tablet navigation retains accessible labels.
- The offline fallback appeared with the server stopped, and the terminal recovered after restart.

## Deferred until Supabase/production setup

Password-recovery verification, SMTP delivery, actual multi-device Realtime, independent PostgreSQL-session concurrency testing, HTTPS deployment, and physical-device PWA installation/update checks. These are listed in TESTING.md. Login/session persistence is now verified.

The local demo is not production-ready hosting: it intentionally skips authentication, uses a single local database connection, and is development-only. Keep testing data fictional. No demo records are automatically migrated to Supabase.

## Known scope limits

- Reports load the full small-club dataset; larger deployments need server-side paging/aggregation.
- Historical utilization uses current operating-hours configuration.
- Currency amounts use two decimal minor units; other currency exponents need an enhancement.
- Browser install/update behavior still needs physical Android/iOS testing.

Launch with `npm run dev` and open http://127.0.0.1:3000. With Supabase configured, changes persist in the live club database. `.local-db/` is used only in demo mode.
