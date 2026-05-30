# My Family My Life — PRD

## Original Problem Statement
صمّم تطبيق ويب حديث ومتطور باسم "My Family My Life" بواجهة كاملة باللغة الإنجليزية. في المرحلة الأولى يجب أن يكون قسم Time Plan فقط هو القسم الفعّال، بينما يظهر القسمان الآخران كبطاقات جذابة تحمل عبارة "Coming Soon".

## User Choices (gathered)
- Authentication: **Two fixed pre-seeded users (wife/husband), no auth**
- Family pairing: shared family account auto-created
- PWA: full Progressive Web App with offline sync via localStorage cache + service worker
- Design: agent decides (warm beige/family/elegant — Organic Earthy)
- Language: English only

## Personas
- **Wife** (id=wife, color=#F472B6)
- **Husband** (id=husband, color=#60A5FA)

## Architecture
- Frontend: React 19 + React Router 7 + Tailwind + Shadcn UI + framer-motion + sonner
- Backend: FastAPI + Motor (MongoDB async)
- DB: MongoDB collections `users`, `event_types`, `events`
- Offline: localStorage caches GET responses; service worker caches static/API GETs

## Static Requirements
- Dashboard with 3 module cards: Time Plan (active), Home Budget (Coming Soon), Wall Board (Coming Soon)
- Time Plan calendar: monthly grid, user switcher, merge calendars toggle (split cells pink top / blue bottom borders, no labels), per-event custom color picker, floating popover (not bottom panel) on day click with full details, unlimited custom categories (CRUD), event sort by time, "+N more" overflow
- PWA: manifest.json + service-worker.js

## Implemented (Feb 2026)
- Backend models & CRUD for users, event_types, events (filter by year/month/user_id)
- Auto-seed of wife/husband users on startup
- Dashboard page with 3 cards, Outfit/DM Sans typography, warm beige palette
- TimePlan page: month nav, user switcher pills, merge toggle, split-border cells (#F472B6 top / #60A5FA bottom), event bars with contrast-aware text, "+N more" overflow indicator
- Floating Radix Popover for day details with edit/delete
- EventDialog with title, user, category, date, start/end time, free color picker (HTML color input + hex), notes
- EventTypesDialog: full CRUD for categories
- PWA: manifest.json, service-worker.js, register-on-load
- Offline cache fallback in API client (localStorage)
- Online/offline toast indicator
- **Feb 2026 (latest)**: Replaced app branding — new "My Family My Life" illustrated logo applied to favicon.ico, logo192/512/1024.png, apple-touch-icon.png, og-image.png, manifest icons (with maskable purpose), and Dashboard header (replaces previous gradient "M" tile). Added OG/Twitter meta tags.
- **Feb 2026 (latest)**: 100% translation coverage. Expanded `lib/translations.js` to ~150 keys per locale covering: every section title, button label, empty state, placeholder, tooltip, dialog header/description, toast (success/error/info/warning), sync state label, month name (Jan–Dec), short weekday name (Sun–Sat), default user names, and error boundary copy. Refactored every visible component to consume `useT()`: `pages/Login.jsx`, `pages/WallBoard.jsx` (main + every editor dialog + GoalHistory + WallSettings), `pages/TimePlan.jsx` (header, sync pill, month/day headers via `t("month.N")` / `t("day.short.N")`, Quick Fill bar, toasts), `components/EventDialog.jsx`, `components/EventTypesDialog.jsx`, `components/DayDetailPopover.jsx` (with locale-aware `toLocaleDateString`), `components/ProfilesDialog.jsx`, `components/ErrorBoundary.jsx` (class component reads `localStorage.mfml_lang` directly). User-saved content (custom hero title, MOTD text, goal labels, profile names like "Theresa"/"Bahaa") is preserved untouched — only the chrome and defaults translate. RTL fully working for Arabic; LTR for English/German; `<html lang dir>` updates automatically on language change.
- **Feb 2026**: Our Goals enhanced with archive + full history. Added 3 new timestamps to `wall_goals` (auto-stamped server-side): `updated_at` (every PUT), `completed_at` (set when `done` flips to true, cleared when un-done), `archived_at` (set via PUT `{archived: true}`, cleared by `{archived: false}`). GET `/api/wall/goals` excludes archived by default; `?include_archived=true` returns all. New Archive button per goal row (between Edit and Delete). Single "History" button at the bottom of the Our Goals card opens `GoalHistoryDialog` showing active + archived goals; tap any goal to see its 4 timestamps; archived goals have Restore + permanent-delete actions. Long goal text now wraps to multiple lines (replaced `truncate` with `break-words whitespace-pre-wrap`). No other sections changed.
- **Feb 2026**: **Wall Board is now the real main Dashboard (`/`).** Old static Dashboard removed from routing; `/wall-board` and `/dashboard` redirect to `/`. All sections fully editable + persisted in MongoDB:
  - Hero Banner (title, subtitle, photo — photo stored as resized base64 JPEG, max 1280px)
  - Message of the Day (title + text)
  - Photo of the Day (multi-photo carousel, add/delete)
  - Our Goals (add/edit/delete + toggle done)
  - Countdown (events with target dates, days-remaining auto-computed)
  - Family Events (NEW section, upcoming events sorted by date)
  - Quick Notes (text + color from 6-color palette)
  - Our Achievements (name + note + optional photo, horizontal scroll)
  - Verse & Prayer removed (not in user's section list)
  - Offline-first architecture: `lib/wallApi.js` uses localStorage read-through cache + write-back outbox queue (`wall_outbox`). Every mutation is optimistic; failures queue and auto-replay on `window.online` event or manual "Sync now" button in Settings dialog. Backend `PUT /api/wall/settings` uses `exclude_unset=True` so explicit nulls (e.g. clearing hero photo) actually persist.
  - 7 new MongoDB collections: `wall_settings`, `wall_photos`, `wall_goals`, `wall_countdown`, `wall_achievements`, `wall_notes`, `wall_family_events`.
  - Tested: 19/19 backend pytest cases pass + frontend E2E (login → add to every section → refresh → verify persistence).

## Test Coverage
- Backend: 18/18 pytest cases pass (CRUD + filtering + 404s + PWA assets)
- Frontend: end-to-end Playwright flow validated (dashboard → navigation → calendar → event creation → popover → merge → categories CRUD)

## Backlog (prioritized)
- **P1** Home Budget module (income, expenses, bills, savings, debt, monthly analytics)
- **P1** Wall Board module (shared sticky notes, shopping list, pinned notes, per-note color)
- **P2** Drag-to-reschedule events
- **P2** Recurring events
- **P2** Real auth + multiple families
- **P2** Push notifications
- **P3** iCal export / Google Calendar sync
- **P3** Native iOS/Android wrappers (Capacitor)

## Implemented (Feb 2026 — Where is my family?)
- New Wall Board section **"Where is my family?"** mounted right under the Hero banner.
- **Backend** — added 3 endpoints + 2 MongoDB collections (`family_members`, `location_points`):
  - `POST /api/location/update` — receives a location ping. Validates `familyCode` against the `FAMILY_CODE` env var (401 on mismatch). Auto-creates the member on first ping (no manual setup), upserts last-known position, and appends an immutable point to history.
  - `GET /api/location/latest` — returns the latest known position for every tracked member.
  - `GET /api/location/history?memberId=&date=YYYY-MM-DD` — returns the day's polyline. Falls back to last 24h when no date is given; rejects malformed dates with 400.
  - Stored fields: latitude, longitude, accuracy, speed, battery, timestamp, networkStatus, connectionType, trackingStatus, deviceId, profileImage.
- **Frontend** — `components/FamilyMapCard.jsx`:
  - Leaflet + OpenStreetMap tile layer (no API key). Leaflet CSS imported in `index.css`.
  - Custom DivIcon avatar markers (per-member stable color, profile image or initials, online/offline dot).
  - Auto-fit bounds when members move; manual refresh button; 30s polling + online-event refresh.
  - Compact MemberCard list below the map showing time-ago, battery (low-battery red icon), network state, connection type. Tap avatar to center on map; tap History to open the dialog.
  - **History dialog** with member + date pickers, draws a polyline with start (A green) and end (B red) markers, plus clickable circle markers per point.
  - **Read-only**: the web app never broadcasts its own location; a future standalone Android Sender app will push to `POST /api/location/update`.
- **Auth**: shared Family Code is used to authorize POSTs (per user choice). No per-device token yet.
- **i18n**: 36 new `fmap.*` keys × 3 locales (EN/AR/DE) covering every label, unit, time-ago bucket, and history dialog string.
- **Empty state**: map renders with neutral fallback view + clear message "No one is sharing their location yet" until the first ping arrives.
- **Tests**: backend smoke-tested via curl (POST valid/invalid code, GET latest, GET history with date / bad date / cleanup); frontend smoke-tested via screenshot showing the empty-state card with rendered OSM tiles.

## Next Tasks
- After user review: choose between deepening Time Plan (recurring, drag-drop), starting Home Budget MVP, or building the standalone Android Sender app to start feeding real location data into the new endpoints.

## Implemented (Feb 2026 — Shopping List)
- New standalone **Shopping List** module accessible from a shopping-cart icon in the WallBoard top bar.
- **Backend** (`server.py`): `ShoppingItem` model + 5 endpoints under `/api/shopping`:
  - `GET /api/shopping`, `POST /api/shopping`, `PATCH /api/shopping/{id}/toggle`, `DELETE /api/shopping/{id}`, `POST /api/shopping/finish` (deletes only purchased items, keeps unpurchased ones).
  - New MongoDB collection: `shopping_items` `{id, name, purchased, created_at}`.
- **Frontend**:
  - `pages/ShoppingList.jsx` — minimal mobile-first UI: input + Add button, tappable rows with checkbox + delete, "Finished Shopping" button with confirmation dialog.
  - `lib/shoppingApi.js` — thin axios client (no offline queue; feature is light enough).
  - Route `/shopping` added to `App.js`.
  - Shopping cart icon added to WallBoard top bar (`wall-shopping-btn`).
- **i18n**: 18 new `shopping.*` / `common.*` / `btn.back` keys × 3 locales (EN/AR/DE).
- **Tested**: backend curl flow verified (create 3 items → toggle 2 → finish → only unpurchased item remained). Frontend smoke-tested via screenshot.

## Implemented (Feb 2026 — Family Events as recurring birthdays)
- Family Events now behaves as a **birthday card** module with no hard item limit.
- **Yearly recurrence logic** (frontend-only, no schema migration): `nextOccurrence`, `daysUntilNextOccurrence`, `currentAge`, `nextOccurrenceWeekday` helpers compute the next future month+day match from the stored birth date.
- Removed the buggy `e.date >= today` filter that hid all birthdays with a past birth year (1988, 1960 …).
- **Card layout**: each row shows name + next-occurrence date + a pink "DAYS LEFT" badge, sorted by closest first. Card shows the first 5 by default; **"View All (N)"** button reveals the rest. Tapping a row opens a detail dialog.
- **Detail dialog** (`FamilyEventDetailDialog`): weekday + next-occurrence date, big countdown banner, BIRTHDAY (full DOB), CURRENT AGE, NEXT BIRTHDAY (next age), notes (if any), Delete / Edit / Close actions.
- **Editor** updated: date field relabeled "Birth Date" with a small hint explaining it powers the age & yearly countdown.
- **i18n**: 12 new `fe.*` keys × 3 locales (EN/AR/DE).
- **Tested**: curl-seeded 6 birthdays with years 1960–2020, verified list, sorting, "View All (6)" button, and the detail dialog (Bahaa: 37 → 38, 144 days). Test data cleaned up after verification.

## Implemented (Feb 2026 — Multi-tenant Accounts + Admin)
- Major architecture change: from a single Family Code app to a real multi-tenant
  account system with families → accounts → members → admin. Data isolation
  scaffolding is in place; **app modules are NOT yet migrated to filter by
  `family_id`** (planned for the next phase).
- **Backend** (`backend/auth_module.py` + wiring in `server.py`):
  - Collections: `families`, `accounts`, `family_members`, `recovery_codes`, `login_attempts`.
  - Endpoints:
    - `POST /api/auth/register` → creates family + owner account, returns JWT.
    - `POST /api/auth/login` → returns JWT.
    - `GET /api/auth/me` → account + family + members snapshot.
    - `POST /api/auth/forgot` → generates 6-digit code, hashes it, logs the plain code (no email sender yet).
    - `POST /api/auth/reset` → consumes code + sets new password.
    - `POST /api/auth/member/select` → second-step PIN check, returns member JWT.
    - `GET/POST/PUT/DELETE /api/family/members` — parent-only after the first parent is seeded.
    - `GET /api/admin/families`, `POST /api/admin/families/{id}/status`, `POST /api/admin/families/{id}/recovery` — admin-only.
  - bcrypt for passwords + PINs, JWT (HS256) with separate `account` and `member` token types, 5-attempt lockout per identifier (15 min), TTL index on recovery codes.
  - Startup hooks: `ensure_indexes`, `seed_admin` (idempotent, from `.env`), `seed_default_family` (creates "Nasser Family" if no real family exists).
- **Frontend**:
  - `lib/auth.js` rewritten with `register / login / me / forgot / reset / listMembers / addMember / updateMember / deleteMember / selectMember / adminListFamilies / adminSetFamilyStatus / adminIssueRecovery`. Stores two tokens in localStorage and keeps the legacy `mfml_auth_ok` flag so existing pages keep working during the migration.
  - `pages/Login.jsx` rewritten as a 3-stage flow: AccountType (Family / Single-soon) → Auth (login / register / forgot) → MemberSelect (member rows + PIN field + inline "add first parent" dialog).
  - New `pages/Admin.jsx` listing all families with status / plan / emails / created / free_until / members count, plus Disable/Enable + one-time Recovery Code dialog.
- **i18n**: 60+ new `auth.*` / `admin.*` / `btn.refresh` keys × 3 locales (EN/AR/DE).
- **Service worker fix**: was using stale-while-revalidate for `/api/*` GETs which masked POST mutations. Now `service-worker.js` bypasses `/api/*` entirely and always hits the network. Cache bumped to `mfml-cache-v4`.
- **Tested**: curl end-to-end (register → add parent → wrong PIN → select member → forgot → reset → disable family → admin recovery), then full Playwright UI smoke (register → bootstrap parent → unlock to Wall Board, plus Admin console with Recovery Code dialog).
- **Important note**: ~~data isolation is intentionally scaffolded only~~. **DATA ISOLATION FULLY ENFORCED** as of the Feb 2026 — Tenant Isolation entry below.

## Implemented (Feb 2026 — Tenant Isolation 🔒)
Production-grade `family_id` filtering across every data endpoint. Replaces the previous "scaffolded only" status — bug surfaced when a new family on Render saw Nasser's data because no route filtered.

- **New module `backend/tenant.py`**:
  - `ScopedCollection` Motor proxy that injects `family_id` from a `contextvars` request scope into every `find/find_one/count/aggregate/insert*/update*/delete*` call.
  - `ScopedDB` returns `ScopedCollection` for known data collections and the raw Motor collection for everything else (so auth/admin keep cross-tenant access).
  - FastAPI middleware decodes the bearer token on every `/api/*` request and seeds `current_family_id` (admin tokens stay None → data routes get 401 "Family context required").
  - 17 collections are scoped: `budget_income/expenses/bills/debts/loans`, `wall_settings/photos/goals/countdown/achievements/notes/family_events`, `routines/routine_logs`, `shopping_items`, `gps_devices/location_points`, plus legacy `events/event_types/users`.
- **Server wiring** (`server.py`): `db = ScopedDB(raw_db)`; raw handle passed to auth/admin/family routers; middleware installed before any route.
- **Idempotent on-startup migration** (`migrate_legacy_to_nasser`):
  - Binds `family_code = FAMILY2026` to the Nasser Family doc.
  - Moves GPS-shaped docs out of the shared `family_members` collection into a new dedicated `gps_devices` collection.
  - Adds `family_id = <Nasser id>` to every legacy document across the 17 scoped collections.
  - Generates a unique random `family_code` for every other family that lacks one.
  - **Never deletes data** and re-runs safely.
- **Location ingest hardened**:
  - `POST /api/location/update` no longer compares against the global env-var `FAMILY_CODE`. It looks up `families.family_code` for the caller-supplied code and writes to `gps_devices` + `location_points` with the resolved `family_id`.
  - `DELETE /api/location/member/{id}` now scoped by JWT → no `familyCode` query parameter accepted.
- **Register flow**: every new family is created with its own random `secrets.token_urlsafe(12)` `family_code` (used by the standalone Android sender).
- **Tested end-to-end** via curl:
  1. Nasser adds a wall note → visible to Nasser only.
  2. Test Family created → lists for `wall/notes`, `wall/photos`, `wall/goals`, `wall/family-events`, `budget/income`, `budget/expenses`, `budget/bills`, `budget/loans`, `budget/debts`, `routines`, `shopping`, `location/latest` → ALL EMPTY (12 endpoints verified).
  3. Test adds its own note → Nasser still sees only its own; Test sees only its own.
  4. Cross-tenant attack: Test deletes Nasser's note by id → 404 Not found, note preserved.
  5. Anonymous request → 401 "Family context required".
  6. Admin token (no family scope) → 401 on every data endpoint.
  7. `wall_settings` is now a per-family singleton (each family gets its own).
  8. Forecast / aggregation pipelines auto-prepend `{"$match": {"family_id": fid}}`.

## Implemented (Feb 2026 — Financial Forecast & Contract Lifecycle)
- New **Financial Forecast** card inside Family Budget. Users pick any month/year (← →) and see predicted income, bills, loan payments, debts due, total obligations, and remaining balance.
- **Backend** (`server.py`):
  - Extended `Bill` model with `start_date`, `end_date`, `auto_renew`, `notes` (notes already present).
  - New endpoint `GET /api/budget/forecast?year=&month=`: returns single-month forecast + delta vs current month + a `changes` block listing loans that ended / contracts that expired between today and the forecast month.
  - New endpoint `GET /api/budget/forecast/range?months=6`: rolling N-month outlook (used by the dialog's "Show 6-month outlook" button).
  - New endpoint `GET /api/budget/contracts/expiring`: bills with `end_date` in the next 92 days, bucketed as `3_months` / `1_month` / `2_weeks`.
  - Forecast logic respects the brief: a bill is **active in (Y, M)** only when its contract window covers that month *or* `auto_renew` is true; a loan installment counts **only its `monthly_payment`** and **only** while the term (start_date + term_months) hasn't ended; debts are counted only if `due_date` falls inside the target month and `status != "paid"`.
  - Recurring income estimate = average of the last 3 completed months' income totals (falls back to the current month if no history).
- **Frontend**:
  - Bill editor now exposes `start_date`, `end_date`, `auto_renew` (new `checkbox` field type supported by the dynamic form).
  - `ForecastDialog` component: month stepper, big "Expected Remaining" banner, breakdown rows, comparison to current month with reason (e.g. "Loan ended: Car Loan"), and an expandable "Next 6 months" list with tap-to-jump.
  - `ExpiringContractsAlert`: inline reminder card listing bills ending within 2 weeks / 1 month / 3 months, with a colored bucket badge and an "Open forecast" shortcut.
  - `lib/budgetApi.js`: added `fetchBudgetForecast`, `fetchBudgetForecastRange`, `fetchExpiringContracts`.
- **i18n**: 38 new keys × 3 locales (EN/AR/DE) covering all forecast labels, month names, contract buckets, and editor field labels.
- **Tested**: seeded recurring salaries + an O2 contract ending 2026-12-31, Netflix auto-renew, Car Loan ending Oct 2026; curl + screenshot proved: Sep 2026 included the loan (Bills 54.99, Loans 300, Remaining 2511.68), Nov 2026 dropped the loan (Loans 0, Remaining 2811.68, "Loan ended: Car Loan"), Feb 2027 dropped O2 (only Netflix counted). 6-month outlook visualised the Oct→Nov jump. Test data cleaned up.



## Implemented (Feb 2026 — Family Members management page)
- **New permission model**: `is_family_admin` (boolean) is now the SOLE source of family-management rights. The `role` field (parent/adult/child/other) is purely descriptive.
- **Migration**: `auth_module.ensure_indexes()` backfills legacy data — any member with `role="parent"` and no `is_family_admin` flag becomes `is_family_admin=true`; everyone else without the flag is set to `false`. Prevents legacy families from being locked out.
- **Bootstrap**: when a family has zero admins, the FIRST member created is auto-promoted to `is_family_admin=true` regardless of payload.
- **Backend endpoints** (`/app/backend/auth_module.py` → `build_family_router`):
  - `GET /api/family/members` — accepts any account or member token, returns members with `is_family_admin` boolean, never leaks `pin_hash`.
  - `POST /api/family/members` — requires either (account token + no admin yet) or (member token + `fadmin=true`). PIN must be ≥4 chars; role must be one of `{parent, adult, child, other}`.
  - `PUT /api/family/members/{id}` — same auth; can update name, role, pin, `is_family_admin`. Blocks demoting the only admin (400).
  - `DELETE /api/family/members/{id}` — blocks deleting the only admin (400); otherwise removes the member.
- **Frontend** (`/app/frontend/src/pages/FamilyMembers.jsx`): full management UI with list, add/edit/change-PIN/delete dialogs and promote/demote buttons. UI mirrors backend guards.
- **Entry point**: Wall Board → Settings dialog now shows a "Manage family members" button visible ONLY when `getMember().is_family_admin === true`.
- **Route**: `/family-members` (added to `App.js` under `RequireAuth`); non-admin members get redirected to `/` with a toast.
- **i18n**: 38 new `members.*` keys × 3 locales (EN/AR/DE).
- **Tested**: backend pytest 9/9 PASSED (bootstrap promotion, 403 on second add via account token, full CRUD, last-admin demote/delete protection, second-admin unlock, multi-tenant isolation). Frontend Playwright E2E covered register → bootstrap → select with PIN → wall board → /family-members → add/promote/demote/change-pin/delete + AR/DE translation.

## Backlog / Next
- **P1**: Real email sending for forgot-password (SMTP integration via SendGrid/Resend) — currently the 6-digit code is only printed to logs.
- **P1**: Refactor `server.py` (~2300 lines) into routers/models packages.
- **P2**: Standalone Android sender app for GPS pings.
- **P3**: SOS system tied to smartwatches / health data.
