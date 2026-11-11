# Crease — Indoor Cricket Booking POS

A schedule-first Next.js application for one club per deployment. Supabase integration is connected and live booking, payment/refund, receipt, concurrency, and Realtime checks have passed. See `docs/RELEASE-TEST-RESULTS.md` for verified results and remaining launch checks. A separate fictional local demo is available for development.

## Run Phase 1 locally

Requirements: Node.js 22+ and npm.

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. Leave Supabase environment variables unset for the demo. The first request initializes `.local-db/` and creates fictional grounds, customers, bookings, and payments. Initialization can take several seconds. Subsequent visits and server restarts preserve your changes. Run only one dev server against this database directory.

The yellow demo label remains visible. There is no authentication in local demo mode. It is available only under `next dev`, binds to loopback by default, and cannot turn on in a production build. Use fictional data only. Production without Supabase shows a setup state and refuses mutations.

To start fresh, stop the server and **rename** `.local-db` to `.local-db-backup-<date>` within this folder, then restart. Keep the backup until you no longer need your testing records. These files must never be uploaded to Git or Vercel.

## What you can test

- Booking terminal: individual/combined ground schedules, operational dates, 30-minute slots, elapsed periods, maintenance blocks, quick booking.
- New bookings: customers, server-calculated rate breakdown, exact minor-unit money, agreed price override with reason, advance, notes, overnight dates.
- Booking management: search, dates/grounds/statuses, rescheduling, price changes, payments, refunds, cancellation decisions, completed/no-show states.
- Receipts and ordinary WhatsApp deep links (nothing is automatically sent).
- Customers, ground hours/deactivation, calendar weekday/peak pricing rules, club branding/settings.
- Reports: booking values versus transaction-date collections/refunds, payment methods, utilization, ground performance, popular start times.
- Manifest, local application icons, online-first service worker, offline warning, install guidance and safe update prompt.

Demo writes execute the **same SQL functions, RLS, exclusion constraints and ledger** as the Supabase implementation using PGlite. A 30-second refresh synchronizes local tabs; Supabase Realtime takes over after connection. This is more representative than an in-memory mock, but is not a substitute for managed Supabase integration testing.

## Commands

```powershell
npm run typecheck
npm test
npm run test:db
npm run build
npm start
```

Webpack is selected explicitly because Turbopack's CSS subprocess fails on this Windows environment. The application still uses Next.js App Router and `proxy.ts`. `npm start` is production mode and **does not run the local demo**.

## Connect a new Supabase project

1. Create a separate Supabase project for the club. No shared multi-tenant database is required.
2. Run `supabase/migrations/202611080001_core.sql` in the Supabase SQL editor or through the Supabase migration CLI. The file is executable, not illustrative. It creates tables, functions, indexes, constraints, RLS, and Realtime publication entries.
3. In Supabase Auth, **disable new-user signup**. Enable email/password sign-in. Provision one admin using the dashboard's administrator controls. Do not add public registration.
4. Insert the provisioned user's UUID using the SQL editor:

   ```sql
   insert into public.admin_users(user_id) values ('YOUR_AUTH_USER_UUID');
   ```

   A unique singleton index enforces one authorized shared account per club. Replace its UUID administratively if the account needs replacement.
5. Copy `.env.example` to `.env.local`. Supply the project URL and publishable key. Never put a service-role or secret key in `NEXT_PUBLIC_*` variables. This app does not require a service-role key.
6. Restart the server. Presence of both Supabase variables disables local demo mode. Sign in and configure club identity, currency/timezone, grounds, hours, and prices. The local demo data is **not imported** into production.
7. Configure Auth Site URL and permitted redirect URLs for the deployment, including `/auth/callback`. Set up your SMTP provider for reliable password recovery. Test email recovery in a real browser. PKCE recovery should return to the browser that requested the email.
8. Complete the live test checklist in `docs/TESTING.md` before accepting real bookings.

## Vercel deployment and repeatable onboarding

1. Put this codebase in your repository; exclude `.env.local`, `.local-db*`, and `node_modules`.
2. Import as a Next.js project in Vercel. Use the committed lockfile and `npm run build`.
3. Add the club-specific public Supabase URL/publishable key and app URL as deployment environment variables.
4. Ensure Supabase Auth redirect URLs match the final HTTPS domain. Protect any preview environment with a separate database.
5. Provision the single admin, configure identity, hours, rate rules, contact details and receipts, and replace app icons if the client needs branded install icons.
6. Test booking and payment creation on two devices, receipt printing, password recovery, offline behavior and install/update flow.
7. Enable a suitable Supabase backup plan, verify restore procedures, and arrange credential handover through a secure channel.
8. Repeat with an isolated Supabase project and Vercel project for each customer. Never reuse another customer's live database or credentials.

## Business rules and architecture

- `reservations` is the unified occupancy model for bookings and ground blocks. A GiST exclusion constraint rejects intersecting `[start,end)` ranges on the same ground. Adjacent reservations are valid. Cancelled rows release occupancy; no-show/completed rows preserve historical occupancy.
- All writes go through `pos_mutate`. It verifies `auth.uid()` against `admin_users`, locks the singleton settings row, checks a booking's expected version, and commits customer/booking/payment/audit changes atomically. Direct authenticated table writes are revoked.
- The settings lock serializes mutations for one small club. The exclusion constraint independently protects occupancy. If throughput becomes material, narrow locks after preserving the same transaction guarantees.
- All amounts are integers in **hundredths of the configured currency** (PKR paisa by default). Each 30-minute segment uses half the hourly rate, rounded half up to a minor unit. The agreed booking price is stored and is never recalculated by future rate changes. Version 1 supports currencies using two decimal minor units; zero/three-decimal currencies require a currency-exponent enhancement.
- Each ground's standard rate is the fallback. A time rule overrides it for one local calendar weekday and half-open minute range. Overlapping rules on the same weekday/ground are rejected. Split overnight rules at midnight into two weekdays.
- Hours store local minutes relative to the operational day's midnight; e.g. 960–1560 means 16:00–02:00 next day. Prices use calendar weekdays; the schedule uses business days. An explicit hours override needs a reason and still cannot overlap occupancy.
- `payments` is append-only. Refunds are separate transactions, never negative edits. Cancellation with money held requires `retain` or `refund owed`; it never records a cash refund by itself. Excess payments are rejected. Record an actual refund before lowering a price below net received.
- Booking/payment request UUIDs prevent duplicate retry submissions. Version checks prevent silent edits to a changed booking. The database is the authority; optimistic UI does not claim success.
- `pos_snapshot` produces a transactionally consistent snapshot under RLS. The UI currently loads the whole small-club dataset; introduce server-side paging/report aggregation before large-scale, multi-year deployments. No financial totals are silently truncated.
- Demo data is stored server-side locally, not in browser storage. Production data stays in Supabase. Service workers cache only icons and a generic offline page, never booking/customer/auth/API data.

## Files

- `src/components/terminal.tsx`: scheduling, navigation, live refresh, filters.
- `src/components/workflows.tsx`: booking/payment/customer/configuration forms.
- `src/components/reports.tsx`: reporting derived from persisted records.
- `src/lib/domain.ts`: integer money, phone normalization, date/time helpers.
- `src/lib/demo.ts`: development-only persistent fixture database.
- `src/app/api/pos/route.ts`: Zod-validated authenticated API boundary.
- `src/lib/supabase/`: SSR cookie and browser clients.
- `supabase/migrations/`: executable production schema and transactional RPCs.
- `scripts/test-db.ts`: real SQL integrity/authorization checks in PGlite.

## Remaining release verification

See `docs/RELEASE-TEST-RESULTS.md` for current results. Remaining checks include password-reset completion, additional conflict scenarios, backup/restore, deployed HTTPS behavior and physical-device installation/update. Historical utilization currently uses the current operating-hours configuration. Local dummy data is for acceptance testing, not commercial operation. Never add `SUPABASE_TEST_EMAIL` or `SUPABASE_TEST_PASSWORD` to Vercel; these are local test-runner credentials only.

Implementation references: [Next.js Proxy](https://nextjs.org/docs/app/getting-started/proxy), [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [PostgreSQL exclusion constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION).
