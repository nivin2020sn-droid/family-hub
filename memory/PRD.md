# My Life My Time — PRD

## Original Problem Statement
صمّم تطبيق ويب حديث ومتطور باسم "My Life My Time" بواجهة كاملة باللغة الإنجليزية. في المرحلة الأولى يجب أن يكون قسم Time Plan فقط هو القسم الفعّال، بينما يظهر القسمان الآخران كبطاقات جذابة تحمل عبارة "Coming Soon".

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
- **Feb 2026 (latest)**: Replaced app branding — new "My Life My Time" illustrated logo applied to favicon.ico, logo192/512/1024.png, apple-touch-icon.png, og-image.png, manifest icons (with maskable purpose), and Dashboard header (replaces previous gradient "M" tile). Added OG/Twitter meta tags.
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

## Implemented (Feb 2026 — Kids' Money / "My Money" — role-gated personal ledger)
- **Permission split**: `role === "child"` now sees a SEPARATE "My Money" tile (data-testid `nav-my-money`) instead of the full Family Budget. Everyone else (parents/adults/admins) keeps the existing `nav-home-budget` tile. `HomeBudget` page redirects any child who deep-links to `/home-budget` straight to `/my-money`.
- **New backend collection** `kids_money` (added to `SCOPED_COLLECTIONS` in `tenant.py`) — keeps every child's personal ledger isolated by `family_id` AND `member_id`. Never mixes with the family Budget collections.
- **Endpoints** (all require a member token; account token rejected because it lacks `mid`/`mrole`/`fadmin`):
  - `GET /api/kids-money/summary?member_id=` — child: forced to self. Admin: any kid in same family. Returns `{member, income, payments, balance, entries_count}`.
  - `GET /api/kids-money/transactions?member_id=` — same auth rule, sorted by date desc.
  - `POST /api/kids-money/transactions` — `{type: 'income'|'payment', amount > 0, description?, date?, notes?, member_id?(admin only)}`. Child cannot inject another `member_id`.
  - `PUT /api/kids-money/transactions/{id}` — owner-child or family admin only.
  - `DELETE /api/kids-money/transactions/{id}` — same auth.
  - `GET /api/kids-money/kids` — admin-only directory of every `role:'child'` member + their balance.
- **Frontend** (`/app/frontend/src/pages/MyMoney.jsx`):
  - Child view: big balance card (green/rose/neutral based on sign), Income/Payments mini-stats, two big "Add income" / "Add payment" buttons, history list with per-row edit + delete.
  - Admin view (no `?kid=` param): index of all kids in the family with balances; tap one to drill into their ledger (`/my-money?kid=<id>`). Adult/parent non-admin without a kid_id gets bounced.
  - Wall Board Settings dialog now exposes "Kids' Money" entry to admins alongside "Manage family members".
- **i18n**: 33 new `myMoney.*` + `nav.myMoney` keys × EN / AR / DE.
- **Tested**: backend pytest **19/19 PASSED** (summary scoping, child self-forcing, admin override, balance math, amount/type validation, PUT/DELETE auth, `/kids` admin-only, multi-tenant isolation, adult self-scope). Frontend Playwright end-to-end **PASSED**: child nav swap, /home-budget→/my-money redirect, balance math after 20€ in / 8€ out = 12€, edit + delete persistence, admin drill-in with cross-member add, WallSettings entry, AR + DE label rendering.


## Implemented (Feb 2026 — My Money: Saving Goals)
- **New scoped collection** `kids_money_goals` (added to `SCOPED_COLLECTIONS`). Each goal belongs to one child member and stays isolated by `family_id`.
- **Endpoints** (member token required):
  - `GET /api/kids-money/goals?member_id=&include_completed=` — child: forced to self. Admin: any kid. Response decorated with `saved` and `progress_pct`.
  - `POST /api/kids-money/goals` — `{name, target_amount>0, target_date?, notes?, member_id?(admin)}`.
  - `PUT /api/kids-money/goals/{id}` — owner-child or family admin. Toggling `is_complete=true` stamps `completed_at` and freezes `saved` at `target_amount`; `false` clears the timestamp.
  - `DELETE /api/kids-money/goals/{id}` — same auth rule.
- **Progress math**: `saved = min(balance, target_amount)` while active; `saved = target_amount` once completed. `progress_pct = saved / target_amount * 100`, capped at 100.
- **Frontend** (`MyMoney.jsx`): new "Saving Goals" section between Add buttons and History. Each goal row shows icon (Target → CheckCircle when done), name (strike-through when done), `saved / target € · DONE` label, a per-goal progress bar with percentage, plus toggle-done / edit / delete actions. Editor dialog supports name + target + optional date + notes.
- **i18n**: 22 new `myMoney.goals.*` keys × EN / AR / DE.
- **Tested**: backend pytest **17/17 PASSED** (validation, child cross-target forced to self, complete-freeze, re-open, include_completed filter, cross-member 403, admin override, multi-tenant isolation, cap at target). Frontend Playwright **10/10 PASSED** (section visible, empty state, create with 30/80=37.5% bar, edit-resize bar, mark done with badge & 100%, re-open, delete, admin drill-in goal creation, AR + DE labels).


## Implemented (Feb 2026 — Per-member Time Plan)
- **Member calendars**: every family member now owns their own events. Time Plan opens to the current member's calendar by default. Family admins can overlay any combination of members via the new "Family Calendar View" filter dialog (data-testid `family-view-dialog`).
- **Auto-assigned colours**: `auth_module.MEMBER_COLOR_PALETTE` (12-colour palette). New members get the next unused palette colour via `_pick_member_color`. The `PUT /api/family/members/{id}` route also accepts `color` overrides. `ensure_indexes` back-fills legacy members on boot.
- **Events tied to members**: `Event` model gains `owner_member_id` (canonical) with legacy `user_id` kept as a fallback. List/create/update/delete endpoints now require a member token; auth helpers `_normalize_owner_filter`, `_event_owner_id`, `_ensure_event_writable` enforce:
  - Non-admins see ONLY their own calendar (filter is silently locked to self).
  - Non-admins cannot create / edit / delete an event owned by someone else (403).
  - Admins can pass `?user_id=…` or `?user_ids=a,b,c` to scope the grid and reassign ownership via PUT.
- **Startup migration** (`migrate_legacy_to_nasser`) maps every pre-multi-member event whose `user_id` is `wife` or `husband` to the first family admin of the same family, and mirrors `user_id → owner_member_id` for any other legacy rows. Idempotent.
- **Frontend** (`/app/frontend/src/pages/TimePlan.jsx` full rewrite + `EventDialog.jsx` / `DayDetailPopover.jsx` refactor):
  - Pill switcher driven by `/api/family/members`. Each pill shows the member's colour dot; non-admins see other pills disabled.
  - Family View dialog with per-member checkboxes, count badge, and "Only me" / "Show everyone" shortcuts.
  - Event bars now paint by owner colour (resolved via `colorFor(ev)` in the page).
  - `EventDialog` adds `canChangeOwner` + `currentMemberId` props; owner select disabled for non-admins.
  - `DayDetailPopover` accepts `canAddForOthers` + `canEditEvent` so non-admins lose edit/delete affordances on events they don't own.
  - Wall Board → Time Plan settings link survives for admins; legacy Profile-rename dialog removed from the Time Plan top bar (replaced by a shortcut to `/family-members`).
- **i18n**: 12 new `tp.familyView*` / `tp.viewingMember` / `tp.viewingFamily` / `tp.cantEdit/DeleteOthers` keys × EN / AR / DE.
- **Tested**: backend pytest **14/14 PASSED**, Playwright frontend E2E **8/8 PASSED** (auto-anchor on current member, second member auto-appears in switcher + filter, coloured dots match API, multi-overlay with badge, admin can create event for another member with that member's colour, non-admin pills disabled + Family View hidden + owner select disabled, AR + DE translations leak-free).


## Implemented (Feb 2026 — Member identity & avatars across the app)
- **Backend**: `family_members.avatar` field (Optional, base64 data URL). `MemberCreate` + `MemberUpdate` both accept it; an empty string on PUT explicitly clears the avatar back to "use first-letter fallback". The `/api/auth/member/select` payload returns the full member doc (including avatar + color + is_family_admin), and authorization rules are unchanged.
- **Frontend**:
  - New reusable `<MemberBadge />` + `<MemberAvatar />` component (`/app/frontend/src/components/MemberBadge.jsx`) — avatar (image OR colour swatch with initial), name, and a small "ADMIN" chip when `is_family_admin`.
  - New `fileToAvatarDataUrl()` helper (`/app/frontend/src/lib/imageUtils.js`) — centre-crops + resizes to 256px JPEG before encoding to base64 so payloads stay under ~30 KB.
  - Identity strip in every authenticated page: WallBoard (`wall-member-strip`), TimePlan (`tp-member-strip`, compact), HomeBudget (`budget-member-strip`), MyMoney (`my-money-member-strip`, in BOTH admin-index and personal-ledger branches), FamilyMembers (`family-members-member-strip`).
  - Family Members page: Add + Edit dialogs include `AvatarPicker` (file upload → resized base64, with Remove button); member rows render the new avatar (image OR colour-coded initial).
  - Welcome toast: `mfml_welcomed_<member_id>` sessionStorage flag → first WallBoard visit fires a localized `welcome.back` toast (`Welcome back, X` / `أهلاً بعودتك، X` / `Willkommen zurück, X`).
  - `auth.updateMember()` now refreshes the cached `mfml_member` if the caller edits themselves, so the header avatar/name updates instantly without re-login.
- **i18n**: 7 new keys (`members.avatar.*`, `welcome.back`) × EN / AR / DE.
- **Tested**: backend curl (POST avatar, PUT set, PUT clear-to-null, 403 cross-member). Frontend Playwright across iterations 7→8→9: **6/6 final expectations PASSED** — all 5 page strips resolve, welcome toast fires once per session per member, admin chip present for admins / absent for non-admins, cached-member refresh updates the header without re-login, AR + DE welcome strings render correctly.


## Implemented (Feb 2026 — "Recent activity by you" strip)
- **Backend**: new scoped collection `activity_log`. Two helpers seed it best-effort:
  - `server.log_activity(token, kind, payload)` covers event create / delete, kids-money income & payment, goal created, and the goal `is_complete: false → true` transition (the "reached your goal" moment).
  - `auth_module.build_family_router._log_activity` covers `member.added` / `member.promoted` / `member.demoted` / `member.deleted`.
- **Endpoint**: `GET /api/activity/recent?limit&scope` with `scope=self` (default — caller's own activity) and `scope=family` (admin-only family-wide feed). Limit clamps to 1..20.
- **Privacy**: scope=self filters by `member_id=token.mid`. scope=family is gated behind `fadmin=true` (403 otherwise). Multi-tenant isolation handled via the existing `ScopedCollection`.
- **Frontend** (`/app/frontend/src/components/RecentActivityStrip.jsx`): slim 3-item strip rendered under the WallBoard MemberBadge. Each row uses a localized template (`activity.event.created`, `activity.kids.income`, `activity.goal.completed`, `activity.member.added`, …) plus a relative-time stamp via `Intl.RelativeTimeFormat`. Hidden completely when the feed is empty so brand-new accounts don't see noise.
- **i18n**: 14 new `activity.*` keys × EN / AR / DE.
- **Tested**: backend pytest **13/13 PASSED** (empty list for fresh admin, event/kids-money/goal logging, transition-only goal.completed, scope=self isolation, scope=family for admin, 403 for child, default limit + cap at 20, cross-family isolation). Frontend Playwright PASSED — strip renders under wall-member-strip, items match EN / AR / DE templates with relative-time suffix, empty-state renders nothing.


## Implemented (Feb 2026 — Beta Terms / Privacy / Disclaimer gate)
- **Backend** (`auth_module.py`):
  - `RegisterPayload` now exposes `accepted_beta_terms`, `accepted_privacy_policy`, `accepted_disclaimer` (all default to `false`).
  - The register handler rejects the request with **400 "You must accept the Beta Terms, Privacy Notice and Disclaimer to continue"** unless all three are `true`.
  - On success a `consents` audit record is persisted on the account: `{accepted_beta_terms, accepted_privacy_policy, accepted_disclaimer, accepted_at, app_version}`.
  - `APP_VERSION` (env-overridable, defaults `0.9.0-beta`) and `APP_STAGE` (`beta`) constants.
  - New **`GET /api/auth/app/info`** returns `{name, version, stage}`. No auth required so the registration screen can read it.
- **Frontend**:
  - `BetaTerms.jsx` component renders three sections (Beta Notice, Privacy, Disclaimer) plus three consent checkboxes; the "Continue" button stays disabled until all three are ticked. `mode="register"` shows the checkboxes; `mode="view"` is read-only.
  - `Login.jsx` swaps in the gate before the register form: `if (isRegister && !consents) return <BetaTerms onAccept={setConsents}/>`. The submit handler forwards the three booleans to `/api/auth/register`.
  - New `/terms` route → `Terms.jsx` renders the same content in read-only mode for users who want to review what they agreed to.
  - WallBoard Settings dialog gained `wall-beta-version` chip + `open-terms-btn` link to `/terms`.
  - Shared `useAppInfo()` hook (`/app/frontend/src/lib/useAppInfo.js`) — module-level cache + in-flight de-dup so the three call-sites (gate, /terms, WallSettings) share a single network round-trip per session.
- **i18n**: 18 new `beta.*` keys × EN / AR / DE (815 keys/language balanced). Bullet lists are pipe (`|`)-separated strings split into `<li>` rows by the component so translators edit one string per language.
- **Tested**: backend pytest **6/6 PASSED** (app-info shape, 0/1/2/3 consents flows, no migration break for pre-existing accounts). Frontend Playwright PASSED end-to-end (account-type → BetaTerms gate → 3 ticks → register → member-select), `/terms` renders correctly in EN / AR / DE with 11 / 7 / 8 bullets, no raw key leaks, Settings chip + Terms link source-inspected and confirmed live.


## Fixed (Feb 2026 — 🚨 CRITICAL multi-tenant data-isolation audit & fix)
- **Reported leak**: a freshly-registered Family B saw Family A's event types (`KVD`, `Morning Dienst`, `Urlaub`), wall notes, and member names. Full audit traced the bug to (a) un-scoped frontend localStorage caches that survived account switches and (b) two legacy single-family backend endpoints.

- **Frontend (primary fix)** — every cache key is now prefixed with the current `family_id`:
  - New `/app/frontend/src/lib/familyCache.js` — `familyCache.read/write/remove` + `purgeAllFamilyCaches()` (also wipes any legacy keys still present from older builds).
  - `lib/api.js` — `getEventTypes` / `getEvents` use the family-scoped namespace; the "stale cache on error" fallback can no longer leak cross-tenant because the key is per-family.
  - `lib/wallApi.js` — `readCache/writeCache` + the offline mutation `wall_outbox` (catastrophic if replayed against the wrong family) both scoped via `OUTBOX_KEY_PREFIX = "wall_outbox:fam:"`.
  - `lib/locationApi.js` — GPS positions cache moved to `familyCache` namespace `locations`.
  - `lib/auth.js` — `register()`, `login()`, and `logout()` now call `purgeAllFamilyCaches()` so every account/family transition starts clean.

- **Backend (defense in depth)** — `/app/backend/server.py`:
  - `seed_users` startup hook **removed** (was upserting `wife`/`husband` into the active tenant's scoped `users` collection on every boot).
  - `GET /api/users`, `PUT /api/users/{id}`, `POST /api/auth/verify` now return **410 Gone** with a clear migration message — no more silent fallthrough to legacy single-family logic.
  - `GET/POST/PUT/DELETE /api/event-types` now require a **member token** (`require_member_token`) — closes the defence-in-depth gap where the route relied solely on the ScopedCollection raising 401 on first query.
  - New **`GET /api/diag/tenant`** (family-admin only, 403 otherwise). Returns `family_id`, `current_member`, `scoped_collection_counts` (this family), `orphan_records_no_family_id` (must always be 0), and `other_family_records_in_db` (counted but never readable from this scope — proves boundaries are intact).

- **Tested**: backend pytest **15/15 PASSED** (Families A/B/C cross-isolation across event types, events, members, wall notes, kids-money, budget; retired endpoints return 410; event-types unauth 401; diag/tenant admin-only). Frontend Playwright **PASSED** (purgeAllFamilyCaches scrubs `mfml_cache_*`, `family_locations_latest`, `wall_outbox`, `wall_cache:*`, and any `mfml_cache:fam:<other_id>:*` keys on login/register/logout; `/time-plan` for fresh Family B is clean — no KVD / Morning Dienst leakage; AR/DE still work).

- **Affected tables / collections**: `users` (legacy, now read-only), `event_types`, `events`, `wall_*`, `kids_money*`, `budget_*`, `shopping_items`, `activity_log` — all confirmed scoped by `family_id` via `ScopedCollection`, plus `/api/diag/tenant` available for ongoing monitoring.
- **Affected files**: `/app/frontend/src/lib/familyCache.js` (new), `lib/api.js`, `lib/wallApi.js`, `lib/locationApi.js`, `lib/auth.js`, `/app/backend/server.py`. Backend regression suite at `/app/backend/tests/test_tenant_isolation.py`.



## Fixed (Feb 2026 — 🚨 Hardcoded "Bahaa/Theresa" wallet bug)
- **Reported**: When a user named "Hds" logged in to a brand-new family, the Family Budget page still showed two hardcoded wallets — "Bahaa's Wallet" and "Theresa's Wallet" — instead of the actual family members. Root cause: the entire budget owner system was a fixed 3-value enum `{bahaa, theresa, shared}` baked into both backend Pydantic models / aggregation pipelines and frontend constants / translations.
- **Backend** (`server.py`): removed `OWNERS = {"bahaa", "theresa", "shared"}`. `_norm_owner` now accepts any non-empty string (family_member.id) or the literal `"shared"`. `/api/budget/summary` builds `by_owner.{income,expense,bills,debts,loans_remaining,loans_monthly,monthly_obligations,remaining}` dynamically — keys are now actual member ids + "shared", auto-seeded from the family's current `family_members` so every wallet always renders even before its first entry. A new top-level `wallet_owners` array returns `[{id, name, color, role, avatar, is_family_admin}, ...]` so the frontend has everything it needs to render the wallet cards in one round-trip.
- **Backend migration** (`migrate_legacy_to_nasser`): one-time idempotent remap for `budget_income/expenses/bills/debts/loans` — rows with `owner ∈ {"bahaa", "theresa"}` are rewritten to the actual matching member id (by case-insensitive name match against `family_members`, falling back to the first / second admin). Other families with non-legacy owners are untouched.
- **Frontend** (`lib/budgetApi.js`, `pages/HomeBudget.jsx`): replaced static `OWNERS` + `OWNER_COLORS` constants with helpers `paletteFromHex(hex)`, `buildOwnerColorMap(walletOwners)`, `ownerLabel(...)`. The HomeBudget page now renders one wallet card per family member dynamically (1-column grid for a single member, 2-column otherwise) using each member's auto-assigned palette color, and the WalletFilter pills + owner select in every entry editor are built from the same dynamic list. The owner badge resolves to the member's actual name.
- **i18n**: dropped `budget.owner.bahaa`, `budget.owner.theresa`, `budget.wallet.bahaa`, `budget.wallet.theresa` from EN / AR / DE. Added one parameterized key `budget.wallet.of` (`"{name}'s Wallet"` / `"محفظة {name}"` / `"Wallet von {name}"`).
- **Tested**: backend pytest **17/17 PASSED** (`tests/test_budget_owner.py` 2 new + 15 tenant isolation regression). Curl + Playwright screenshot confirmed: family "Hds" with one parent renders a single "Hds's Wallet" tile (blue) — no Bahaa/Theresa leakage; adding a second parent "Sara" causes "Sara's Wallet" (pink, auto-palette) to appear instantly; family 2 ("Sara only") never sees Hds.
- **Affected files**: `/app/backend/server.py`, `/app/frontend/src/lib/budgetApi.js`, `/app/frontend/src/pages/HomeBudget.jsx`, `/app/frontend/src/lib/translations.js`, `/app/backend/tests/test_budget_owner.py` (new).


## Implemented (Feb 2026 — Single Account flow activated)
The "Personal Account" option on the login screen was a placeholder (showed a "coming soon" toast and didn't do anything). The backend already had `account_type: "single"` defined as a reserved value — this entry **activates** the existing stub end-to-end without creating a parallel auth system.

**Backend** (`auth_module.py`):
- `POST /api/auth/register` now treats `account_type="single"` as a first-class flow. It still creates exactly one family doc (so every tenant-scoping invariant holds), then **auto-provisions a single member** (display name = supplied `family_name` or the email local-part, role `adult`, `is_family_admin=true`, server-managed PIN that the user never enters) and returns **both** `access_token` AND `member_token` in the same response. The frontend therefore skips the "Who are you?" screen.
- `POST /api/auth/login` mirrors the same fast-path: if `family.account_type == "single"` it looks up the lone member and adds `member_token` + `member` to the response.
- New `POST /api/auth/upgrade-to-family` (account-token only): flips `account_type` from `single → family`, renames the family, preserves the auto-created member as the founding family admin. Returns 400 if the family is already `family`-type or the supplied name is blank.
- New constant `SINGLE_DEFAULT_PIN` used to back the auto-member.

**Frontend** (`lib/auth.js`, `pages/Login.jsx`):
- `register()` + `login()` now also persist `member_token`/`member` when the backend ships them, so the route guard sees a fully authenticated session immediately.
- New helper `isSingleAccount()` reads `getFamily()?.account_type === "single"`.
- New API helper `upgradeToFamily(familyName)` calls the new endpoint and refreshes the cached family doc.
- `AccountTypeScreen`: the "Personal Account" tile is no longer a stub — clicking it routes to the auth screen with `accountType="single"`. The toast/`auth.type.singleSoon` key is no longer used.
- `AuthScreen`: the register form receives the new `accountType` prop. For `single`, the "Family Display Name" field becomes "Your Name" (`auth.field.displayName`, optional), and the register payload includes `account_type: "single"`. After a successful single-account register/login, `Login`'s `handleAuthSuccess` notices the `member_token` already issued and navigates straight to `/` instead of pushing the user through the PIN gate.

**Single-account UI surfaces** (hide every family-only affordance):
- **WallBoard** (`pages/WallBoard.jsx`): hides `<FamilyMapCard />` (GPS sharing only makes sense across members). The Settings dialog drops "Manage family members" + "Kids' Money" and, in their place, exposes a new **"Upgrade to Family Account"** button that opens `UpgradeToFamilyDialog` (asks for the family name, calls `upgradeToFamily(...)`, then full-reloads the page so every other component re-derives `isSingleAccount()`).
- **Time Plan** (`pages/TimePlan.jsx`): hides the per-member pill switcher, the "Family View" filter button, and the top-bar "Manage family members" shortcut.
- **Family Budget** (`pages/HomeBudget.jsx`): drops the "Shared Expenses" KPI, renames "Family Dashboard" → "Dashboard", hides the per-member wallet card grid (only one member exists), hides the wallet filter pills, hides the per-row Owner badge accent, and removes the "owner" select from every entry editor (the value is auto-populated with the single member's id).
- **Family Members page** (`pages/FamilyMembers.jsx`): added a redirect to `/` for single accounts (in addition to the existing non-admin guard).

**i18n**: 6 new keys × EN / AR / DE — `auth.type.singleDesc`, `auth.field.displayName`, `auth.field.displayNamePh`, `auth.toast.welcomeSingle`, `auth.upgrade.button` / `.title` / `.desc` / `.confirm` / `.toast`, `budget.dashboard.titleSingle`. The legacy `auth.type.singleSoon` / `auth.type.comingSoon` keys are left intact (read by no callsite now) so older translations don't crash.

**Tested**: backend pytest **23/23 PASSED** total — 6 new in `tests/test_single_account.py` (register both-tokens, email-localpart fallback, login both-tokens, single wallet only, upgrade flip, upgrade re-attempt 400, empty-name 400) + the existing 15 tenant isolation + 2 budget owner suites. Playwright screenshots confirm: single-account `/` (no FamilyMap, no "Manage family members" in Settings, **"Upgrade to Family Account"** button visible), `/home-budget` ("Dashboard" title, one wallet, no shared-expenses tile, no wallet filter), `/time-plan` (no member switcher, no Family View, no Manage Family Members link).

**Affected files**: `/app/backend/auth_module.py`, `/app/backend/tests/test_single_account.py` (new), `/app/frontend/src/lib/auth.js`, `/app/frontend/src/pages/Login.jsx`, `/app/frontend/src/pages/WallBoard.jsx`, `/app/frontend/src/pages/TimePlan.jsx`, `/app/frontend/src/pages/HomeBudget.jsx`, `/app/frontend/src/pages/FamilyMembers.jsx`, `/app/frontend/src/lib/translations.js`.


## Implemented (Feb 2026 — Single-Account UX: personalize the Wall Board)
Single accounts were functionally complete but the Wall Board still read like a family page (hero said "Together We Build Beautiful Memories", section titles said "Our Goals" / "Family Events", empty states said "Write the first message for your family"). This pass swaps every family-flavoured surface to a self-focused variant **only when `family.account_type === "single"`**. Family accounts are untouched.

**Backend** (`server.py`):
- `WallSettings` model defaults flipped from English literals (`"Together We Build Beautiful Memories"`, `"Our Family, Our Dreams, Our Happiness"`, `"Message of the Day"`) to empty strings. The frontend now controls the visible copy via i18n + the `||` fallback to `t("hero.defaultTitle"[.single])`.
- New one-time **migration step 7** in `migrate_legacy_to_nasser`: scrubs the three legacy English strings out of every existing `wall_settings` row (the run after deploy cleared **41 rows** — 14 hero_title + 14 hero_subtitle + 13 message_title — across all families). Custom user-saved strings are preserved.

**Frontend WallBoard** (`pages/WallBoard.jsx`):
- New `isSingle = isSingleAccount()` flag + `tS(key)` helper (returns `t("<key>.single")` for personal accounts, falls back to base key otherwise) so every single-aware string is one-call away.
- Above the hero: brand-new **single-account welcome strip** (`<MemberAvatar /> + "Welcome, <name>" / "Have a great day"`, `data-testid="single-welcome-strip"`). Replaces the family `MemberBadge` + `RecentActivityStrip` block for single users only.
- Hero card: in single mode the default title becomes "Organize your day, reach your goals", subtitle becomes "All your plans, notes, and tasks in one place", placeholder becomes "Tap edit to add a cover photo", `alt` becomes "Cover" and the pink heart icon is dropped from the title row.
- Hero editor dialog: title / description / image label / placeholders all switch via the new `isSingle` prop (now passed in by the page).
- Section titles wired through `tS("section.*")`: `My Daily Note` / `My Photos` / `My Goals` / `My Events` / `My Notes` / `My Achievements` (and AR / DE equivalents below).
- Empty states wired through `tS("empty.message")` + `tS("empty.familyEvents")`: "Write your first note." / "No upcoming events yet." (instead of family copy).

**i18n** — 32 new keys × 3 languages, all suffixed `.single`:
- Hero: `hero.editTitle.single`, `hero.editDesc.single`, `hero.familyPhoto.single`, `hero.defaultTitle.single`, `hero.defaultSubtitle.single`, `hero.tapToAdd.single`.
- Welcome strip: `wallboard.welcome.single` (param `{name}`), `wallboard.welcomeSub.single`.
- Sections: `section.message.single`, `section.photo.single`, `section.goals.single`, `section.familyEvents.single`, `section.notes.single`, `section.achievements.single`.
- Empty states: `empty.message.single`, `empty.message.add.single`, `empty.familyEvents.single`.
- Translations in EN + AR (the user's primary language) + DE.

**Verified** (Playwright on https://family-timeplan.preview.emergentagent.com/, viewport 420×1500):
- **Single AR**: welcome strip `مرحباً Layla / نتمنى لك يوماً سعيداً`, hero `نظّم يومك وحقّق أهدافك / كل خططك وملاحظاتك ومهامك في مكان واحد`, `روتيني / ملاحظتي اليومية / صوري`. ✅
- **Single EN**: `Welcome, Layla / Have a great day`, `Organize your day, reach your goals / All your plans, notes, and tasks in one place`, `Tap edit to add a cover photo`, `My Routines / My Daily Note / My Photos / Write the first message…` (wait — empty state for single also updated). ✅
- **Family EN** (regression): unchanged — old hero copy + heart icon, Family Map card, member badge + recent activity strip all intact. ✅
- Backend pytest **23/23 PASSED** unchanged. Wall-settings migration ran cleanly on startup (logged in `backend.err.log`).

**Affected files**: `/app/backend/server.py` (model defaults + migration step 7), `/app/frontend/src/pages/WallBoard.jsx` (welcome strip, `isSingle`/`tS`, hero + sections + empty states), `/app/frontend/src/lib/translations.js` (32 new keys × EN/AR/DE).


## Implemented (Feb 2026 — Public legal pages: Privacy / ToS / Legal Notice)
Three brand-new public routes for compliance and EU/DE imprint requirements. Reachable with or without authentication, indexed for SEO, and cross-linked through a permanent footer.

**Routes** (all public — registered in `App.js` outside any `RequireAuth`):
- `/privacy` → `PrivacyPolicy.jsx` (Shield icon)
- `/terms-of-service` → `TermsOfService.jsx` (FileText icon)
- `/legal-notice` → `LegalNotice.jsx` (Scale icon)
The existing `/terms` (beta-consent review) is kept untouched.

**Shared layout** (`components/LegalLayout.jsx`):
- `LegalLayout`: sticky top bar with "Back to Home" button + brand chip, breadcrumb (`Home › <Page>`), icon-prefixed hero (3xl→5xl heading, sub-text, auto `Last Updated: <today, en-GB>`), white rounded content card, `LegalFooter`.
- `LegalFooter`: `© <year> My Life My Time. All rights reserved.` + `Privacy Policy | Terms of Service | Legal Notice | info@mylife-mytime.com` (data-testid `site-footer`).
- Helpers `Section / P / Bullets / MailLink` so each page reads like a document, not JSX soup.
- Exports `LEGAL_LINKS` (id + label + testid array) consumed by both the Login footer strip and the Wall Board Settings dialog.
- Responsive grid: max-w-4xl on desktop, full-width on mobile (sm:px-6 / px-4). Dark-mode tokens (`dark:bg-[#15140F]`, `dark:text-white/90`, `dark:border-white/10`) auto-applied via `prefers-color-scheme`.

**SEO + Open Graph** (`lib/usePageMeta.js`):
- Tiny hook (no react-helmet dep). Looks up existing `<meta name="..."/>` or `<meta property="..."/>` tags BY their natural selector and updates `content` in-place, so static defaults in `index.html` stop competing with the page-level overrides. On unmount the original content is restored.
- Sets `document.title`, `meta[name="description"]`, `og:title`, `og:description`, `og:type`, `og:url` (current `window.location.href`), `og:image`, `twitter:card="summary_large_image"`, `twitter:title`, `twitter:description`. WhatsApp / Facebook share previews now render the correct per-page title and description.

**Login page** (`pages/Login.jsx`):
- New `<LoginLegalLinks />` strip ("Privacy Policy | Terms of Service | Legal Notice") rendered at the bottom of every Login shell — Account Type screen, Auth screen, Member Select screen — so the legal pages are reachable before the user signs in.

**Authenticated reach** (`pages/WallBoard.jsx`):
- Wall Board Settings dialog footer now also lists the three legal links beside the version chip (`data-testid="settings-legal-links"`). From any authenticated page, the Settings cog → legal pages are 2 taps away.

**Verified** on https://family-timeplan.preview.emergentagent.com/:
- `/privacy`, `/terms-of-service`, `/legal-notice` render on desktop (1440px) and mobile (420px) with full content, working Back to Home, breadcrumb, and footer.
- `document.title` switches per page (`"Privacy Policy · My Life My Time"`, etc.) and `og:title` / `og:description` mirror the title — no stale "My Life My Time" leaking through.
- Footer link click navigates between pages instantly; current page is shown in a darker tint via React Router styling.
- Login page shows the legal strip cleanly under the © brand line.
- Backend regression: pytest 23/23 PASSED unchanged.

**Affected files**:
- New: `/app/frontend/src/lib/usePageMeta.js`, `/app/frontend/src/components/LegalLayout.jsx`, `/app/frontend/src/pages/PrivacyPolicy.jsx`, `/app/frontend/src/pages/TermsOfService.jsx`, `/app/frontend/src/pages/LegalNotice.jsx`.
- Updated: `/app/frontend/src/App.js` (3 new public routes + imports), `/app/frontend/src/pages/Login.jsx` (legal links strip × 3 shells, `LEGAL_LINKS` import), `/app/frontend/src/pages/WallBoard.jsx` (legal links in Settings dialog, `Link` + `LEGAL_LINKS` imports).


## Implemented (Feb 2026 — Full rebrand to "My Life My Time")
Single-pass rebrand from the older "My Family My Life" / interim "My Family My Time" identity to the official **My Life My Time** name with the domain mylife-mytime.com. Functions, database, and internal route paths untouched; only branding/copy and `wall_settings` legacy defaults were rewritten.

**Bulk rename** (sed pass across `frontend/src`, `frontend/public`, `backend`, `memory`):
- `My Family My Life` → `My Life My Time`
- `My Family My Time` → `My Life My Time`
- `MY FAMILY MY LIFE` → `MY LIFE MY TIME`
- `MY FAMILY MY TIME` → `MY LIFE MY TIME`

**Hero copy & brand-line keys** (`frontend/src/lib/translations.js`, EN / AR / DE):
- `app.appName`: `My Life My Time` (EN/DE) · `حياتي وقتي` (AR)
- `app.brandLine1`: `My Life` (EN/DE) · `حياتي` (AR)  *(top-bar uppercase eyebrow)*
- `app.brandLine2`: `My Time` (EN/DE) · `وقتي` (AR)  *(top-bar heading)*
- `hero.defaultTitle` / `.single` (both pinned to the brand name):
  - EN/DE: `My Life My Time`
  - AR: `حياتي وقتي`
- `hero.defaultSubtitle` / `.single` (per-language slogan):
  - EN: `Organize your life, manage your time, achieve your goals.`
  - AR: `نظم حياتك، أدر وقتك، وحقق أهدافك.`
  - DE: `Organisiere dein Leben, verwalte deine Zeit und erreiche deine Ziele.`
- `auth.chooseType.desc` (AR): `كيف ستستخدم تطبيق حياتي وقتي؟`

**Top-bar logo** (`pages/WallBoard.jsx`): the hard-coded `<p>My Family</p><p>My Life</p>` block now reads from `t("app.brandLine1")` / `t("app.brandLine2")`, so the eyebrow + heading switch with the active language (EN → "MY LIFE / My Time", AR → "حياتي / وقتي", DE → "MY LIFE / My Time").

**Static SEO/PWA assets**:
- `frontend/public/index.html`: `<title>My Life My Time</title>`, `meta[name=description]` + `og:title` + `og:description` + `twitter:title` + `twitter:description` all updated to the new tagline.
- `frontend/public/manifest.json`: `name="My Life My Time"`, `short_name="My Life My Time"`, `description` rebranded.

**Backend migration step 8** (`backend/server.py`): on startup the new pass also scrubs the short-lived v2 hero defaults (`"Organize your day, reach your goals"`, `"All your plans, notes, and tasks in one place"`) out of `wall_settings`, so every existing family now picks up the new "My Life My Time" copy from i18n instead of the stale per-row strings. Custom user-saved hero text is preserved untouched.

**Verified**:
- Backend pytest **23/23 PASSED** (tenant isolation + single account + budget owner regressions, unchanged).
- Playwright screenshots on https://family-timeplan.preview.emergentagent.com/:
  - `/login` (logged out) — Logo "My Life My Time", subtitle "How will you use My Life My Time?", footer "© My Life My Time · Built with care".
  - `/privacy` — top-bar brand "MY LIFE MY TIME", title `Privacy Policy · My Life My Time`, body text mentions "My Life My Time".
  - `/` Wall Board (EN, single) — Top-bar logo "MY LIFE / My Time", Hero "My Life My Time / Organize your life, manage your time, achieve your goals.", Welcome strip "Welcome, Layla / Have a great day".
  - `/` Wall Board (AR, single) — Top-bar logo "حياتي / وقتي", Hero "حياتي وقتي / نظم حياتك، أدر وقتك، وحقق أهدافك.", Welcome strip "مرحباً Layla / نتمنى لك يوماً سعيداً".
- `document.title` and `og:title` switch per-page via the `usePageMeta` hook (Legal pages add `· My Life My Time` suffix automatically).

**Affected files**:
- `/app/frontend/src/lib/translations.js` (EN/AR/DE brand keys + hero defaults + chooseType subtitle).
- `/app/frontend/src/pages/WallBoard.jsx` (top-bar logo now reads `app.brandLine1/2`).
- `/app/frontend/public/index.html` + `manifest.json` (static SEO/PWA metadata).
- `/app/backend/server.py` (migration step 8 — clear v2 hero defaults).
- Plus the sed pass touched every file that mentioned the old names — auth_module.py, tenant.py, server.py headers, Dashboard.jsx, LegalLayout.jsx, LegalNotice.jsx, PrivacyPolicy.jsx, TermsOfService.jsx, Login.jsx, WallBoard.jsx, service-worker.js, beta_terms test, backend_test, PRD.md.


## Implemented (Feb 2026 — Google Analytics 4 integration)
GA4 measurement ID **`G-QS0W3Z2484`** added to the live build. Tracks page views, sessions, button clicks, form submissions, and contact requests across every route — works both on the preview domain and on https://mylife-mytime.com. Async-loaded, zero perceptible render impact.

**Static loader** (`frontend/public/index.html`, in `<head>`):
- `<script async src="https://www.googletagmanager.com/gtag/js?id=G-QS0W3Z2484"></script>` (async, non-blocking).
- Inline `dataLayer` + `gtag()` shim immediately after, so React code can call `window.gtag(...)` even before the remote script finishes downloading (calls are queued in `dataLayer`).
- `gtag('config', 'G-QS0W3Z2484', { send_page_view: false, anonymize_ip: true, cookie_flags: 'SameSite=None;Secure' })`. We disable GA's automatic page_view because we own SPA navigation; firing both would double-count every route change.

**Analytics helper** (`frontend/src/lib/analytics.js`):
- `trackEvent(name, params)` — safe wrapper, no-ops when gtag isn't loaded (ad-blockers, offline, SSR). Never throws — analytics MUST NOT break the page.
- `trackPageView(path)` — fires `event: page_view` with `page_path`, `page_location`, `page_title`, `send_to: G-QS0W3Z2484`.
- `useRouteAnalytics()` — React hook mounted once inside `<BrowserRouter>` (via the tiny `<RouteAnalytics />` component in `App.js`). Fires `page_view` on every `useLocation()` change, scheduled via `requestAnimationFrame` so it never competes with the route's own paint work.
- `initGlobalEventDelegation()` — installs ONE capture-phase `click` and `submit` listener on `document` (idempotent, run at module import). Handles:
  - Any element with `data-ga-event="<name>"` → fires `<name>` with optional `data-ga-<key>` extras.
  - Plain `<button>` clicks → `button_click` with `label` (aria-label / data-testid / textContent, truncated to 80 chars).
  - `<a href="mailto:...">` clicks → `contact_request { method: 'email', email, label }`.
  - External `<a href="https?://...">` clicks → `outbound_click { link_url, label }`.
  - `<form>` submits → `form_submit { form_name }` from `data-ga-form` / `name` / `data-testid`.
  - The delegated approach means we did NOT have to sprinkle `trackEvent()` calls across every page — wiring is centralised.

**Sessions**: GA4's Enhanced Measurement handles `session_start` and `user_engagement` automatically on the GA side. No client code required.

**Live verification** (Playwright on the preview deploy):
- Loading `/login` → `gtag` present, GA script tag present, **1 `page_view`** event in `dataLayer` with `page_title='My Life My Time'`, `page_path='/login'`.
- Clicking the footer "Privacy Policy" link (SPA nav) → **2 `page_view`** events total; second one carries `page_path='/privacy'`, `page_title='Privacy Policy · My Life My Time'`. Confirms route-change tracking works.
- Clicking the `mailto:` footer link → **1 `contact_request`** event: `{method: 'email', email: 'info@mylife-mytime.com', label: 'info@mylife-mytime.com'}`.
- Clicking the "Personal Account" tile + submitting the login form with bad creds → **2 `button_click`** (`label: pick-single`, `label: login-submit`) + **1 `form_submit`** (`form_name: login-form`).

**Performance & privacy notes**:
- Loader is `async`, no `defer`, no render-blocking CSS dependency. Lighthouse-style smoke: first contentful paint of `/login` unchanged (~ same as before).
- `anonymize_ip: true` is set (legacy flag, still respected by GA4 for IP truncation).
- **GDPR / Karlsruhe consideration**: tracking starts on first visit per the user's explicit request. If you later need explicit consent before any GA hit, switch the config to call `gtag('consent', 'default', { analytics_storage: 'denied' })` immediately, then `gtag('consent', 'update', { analytics_storage: 'granted' })` only after the user accepts a cookie banner. The helper API and event delegation stay identical.

**Affected files**:
- `/app/frontend/public/index.html` (GA4 loader + config in `<head>`).
- `/app/frontend/src/lib/analytics.js` **(new)** — helper + hook + global delegation.
- `/app/frontend/src/App.js` (init delegation at module load + mount `<RouteAnalytics />` inside `<BrowserRouter>`).

Backend untouched. Database untouched. Backend pytest **23/23 PASSED** (regression).


## Implemented (Feb 2026 — Legal & Content Management dashboard)
Admin can now edit every legal/brand string of the site from a dedicated dashboard, and the public legal pages pull their content from the database — no redeploy required for copy changes.

**Backend** (`server.py`):
- New collection `site_content` (singleton doc keyed by `_key="global"`). Tenant-isolation N/A — this is site-wide content.
- New Pydantic models `SiteContent` (10 fields) and `SiteContentUpdate` (all optional → partial PATCH semantics).
- `DEFAULT_SITE_CONTENT` constant holds production-ready defaults for all four legal texts so a brand-new install still renders text. The helper `_read_site_content()` merges the DB doc with the defaults: explicit empty strings from the admin transparently fall back to the default value (gives admin a "reset this field" gesture).
- `GET /api/site-content` — **public**, no auth, returns the merged document. Used by Privacy / ToS / Legal Notice / Disclaimer pages.
- `PUT /api/site-content` — **admin-only** via `require_admin` dependency. Accepts a partial body; only fields actually sent are persisted. Returns the updated merged doc + an `updated_at` ISO timestamp and `updated_by` (admin account id) audit trail.

**Frontend**:
- `src/lib/siteContent.js` — tiny axios wrapper: `getSiteContent()` (public, returns `null` on failure for graceful degradation) + `updateSiteContent(patch)` (admin, sends only changed fields).
- `src/pages/AdminContent.jsx` — new admin route `/admin/content`. Sticky top bar with Back / Reset / Save, top-level "unsaved changes" indicator, then five cards: **Brand & Contact** (6 short fields in a 2-col grid: app_name / app_version / company_name / contact_email / phone_number / address textarea) + **Privacy Policy** + **Terms of Service** + **Legal Notice** + **Disclaimer** (each a tall textarea). Auto-computed patch = diff vs the last-loaded snapshot, so Save is disabled until something actually changed and we only PATCH the diff.
- `src/components/ContentRenderer.jsx` — converts the admin's plain text into a structured page: blocks separated by blank lines, lines starting with `- ` become bullet lists, single-line short blocks followed by content become `<h2>` section headings, bare emails auto-link to mailto. Zero-friction editor (no Markdown required), formatted output.
- `src/pages/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `LegalNotice.jsx` — rewritten to fetch `/api/site-content` once on mount and render the appropriate field through `<ContentRenderer>`. Layout (icon hero, breadcrumb, Back to Home, footer) untouched.
- `src/pages/Disclaimer.jsx` — brand-new public page at `/disclaimer`, same pattern as the other three.
- `src/components/LegalLayout.jsx` — `LEGAL_LINKS` extended with `/disclaimer`. The shared footer + Login legal strip + Settings dialog legal strip ALL pick up the new link automatically.
- `src/pages/Admin.jsx` — new "Content" button in the admin top bar (FileText icon) routing to `/admin/content`.
- `src/App.js` — registered `/disclaimer` and `/admin/content` routes.

**Tested**:
- Backend pytest **27/27 PASSED** (4 new in `tests/test_site_content.py` — GET public + all-keys present + non-empty defaults / PUT auth gates (401 + 403 for non-admin) / PUT partial + round-trip / empty body 400) + 23 existing regressions unchanged.
- Live curl + Playwright:
  1. `PUT /api/site-content` with `{disclaimer:"...custom...", app_version:"1.0.0-rc1", phone_number:"+49 …"}` as admin → 200 + updated doc.
  2. Public `GET /api/site-content` returns the custom values.
  3. `/disclaimer` page renders the custom disclaimer with "Key Points" auto-detected as `<h2>`, bullet list rendered properly, email auto-linked.
  4. `/admin/content` shows all 6 brand fields pre-populated, 4 long textareas, sticky Save / Reset header.
- Auth: non-admin token → 403, no token → 401 (verified).

**Affected files**:
- New: `/app/backend/tests/test_site_content.py`, `/app/frontend/src/lib/siteContent.js`, `/app/frontend/src/pages/AdminContent.jsx`, `/app/frontend/src/pages/Disclaimer.jsx`, `/app/frontend/src/components/ContentRenderer.jsx`.
- Modified: `/app/backend/server.py` (new endpoints + model + defaults), `/app/frontend/src/pages/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `LegalNotice.jsx` (now read from DB), `/app/frontend/src/components/LegalLayout.jsx` (+ Disclaimer link), `/app/frontend/src/pages/Admin.jsx` (Content button), `/app/frontend/src/App.js` (2 new routes).


## Implemented (Feb 2026 — GA4 production audit & hardening)
User reported "zero events" in the GA4 dashboard for `G-QS0W3Z2484` on https://mylife-mytime.com. **Live audit proved the integration IS working** — events reach Google with HTTP 204 success. Issue is on the GA4 dashboard side. Code was also hardened to make future verification easier.

**Audit findings (https://mylife-mytime.com production)**:
- ✅ GA4 loader present in deployed HTML.
- ✅ `gtag('config', 'G-QS0W3Z2484', { send_page_view: false, anonymize_ip: true, cookie_flags: 'SameSite=None;Secure' })` inline.
- ✅ Playwright captured **4 POSTs** to `https://www.google-analytics.com/g/collect?tid=G-QS0W3Z2484&...`, **all returning HTTP 204** (Google's success response).
- ✅ Event names: `page_view`, `structured_data`, `manual_beacon_test`.
- ✅ No CSP headers blocking google-analytics.com / googletagmanager.com. No console errors. Cookies/CID assigned.
- **Conclusion**: deployment is firing events correctly. "0 events" view = GA4-side issue (Realtime delay, DebugView vs Realtime, data-stream filters, new-property indexing delay).

**Code hardening** (`frontend/src/lib/analytics.js`):
1. **Debug mode** — append `?ga_debug=1` to any URL → reissues config with `debug_mode: true`, every event tagged debug, verbose console log. Verifies in GA4 → Admin → DebugView in real time.
2. **Beacon transport** — every event sets `transport_type: 'beacon'`, so hits survive page unloads during SPA navigation / logout.
3. **Build tag** — every event carries `analytics_build: 'mlmt-2026.02.05'` to filter audit traffic out of production reports.
4. **Race-condition fix** — `useRouteAnalytics` waits 60 ms and double-checks `window.location` before firing `page_view`. Eliminates the classic SPA double-count where `/` fires before a `<Navigate>` redirects to `/login`.

**How to verify**:
1. Visit `https://mylife-mytime.com/?ga_debug=1` → DevTools Console shows `[GA4] page_view ...` logs.
2. DevTools → Network → filter `collect` → see `POST .../g/collect?...&tid=G-QS0W3Z2484` returning **204**.
3. GA4 → Admin → **DebugView** populates within 30 s.
4. Realtime reports: 1–5 min. Standard reports: up to 48 h on new properties.

**Affected files**: `/app/frontend/src/lib/analytics.js` (hardening). Backend untouched, 27/27 tests still pass.


## Implemented (Feb 2026 — GDPR Account Deletion / إنهاء العضوية)
Two-phase, soft-then-hard delete with a 30-day grace window. Family admin only (account-token holder).

**Backend** (`server.py`):
- `POST /api/account/request-delete` — requires the account password + one of the localized phrases (`DELETE` / `حذف` / `LÖSCHEN` / `LOSCHEN`). Flips `accounts.status` and `families.status` to `deletion_requested`, sets `deletion_requested_at` + `scheduled_permanent_delete_at` (+30 days). Idempotent — second call returns `already_requested=true` with the original schedule. Returns 400 on wrong phrase, 401 on wrong password.
- `POST /api/account/cancel-delete` — restores `status="active"` and clears the schedule. Re-enables full access on the next login.
- `GET /api/account/deletion-status` — used by the frontend to drive the cancel banner / countdown.
- `_purge_account_data()` + `_purge_overdue_deletions()` background task (runs immediately at startup then every 6h). Walks every tenant collection (`TENANT_COLLECTIONS`: 23 collections incl. wall_*, budget_*, routines, GPS, kids_money*, activity_log, shopping, locations) + account-scoped (`recovery_codes`, `login_attempts`, `password_resets`), then deletes the family + account documents. **Writes a legal-only `deletion_audit` row** with `{account_id, hashed_email (bcrypt), account_type, deletion_requested_at, permanently_deleted_at, reason: "user_request", counts}`. No photos, names, or personal content retained.

**Tenant middleware** (`tenant.py`):
- `install_middleware(app, jwt_secret, db=raw_db)` upgraded with a deletion-lock allowlist. Any `/api/*` request whose family is `deletion_requested` is rejected with **HTTP 423 Locked** + `{detail: {code: "account_pending_deletion"}}`. Allowlist: `/api/account/cancel-delete`, `/api/account/request-delete` (for idempotency), `/api/account/deletion-status`, `/api/auth/*`, `/api/admin/*`, `/api/diag/*`. This guarantees a deletion-flagged user can no longer mutate ANY data, but can still log in, see the countdown, and cancel.

**Auth** (`auth_module.py`):
- Login now accepts `family.status ∈ {active, deletion_requested}` so the user can sign back in to cancel. When `pending_deletion=true`, the response **omits** `member_token` and adds `pending_deletion`, `deletion_requested_at`, `scheduled_permanent_delete_at` so the frontend can route the user to the dedicated locked page.
- `POST /api/auth/member/select` rejects deletion_requested accounts with 423 — no PIN unlock during the grace window.

**Frontend** (3 new touches):
- `lib/auth.js` — `requestAccountDeletion(password, confirm)`, `cancelAccountDeletion()`, `fetchDeletionStatus()`.
- `pages/WallBoard.jsx` — `DeleteAccountDialog` component + red "Delete Account" entry in WallSettingsDialog (visible only when `getCurrentMember()?.is_family_admin === true`). Submit button stays disabled until the user types one of the localized phrases AND a password. On success: shows toast → logs out → /login.
- `pages/PendingDeletion.jsx` (new) — landing page at `/account/pending-deletion`. Shows scheduled permanent-delete date, days-left chip, Cancel Deletion button, Sign Out, mailto help. After successful cancel: logs out → /login (user re-authenticates against the now-active account).
- `pages/Login.jsx` — `handleAuthSuccess` routes to `/account/pending-deletion` when `data.pending_deletion === true`.
- `App.js` — new public route `/account/pending-deletion`.

**i18n**: 28 new keys × EN/AR/DE — `account.delete.*` (12 keys: button, title, intro, whatGoes, items pipe-list, familyAdminOnly, graceTitle, graceDesc, legalRetention, passwordLabel, passwordPh, confirmLabel, confirmHelp, confirmPh, submit, submitting, cancel, errorPhrase, errorPassword, errorGeneric, toast), `account.pending.*` (10 keys: title, desc with {date}, daysLeft / .one, cancelBtn, cancelling, cancelled, signOut, helpEmail, locked).

**Verified**:
- Backend pytest **8/8 PASSED** (`tests/test_account_deletion.py`): wrong-phrase 400, wrong-password 401, request locks data routes (423 on `/api/wall/notes`), deletion-status, login returns pending_deletion flag, cancel restores access + re-issues member_token, localized phrases all accepted, idempotent request, force-purge wipes account+family+wall_notes and writes deletion_audit with bcrypt-hashed email.
- Existing regressions still green: `test_single_account.py` 6/6, `test_tenant_isolation.py` 15/15, `test_budget_owner.py` 2/2, `test_site_content.py` 4/4, `test_beta_terms.py` 6/6 — total **41/41 passing**.
- Playwright UI end-to-end PASSED: register single account → WallBoard → Settings cog → "Delete Account" red button → DeleteAccountDialog with warning + bullet list + password + DELETE phrase → submit → logged out → /login → re-login returns pending_deletion=true → `/account/pending-deletion` shows the days-left chip + Cancel button + Sign Out + help mailto → Cancel deletion → /login → re-login succeeds normally with member_token → WallBoard renders. EN/AR/DE all render correctly (no raw key leaks, `<html dir="rtl">` set for Arabic).

**Affected files**:
- New: `/app/frontend/src/pages/PendingDeletion.jsx`, `/app/backend/tests/test_account_deletion.py`.
- Updated: `/app/backend/server.py` (endpoints + purge loop), `/app/backend/auth_module.py` (login accepts deletion_requested status), `/app/backend/tenant.py` (middleware deletion-lock allowlist), `/app/frontend/src/lib/auth.js` (3 helpers), `/app/frontend/src/lib/translations.js` (28 keys × 3 langs), `/app/frontend/src/pages/WallBoard.jsx` (DeleteAccountDialog + button), `/app/frontend/src/pages/Login.jsx` (route to pending-deletion), `/app/frontend/src/App.js` (new route).



## Implemented (Feb 2026 — Email Verification & Forgot Password)

End-to-end email-verification gate + email-link password reset + Admin SMTP settings, with full EN/AR/DE localization. Existing accounts are backfilled to `email_verified=true` so no legacy regression.

**Architecture choice**:
- **Storage**: New `email_tokens` collection — `{id, kind: "verify"|"reset", account_id, email, token_hash, expires_at, used}` with TTL index on `expires_at` (Mongo auto-purges expired rows) and indexed lookup on `token_hash`.
- **Hashing**: SHA-256 (not bcrypt). Tokens are 256 bits of `secrets.token_urlsafe` randomness, so the bcrypt KDF would only buy a 16-second response time on invalid-link probes — pure UX/perf loss with no security gain. SHA-256 + Mongo index → O(1) lookups, <200 ms even on a wrong token.
- **Rate limiting**: `email_send_attempts` collection — `{identifier: "verify:email" or "reset:email", count, first_attempt}`. 3 sends per 15-minute window; 4th → HTTP 429. Window slides — first send outside the window resets the counter.
- **Lifetimes**: Verification token 24 h, reset token 30 min (user-configured).
- **SMTP**: BYO via `email_settings` singleton (admin-edited). Password is **write-only** — GET returns `smtp_password_set: bool`, PUT keeps the existing pw when the masked placeholder (`********`) is submitted, explicit empty string clears it.

**Endpoints**:
- `POST /api/auth/register` → now returns `{verification_sent: true, email_verified: false, email}` and **no tokens**. The verification email is sent best-effort.
- `POST /api/auth/login` → 403 with `detail.code = "email_not_verified"` for unverified accounts (admin role bypasses).
- `POST /api/auth/verify-email` — `{token}` → flips `email_verified=true`, marks the token `used`.
- `POST /api/auth/resend-verification` — `{email, lang}`, rate-limited 3/15 min. Anti-enumeration: 200 for unknown emails. Returns `{already_verified: true}` for verified ones.
- `POST /api/auth/forgot-password` — `{email, lang}` → sends an email-link reset (anti-enumeration: always 200).
- `POST /api/auth/reset-password` — `{token, new_password}` → updates the password, invalidates any other outstanding reset tokens for the same account, clears any pending login lockout.
- `GET /api/admin/email-settings`, `PUT /api/admin/email-settings`, `POST /api/admin/email-settings/test` — admin-only SMTP configuration + test send.

**Frontend** (5 new pages + 1 wired-in stage):
- `pages/VerifyEmail.jsx` (route `/verify-email?token=…`) — calls the API, shows success or fail card.
- `pages/ForgotPassword.jsx` (route `/forgot-password`) — email input → "check your inbox" confirmation.
- `pages/ResetPassword.jsx` (route `/reset-password?token=…`) — password + confirm fields, posts to /reset-password, redirects to /login.
- `pages/VerificationPending.jsx` — "Check your inbox" screen with Resend button (rate-limit aware). Wired into `Login.jsx` as a stage (no top-level route).
- `pages/AdminEmailSettings.jsx` (route `/admin/email-settings`) — SMTP form (host/port/username/password/use_tls/sender_email/sender_name) + Test Send button. Password mask flow preserves the saved pw across edits.
- `pages/Login.jsx` — `handleAuthSuccess` routes to verify-pending stage when `data.verification_pending === true` (register response or login 403 with `email_not_verified`). "Forgot password?" link now navigates to `/forgot-password`.
- `pages/Admin.jsx` — Email Settings nav button next to Content.
- `lib/auth.js` — `verifyEmail`, `resendVerification`, `forgotPasswordEmail`, `resetPasswordWithToken`, `adminGetEmailSettings`, `adminUpdateEmailSettings`, `adminTestEmail`. `register()` no longer writes tokens.

**Email templates** (`email_service.py`): HTML + plain-text variants of `verify` and `reset` in EN/AR/DE. RTL `<html dir="rtl">` on Arabic. Inline CSS only (no `<style>` blocks) for Gmail/Outlook compatibility.

**i18n**: ~50 new keys × 3 languages — `verify.*`, `forgot.*`, `reset.*`, `admin.email.*`, `account.delete.*`/`account.pending.*` carried over from the deletion feature.

**Backward compatibility**: `ensure_indexes` runs `accounts.update_many({email_verified: {$exists: false}}, {$set: {email_verified: true}})` at every startup — legacy accounts created before this feature shipped retain login access.

**Verified**:
- Backend pytest **55/55 PASSED** across 7 affected suites (test_email_verification 14/14 + test_account_deletion 8/8 + test_single_account 7/7 + test_tenant_isolation 15/15 + test_budget_owner 4/4 + test_beta_terms 6/6 + test_site_content 4/4). Invalid-token verification now responds in **~120 ms** (down from ~16 s pre-SHA-256 fix).
- Playwright UI **PASS**: register → "check your inbox" screen → resend 3× → 4th hits 429 toast → fetch link from backend log → /verify-email success → login succeeds with both tokens. Forgot-password flow: /forgot-password → /reset-password with new pw → re-login works. Admin /admin/email-settings save + test-send + password masking flow all green.

**Affected files**:
- New: `/app/backend/email_service.py`, `/app/backend/tests/test_email_verification.py`, `/app/backend/tests/conftest.py`, `/app/frontend/src/pages/VerifyEmail.jsx`, `/app/frontend/src/pages/ForgotPassword.jsx`, `/app/frontend/src/pages/ResetPassword.jsx`, `/app/frontend/src/pages/VerificationPending.jsx`, `/app/frontend/src/pages/AdminEmailSettings.jsx`.
- Updated: `/app/backend/auth_module.py` (constants + endpoints + register/login + admin email-settings routes + `_sha256_token` helper + ensure_indexes back-fill), `/app/backend/.env` (`PUBLIC_APP_URL`), `/app/frontend/src/App.js` (4 new routes), `/app/frontend/src/pages/Login.jsx` (verify-pending stage + forgot-link nav), `/app/frontend/src/pages/Admin.jsx` (Email Settings button), `/app/frontend/src/lib/auth.js` (7 helpers), `/app/frontend/src/lib/translations.js` (50 keys × 3 langs), `/app/backend/tests/test_*.py` (helpers updated for the new register→verify→login shape).




## Updated (Feb 2026 — SMTP Error Diagnostics)

The Admin → Email Settings → "Send test email" button no longer shows a generic "Something went wrong" toast. Every SMTP failure is now classified, logged with a full traceback, and rendered inline as a structured diagnostic panel so the admin can fix the SMTP configuration without digging through server logs.

**Backend** (`email_service.py`):
- New `SmtpDeliveryError` carries `reason / stage / message / smtp_code / smtp_message / hint_key`.
- `_classify_smtp_error()` maps every interesting exception type to a specific `reason`:
  - `smtplib.SMTPAuthenticationError` → `auth_failed` (preserves SMTP response code, e.g. 535 + Gmail's "Username and Password not accepted" body)
  - `smtplib.SMTPNotSupportedError` → `tls_not_supported`
  - `smtplib.SMTPSenderRefused` / `SMTPRecipientsRefused` / `SMTPHeloError` → `sender_refused / recipient_refused / helo_failed`
  - `smtplib.SMTPServerDisconnected` → `server_disconnected`
  - `smtplib.SMTPConnectError` → `connection_refused`
  - `ssl.SSLError` → `tls_failed`
  - `socket.gaierror` → `host_unknown`
  - `socket.timeout / TimeoutError` → `timeout`
  - `ConnectionRefusedError` → `connection_refused`
  - `smtplib.SMTPException` → `smtp_error` (handled BEFORE the OSError catch-all because `SMTPException` inherits from `OSError`)
  - `OSError` → `network_error`
  - anything else → `unknown` (still returns the type name)
- `_smtp_send()` tracks `stage = "connect" | "starttls" | "login" | "send"` and tightens the socket timeout to 10s (axios timeout is 15s on most endpoints; the test endpoint uses 30s) so the backend always returns a structured response before any gateway timeout can intervene.
- `send_localized_email()` returns the rich dict `{sent, reason, stage, error, smtp_code, smtp_message, hint_key, link}` and logs `[EMAIL SEND FAILED]` with `exc_info=True` (full traceback in `/var/log/supervisor/backend.err.log`).

**Frontend** (`AdminEmailSettings.jsx`):
- `sendTest()` keeps the result in component state (no more transient toast) and routes axios `ECONNABORTED` to a `client_timeout` reason.
- New `<TestResultPanel>` component renders a red diagnostic card with: Reason (localized label) · Stage (which SMTP step failed) · Server response (smtp_code + smtp_message in monospace) · Details (raw error in monospace) · How to fix (localized hint specific to the failure reason). Success path renders a green confirmation card.
- `adminTestEmail()` uses a 30s axios timeout to give the 10s SMTP timeout headroom.

**i18n** (~28 new keys × 3 languages — EN/AR/DE):
- `admin.email.diag.{title, reason, stage, serverResponse, details, hint}`
- `admin.email.reason.{auth_failed, tls_not_supported, tls_failed, sender_refused, recipient_refused, helo_failed, server_disconnected, connection_refused, host_unknown, timeout, network_error, smtp_not_configured, smtp_error, unknown, client_timeout, request_failed}`
- `admin.email.stage.{connect, starttls, login, send}`
- `admin.email.hint.{auth, tls, host, connection, timeout, sender, recipient, helo, disconnect}`

**Verified live**:
- curl tests: `host_unknown` (DNS), `connection_refused` (127.0.0.1:9999), `auth_failed` (smtp.gmail.com with wrong app pw → SMTP 535 + Gmail's actual message preserved). Full traceback logged at WARNING for each.
- Playwright: diagnostic panel renders localized reason ("Host not found (DNS lookup failed)"), stage ("TCP connect / DNS"), monospace error details (`[Errno -2] Name or service not known`), and actionable hint.
- pytest **15/15 PASS** (`tests/test_email_diagnostics.py` — 13 classifier unit tests + 2 integration tests via `send_localized_email`). All earlier suites also pass.

**Affected files**:
- New: `/app/backend/tests/test_email_diagnostics.py` (15 tests).
- Updated: `/app/backend/email_service.py` (SmtpDeliveryError + _classify_smtp_error + stage tracking + structured error return), `/app/frontend/src/pages/AdminEmailSettings.jsx` (testResult state + TestResultPanel component), `/app/frontend/src/lib/auth.js` (adminTestEmail 30s timeout), `/app/frontend/src/lib/translations.js` (~28 keys × 3 languages), `/app/backend/tests/conftest.py` (autouse fixture clears SMTP between tests so a stale `smtp.gmail.com` host can't make every later test hang 10s on connect).


## Updated (Feb 2026 — SMTP per-step timing + connectivity probe)

The admin reported a generic "Browser timed out waiting for the server" toast from IONOS, with no way to tell which SMTP phase actually hung. This update adds:

**Backend** (`email_service.py`):
- `_smtp_send()` is now instrumented with `time.perf_counter()` around every phase: `dns → connect → starttls → login → send`. Per-step seconds are collected into a `step_durations` dict that's attached to both the success receipt and `SmtpDeliveryError`. On timeout you can now see exactly which phase consumed the budget.
- The socket timeout knob is exposed in `email_settings.smtp_timeout_seconds` (default **60 s**, up from the previous 10 s). This lets slow EU providers (IONOS, OVH, etc.) finish their TLS/AUTH handshake.
- DNS is now an **explicit** `getaddrinfo()` call so its latency is attributed separately from the TCP connect step. The resolved IP is surfaced on the success path so the admin can sanity-check what host their backend actually talks to.
- New `_smtp_connectivity_check()` helper does **DNS + TCP only** (no AUTH, no STARTTLS) and reads the server banner. Used by the connectivity probe endpoint to differentiate "network unreachable" from "credentials wrong".
- `[SMTP STEP]` info-level log line emitted per phase (e.g., `dns_ok host=smtp.ionos.de -> 212.227.24.208 | 0.059s`) so a backend operator can correlate the UI panel against the server log.

**New endpoint**: `POST /api/admin/email-settings/connectivity` (admin only) returns:
```json
{
  "reachable": true,
  "resolved_ip": "212.227.24.208",
  "banner": "220 smtp.ionos.de ESMTP RZmta (P1 -)",
  "step_durations": {"dns": 0.059, "connect": 0.234}
}
```
or on failure:
```json
{
  "reachable": false,
  "reason": "connection_refused" | "host_unknown" | "timeout" | ...,
  "stage": "dns" | "connect",
  "error": "...",
  "hint_key": "...",
  "step_durations": {"dns": 0.041}
}
```

**Frontend** (`AdminEmailSettings.jsx`):
- **Network reachability check** card with a **"Test connectivity"** button — runs the new probe and shows resolved IP + server banner + per-step timing.
- **Step timing list** now rendered inline inside every diagnostic panel (success or failure). Each step gets a localized label + `0.345s` style measurement (DNS lookup · TCP connect + EHLO · STARTTLS handshake · AUTH login · Send message).
- **Failure panel** now shows: Reason + Stage + Server response (smtp_code/message) + Details (raw error in mono) + **Step timing** + How to fix.
- Reused `<FailurePanel>` between the test-send result and the connectivity result so the markup stays DRY.
- `adminTestEmail()` axios timeout raised to **90 s** (was 30 s) and `adminTestSmtpConnectivity()` uses the same 90 s budget. Backend SMTP timeout of 60 s now safely fits within that envelope, so axios will never time out before the backend returns a structured response.

**Verified live against IONOS** from the Emergent container:
- Connectivity probe: `reachable=true, resolved_ip=212.227.24.208, banner="220 smtp.ionos.de ESMTP RZmta (P1 -)", durations={dns:0.059, connect:0.234}` → **network reachability is fine**.
- Full test send with deliberately wrong password: `reason=auth_failed, stage=login, smtp_code=535, smtp_message="Authentication credentials invalid", durations={dns:0.016, connect:0.349, starttls:0.512}` → IONOS reached STARTTLS in 0.5s, then rejected the bad password in <1s.

This confirms the original "Browser timed out" toast was purely the 30 s axios timeout firing **before** the backend got a chance to surface IONOS's reply. The user's earlier symptom is now impossible — backend resolves within ~2 s for credential errors and timing is always visible.

**i18n** (15 new keys × 3 languages — EN/AR/DE):
- `admin.email.diag.{timing, ip, banner}`
- `admin.email.step.{dns, connect, starttls, login, send}`
- `admin.email.connProbeLabel`, `admin.email.connProbeDesc`, `admin.email.connProbe`, `admin.email.connOk`, `admin.email.connFailed`, `admin.email.connFailedTitle`

**Tests**: pytest **29/29 PASS** (15 `test_email_diagnostics.py` + 14 `test_email_verification.py`).

**Affected files**:
- Updated: `/app/backend/email_service.py` (per-step timing + connectivity probe + DNS as separate step + 60s timeout knob), `/app/backend/auth_module.py` (new `POST /api/admin/email-settings/connectivity` route), `/app/frontend/src/pages/AdminEmailSettings.jsx` (Test connectivity button + ConnectivityPanel + reusable FailurePanel + StepTimings list), `/app/frontend/src/lib/auth.js` (90 s timeout + adminTestSmtpConnectivity), `/app/frontend/src/lib/translations.js` (15 new keys × 3 languages).


## Implemented (Feb 2026 — Admin Email Center)
Admin can now compose & broadcast branded emails to a single user, an entire family, multiple users, or every user — all from a dedicated `/admin/email-center` page. Every message is auto-wrapped in the My Life My Time HTML template (MLT monogram + brand line + footer with team, tagline, `https://mylife-mytime.com`, copyright). Multi-language: EN / AR (RTL) / DE.

**Backend** (already in place from prior fork): `/api/admin/email-center/recipients`, `/preview`, `/send`, `/logs`, `/logs/{id}` (all `require_admin`). Audience resolver supports `user` (account id OR free email), `family` (multi-family-id), `multiple` (explicit user ids), `all` (every non-admin account). Hard cap of 500 unless `confirm_large_send=true`. Persists each broadcast to `email_logs` with full per-recipient delivery report + status (`sent` / `partial` / `failed`). HTML rendering via `email_service.render_broadcast_html` (matches verify/reset templates). Reuses existing SMTP layer (`send_broadcast_email` → `_smtp_send`).

**Frontend** (new wiring on top of the existing `AdminEmailCenter.jsx`):
- New route `/admin/email-center` registered in `App.js`.
- New `admin-open-email-center` button in the Admin top bar (next to `Email Settings`).
- 48 new `ec.*` + `admin.nav.emailCenter` translation keys × EN / AR / DE.

**UX**: Compose card (recipient-type picker, lang selector, subject, body, preview & send buttons, hint about auto-wrapping) on the left; live `<iframe srcdoc>` Preview + Email Logs panel on the right. Logs row shows status dot, subject, sender email, audience type, delivered count, status badge. Large-audience confirm dialog before `> 500` sends.

**Tested** (Playwright on https://family-timeplan.preview.emergentagent.com/):
- Login as admin → /admin shows the new "Email Center" button → click navigates to `/admin/email-center` → page renders with header `Email Center` + subtitle, all 4 recipient pills, picker, lang selector, subject + message fields.
- Fill `user@example.com` + subject `Welcome to My Life My Time` + 3-paragraph body → tap Preview → iframe renders the branded template (MLT monogram, "YOUR FAMILY'S DIGITAL HUB", subject heading, paragraphs, footer team/tagline/site/copyright). Recipient count chip reads `1 recipients`.
- Existing Email Logs panel lists the prior `Test broadcast` row with status dot, sender, audience, status `Failed` (because the Render Free Tier still blocks SMTP — this is the pre-existing infra issue, not a code bug).

**Affected files**:
- Updated: `/app/frontend/src/App.js` (route), `/app/frontend/src/pages/Admin.jsx` (top-bar button), `/app/frontend/src/lib/translations.js` (3 × 48 new `ec.*` + `admin.nav.emailCenter`).
- Already existed (no changes needed): `/app/backend/auth_module.py` (email-center routes), `/app/backend/email_service.py` (`render_broadcast_html`, `send_broadcast_email`), `/app/frontend/src/pages/AdminEmailCenter.jsx`, `/app/frontend/src/lib/auth.js` (`adminListEmailRecipients`, `adminPreviewBroadcast`, `adminSendBroadcast`, `adminListEmailLogs`).

**Outstanding**: Real-world send still depends on the Render SMTP port-block issue (P1, awaiting user decision: upgrade Render Starter OR integrate Resend / SendGrid HTTPS).



## Implemented (Feb 2026 — Custom Email Logo + Pink × Blue gradient background)
Admin can now upload a custom logo for outgoing emails (saved in MongoDB + served via a public endpoint that email clients fetch from) OR paste a CDN URL — no code change required. The email background is now a soft pastel pink-to-blue diagonal gradient with a solid lavender fallback so Outlook still looks polished.

**Backend** (`email_service.py`):
- `BRAND_NAME` flipped from "My Life My Time" → **"My Family My Life"** for ALL outgoing emails (rest of the app keeps "My Life My Time" — user explicit request).
- Static fallback logo URL: `{PUBLIC_APP_URL}/logo512.png` (the existing family illustration shipped with the frontend).
- New helper `resolve_logo_url(settings)` with precedence: `brand_logo_url` (custom CDN paste) > `{PUBLIC_APP_URL}/api/branding/email-logo?v=<updated_at>` (uploaded blob) > static `logo512.png`.
- `_render_html`, `render_broadcast_html` accept a `logo_url` kwarg; `send_localized_email` + `send_broadcast_email` resolve the URL from `email_settings` before rendering.
- Pink × blue background applied to both verify/reset + broadcast templates:
  - `BG_GRADIENT_START = #FDE4EE` (soft rose-pink)
  - `BG_GRADIENT_END = #E1F0FA` (soft sky-blue)
  - `BG_SOLID_FALLBACK = #F0E9F2` (mid-point lavender — Outlook fallback)
  - Both `<body>` and the outer `<table>` set `bgcolor` + inline `background-image: linear-gradient(135deg,...)` for modern clients, with the solid `bgcolor` attribute as the Outlook fallback.

**Backend** (`auth_module.py` admin router):
- `_sanitize_settings` extended to expose `brand_logo_url`, `brand_logo_uploaded`, `brand_logo_mime`, `brand_logo_updated_at` (never the raw base64 blob).
- `PUT /api/admin/email-settings` now also accepts `brand_logo_url` (https-only validation).
- `POST /api/admin/email-settings/logo` — admin uploads base64 image (PNG/JPEG/WebP/GIF, max 500 KB, min 200 B). Stores `brand_logo_data`, `brand_logo_mime`, `brand_logo_size`, `brand_logo_updated_at`.
- `DELETE /api/admin/email-settings/logo` — clears uploaded blob + CDN URL, resets to the default static `/logo512.png`.

**Backend** (`server.py`):
- New **PUBLIC** route `GET /api/branding/email-logo` (no auth, 1-hour cache headers, ETag from `brand_logo_updated_at`):
  - Custom upload → returns the binary blob with the saved mime.
  - No upload → 302-redirects to `{PUBLIC_APP_URL}/logo512.png`.
  - This is the URL embedded in every outgoing email's `<img src>`; cache-buster (`?v=<ts>`) ensures Gmail's image proxy refetches after every update.

**Frontend** (`AdminEmailSettings.jsx`):
- New `EmailLogoCard` component rendered as a second card below the SMTP settings card.
- Live preview on a pink-blue gradient swatch (same colors as the actual email background) so the admin instantly sees what recipients will see.
- "Upload new logo" button (file input, max 500 KB, accepts PNG/JPEG/WebP/GIF).
- "Reset to default" button — only visible when a custom logo or CDN URL is set.
- "Or paste a public image URL (CDN)" input with a separate "Save URL" button (CDN takes priority over the uploaded blob).
- Per-state source label below the preview: `Custom upload` / `CDN URL` / `Default app logo`.
- New helpers in `auth.js`: `adminUploadEmailLogo(dataUrl, mime)`, `adminResetEmailLogo()`.

**i18n**: 16 new `admin.email.logo.*` keys × EN / AR / DE.

**Tested**:
- ✅ `curl` end-to-end: GET settings → POST logo (real 76 KB PNG) → settings returns `brand_logo_uploaded:true` + `mime:image/png` → GET `/api/branding/email-logo` returns 200 + 75811 bytes + `Content-Type: image/png` → DELETE → settings cleared → GET returns 302 redirect to `logo512.png`.
- ✅ Playwright: Admin → Email Settings → Email Logo card renders with the gradient preview swatch + the actual family logo + "DEFAULT APP LOGO" label + upload/reset/url controls.
- ✅ Email Center preview iframe: body `style` now contains `background-image:linear-gradient(135deg,#FDE4EE 0%,#E1F0FA 100%)` over a `#F0E9F2` fallback. The actual rendered email shows the soft pink → blue gradient backdrop, the family logo + "My Family My Life" name + footer.
- ✅ Backend pytest: **29/29 PASS** (test_email_verification + test_email_diagnostics — no regressions).

**Affected files**:
- `/app/backend/email_service.py` (BRAND_NAME flip, BG_* gradient constants, `resolve_logo_url`, `logo_url` kwarg threaded through render helpers, gradient applied to both `<body>` and outer wrapper `<table>`).
- `/app/backend/auth_module.py` (`_sanitize_settings` exposes logo fields, `PUT /email-settings` accepts `brand_logo_url`, new `POST /email-settings/logo` upload, new `DELETE /email-settings/logo` reset).
- `/app/backend/server.py` (new public `GET /api/branding/email-logo` route).
- `/app/frontend/src/pages/AdminEmailSettings.jsx` (new `EmailLogoCard` component + state).
- `/app/frontend/src/lib/auth.js` (`adminUploadEmailLogo`, `adminResetEmailLogo` helpers).
- `/app/frontend/src/lib/translations.js` (3 × 16 new `admin.email.logo.*` keys + `ec.bodyHint` updated).

## Implemented (Feb 2026 — Recurring Monthly Income engine)
The Family Budget no longer treats salary as a date-bound one-time row that disappears the moment the calendar flips. A full recurring-income engine now drives the dashboard, wallets, monthly summary and forecast.

**Two income types** (per the user's explicit spec):
- `one_time` — appears only in the month matching its `date`.
- `recurring` — auto-expanded into every active month from `start_year/start_month` until the optional `end_year/end_month` (inclusive on both ends; no end = forever). Per-month tweaks live in an `overrides` array.

**3 edit scopes** (mirrors Google Calendar's "edit repeating event"):
- `edit_mode=this_month` → adds/replaces a single override (other months untouched).
- `edit_mode=forward` → ends the current template at month-1, creates a fresh template starting at (year, month). No double-counting at the switchover.
- `edit_mode=all` → mutates the template directly (every month updates).

**3 delete scopes**:
- `delete_mode=this_month` → inserts a zero-amount override.
- `delete_mode=forward` → sets end_year/end_month to month-1.
- `delete_mode=all` (default) → hard-deletes the template.

**Migration** (`migrate_legacy_to_nasser` step 9 — idempotent, runs on every startup):
- Every existing `budget_income` row with `category=='primary'` and no `type` field is promoted to `type=recurring`, with `start_year/start_month` derived from its existing `date` and a `migrated_to_recurring_at` stamp for traceability.
- Non-primary rows (`extra` / `external` — bonuses, gifts, refunds) are tagged `type=one_time` explicitly so the field is always populated post-migration.
- Result of the live run: **60 salary rows** were promoted to recurring → `bsn.1988@hotmail.com`'s family's salaries now appear automatically in every future month.

**Aggregation refactor**:
- New helper `_income_in_month(row, year, month)` is the single source of truth — handles one-time + recurring + overrides + end dates uniformly.
- `/api/budget/summary` recomputes `income_total` and `by_owner.income` via `_income_in_month` for both the current and previous month (so deltas and wallet totals stay correct).
- `/api/budget/forecast` now prefers ACTIVE recurring templates over the legacy 3-month historical average — when a salary is recurring, the forecast is deterministic instead of guessed.
- `/api/budget/income?year=Y&month=M` returns the synthesized per-month list (one virtual row per active recurring template, anchored on the 1st, with `source_id` pointing at the template). Calling it without params still returns the raw template rows (used by admin/management tooling).

**API consistency fix**: POST `/api/budget/income` with `category=='primary'` and no explicit `type` now defaults to `recurring` (matching the migration policy). Other categories keep the `one_time` default. Programmatic clients no longer need to remember the type field for salaries.

**Frontend** (`HomeBudget.jsx`):
- Income editor now shows an "Income type" select with a help line ("auto-appears in every future month — no need to re-enter it"). Default = "Recurring monthly".
- Income list rows display a "🔁 Monthly" pill ([data-testid=`budget-income-recurring-<id>`]) right next to the description for every recurring template active in the current month.
- Clicking Edit on a recurring row opens a `ScopePicker` dialog FIRST (test-ids `budget-scope-this-month` / `budget-scope-forward` / `budget-scope-all`); the chosen scope rides along the PUT as `edit_mode` + `year` + `month`. One-time rows skip the picker.
- Clicking Delete on a recurring row also opens the picker; chosen scope rides along the DELETE as `delete_mode` + `year` + `month`. One-time rows go straight to the existing direct-delete flow.
- `budgetIncome.list({year, month})` is now called on page load so the income list aligns with the recurring-aware summary. `fetchBudgetSummary({year, month})` likewise forwards the scope.
- 17 new `budget.recurring.*` + `budget.incomeType.*` + `budget.field.incomeType` keys × EN / AR / DE.

**Tests**:
- `/app/backend/tests/test_recurring_income.py` — 11 tests covering every code path (one-time vs recurring window, start-without-end, start+end-window, per-month override, forward-edit split, all-edit template update, this-month-delete override, forward-delete end-stamping, summary recurring inclusion, forecast deterministic prefer-template, API default-to-recurring contract). **11/11 PASS**.
- Existing test suite (`test_email_verification`, `test_email_diagnostics`, `test_tenant_isolation`, `test_budget_owner`) — **31/31 PASS** (zero regressions).
- `testing_agent_v3_fork` iteration_15 — Backend 100%, Frontend 100%. Verified live E2E: fresh family → POST recurring income → Monthly badge appears → ScopePicker opens on Edit AND Delete → this_month override correctly changes only that month (3500 → 4000 for 2026-06) → Family Dashboard + Forecast reflect recurring income immediately.

**Affected files**:
- `/app/backend/server.py` — new helpers `_parse_ym_from_date`, `_income_in_month`, `_income_synthesize_month`; full rewrite of `_income_routes` (list/create/update/delete now type-aware); `/budget/summary` + `_recurring_income_estimate` use the helper; migration step 9.
- `/app/backend/tests/test_recurring_income.py` — new file, 11 tests.
- `/app/frontend/src/pages/HomeBudget.jsx` — incomeFields with Type select, ScopePicker component, openIncomeEditor/onScopePicked/deleteIncomeEntry handlers, Repeat-icon Monthly badge, refresh() passes {year, month}.
- `/app/frontend/src/lib/budgetApi.js` — CRUD.list/remove accept params; fetchBudgetSummary accepts params.
- `/app/frontend/src/lib/translations.js` — 17 new keys × 3 languages.

**Outstanding** (low priority, deferred per testing-agent comment): `HomeBudget.jsx` is now 1798 lines — worth splitting `ScopePicker`, editors and Row helpers into separate files for maintainability.


## Implemented (Feb 2026 — Family Locator feature flag)
The Family Locator (Where is my family?) section is now hidden by default and gated behind an admin-only global toggle. Disabled = no map, no GPS calls, no location-permission prompts anywhere.

**Backend** (`server.py`):
- New singleton `app_settings._key="global"` MongoDB doc. Helper `_get_feature_flags()` returns `{locator_enabled: bool}` with hard-coded defaults (locator_enabled=False).
- New public endpoint `GET /api/feature-flags` (no auth — every client reads it on app boot).
- Guard helper `_require_locator_enabled()` raises **HTTP 403** with `"Family Locator is disabled by the administrator."` when the flag is off. Wired into ALL four location routes: `POST /api/location/update`, `GET /api/location/latest`, `GET /api/location/history`, `DELETE /api/location/member/{member_id}`. The gate runs BEFORE the auth check so even forged tokens cannot probe the GPS endpoints.

**Backend** (`auth_module.py` admin router):
- `GET /api/admin/feature-flags` (require_admin) → returns the sanitized flags doc + `updated_at` / `updated_by`.
- `PUT /api/admin/feature-flags` (require_admin) → accepts `{locator_enabled: bool}`, validates field whitelist, upserts the singleton.

**Frontend**:
- New module `/app/frontend/src/lib/featureFlags.js` — exports `useFeatureFlags()` hook + `getFeatureFlags()` async helper. Single-flight cache with 60 s TTL + `invalidateFeatureFlags()` for the admin toggle. Defaults to `locator_enabled=false` if the network is unreachable, so the locator section stays hidden during slow connections.
- `/app/frontend/src/pages/WallBoard.jsx` — `<FamilyMapCard />` now only renders when `!isSingleAccount() && featureFlags.locator_enabled`. Disabled flag = the component never mounts, so its `useEffect`-driven GPS fetch never fires.
- `/app/frontend/src/pages/Admin.jsx` — new `FeatureFlagsCard` rendered at the very top of the Admin Console. Custom Tailwind switch (no extra Radix dep), optimistic update with rollback on error, refreshes the public-flags cache via `invalidateFeatureFlags()`. Test-ids: `admin-feature-flags-card` / `admin-flag-locator` / `admin-flag-locator-toggle`.
- `/app/frontend/src/lib/auth.js` — new helpers `adminGetFeatureFlags()` + `adminUpdateFeatureFlags(body)`.
- 8 new `admin.flags.*` translation keys × EN / AR / DE.

**Tests** (`/app/backend/tests/test_feature_flags.py`):
1. Public `/api/feature-flags` is reachable without auth, returns boolean shape.
2. While disabled, `/api/location/latest` AND `/api/location/update` both return 403 with `"disabled"` in the detail — regardless of auth state.
3. After admin flips to True, the public endpoint reflects the change and `/api/location/latest` no longer 403s.
4. Non-admin tokens are blocked from BOTH GET and PUT admin flag endpoints (401/403).
5. Round-trip: admin flips, public sees the new value immediately. **5/5 PASS**.

Combined with the 11 recurring-income tests: **16/16 PASS** on the new test suites.

**Verified live** (Playwright on https://family-timeplan.preview.emergentagent.com/admin):
- Feature Flags card visible at the top of /admin with the MapPin icon, "Family Locator feature" title, full description text, "DISABLED" status indicator, working toggle (aria-checked flips on click), success toast "Feature disabled for all users." Curl audit confirms: default = disabled → `/location/latest` returns 403 → admin enables → returns 401 (family-context, expected) → admin disables → returns 403 again.

**Affected files**:
- `/app/backend/server.py` (new helpers + public endpoint + 4 location guards).
- `/app/backend/auth_module.py` (admin GET/PUT feature-flags).
- `/app/backend/tests/test_feature_flags.py` (new — 5 tests).
- `/app/frontend/src/lib/featureFlags.js` (new — public-flags client).
- `/app/frontend/src/lib/auth.js` (admin helpers).
- `/app/frontend/src/pages/WallBoard.jsx` (gate FamilyMapCard).
- `/app/frontend/src/pages/Admin.jsx` (FeatureFlagsCard + FeatureFlagRow).
- `/app/frontend/src/lib/translations.js` (24 keys total — 8 × 3 langs).


## Implemented (Feb 2026 — Per-family Family Locator allow-list)
The Family Locator is now gated by TWO independent switches: the global master toggle (`app_settings.locator_enabled`) AND a per-family flag (`families.family_locator_enabled`, default False). Both must be ON for any user to see the locator section. Admins can whitelist specific families without touching the global switch.

**Backend** (`server.py`):
- `_require_locator_enabled(family_id=None)` now checks BOTH gates: global flag first, then the per-family flag (uses `current_family_id.get()` when `family_id` is omitted). 403 is returned with a distinct detail string per failure mode so the frontend can show the right hint.
- `/api/feature-flags` (public) now also returns `family_locator_enabled` derived from the caller's family token. Unauthenticated callers always receive `False`.
- `POST /api/location/update` (familyCode-based for the Android sender) re-checks the per-family flag against the family it resolved from `familyCode` — bypassing the JWT-based context.

**Backend** (`auth_module.py` admin router):
- `GET /api/admin/families` response now includes `family_locator_enabled` on every row.
- `POST /api/admin/families/{family_id}/locator` (admin only) — body `{enabled: bool}`. Sets the flag + stamps `family_locator_updated_at`. 404 when the family doesn't exist.

**Migration** (step 10 in `migrate_legacy_to_nasser` — idempotent):
- Every existing family doc without `family_locator_enabled` is initialised to `False`. Live run added the field to **589 families**. New families inherit `False` (the registration code wasn't touched — Mongo's "missing = falsy" + the explicit default in the public/admin endpoints make the contract bullet-proof).

**Frontend**:
- `/app/frontend/src/lib/featureFlags.js` — `DEFAULTS` now carries `family_locator_enabled: false`; whole module is unchanged otherwise.
- `/app/frontend/src/lib/auth.js` — new helper `adminSetFamilyLocator(familyId, enabled)`; `login()` + `selectMember()` both call `invalidateFeatureFlags()` after the token lands so the next `/api/feature-flags` call carries the family-scoped value.
- `/app/frontend/src/pages/WallBoard.jsx` — gate is now `!isSingleAccount() && featureFlags.locator_enabled && featureFlags.family_locator_enabled`.
- `/app/frontend/src/pages/Admin.jsx` — per-family card now shows:
  - "LOCATION ON" (emerald) / "LOCATION OFF" (stone-gray) badge with MapPin icon, alongside the existing `ACTIVE` and plan badges (test-id `admin-family-locator-status-<id>`).
  - "Enable locator" / "Disable locator" button (test-id `admin-family-locator-toggle-<id>`) inside the action stack, themed emerald when ON.
- Master-switch description rewritten: "Master switch for the Family Locator. When OFF, the section is hidden for everyone. When ON, the per-family toggle below decides which families can use it."
- 6 new `admin.familyLocator.*` / `admin.btn.locator*` / `admin.toast.locator*` translation keys × EN / AR / DE.

**Tests** (`/app/backend/tests/test_feature_flags.py`):
- Existing 5 tests updated for the new shape (public endpoint now returns 2 flags).
- **New**: `test_per_family_locator_flag_defaults_false_and_can_be_toggled` — admin flips a real DB family, list endpoint reflects the change, flips back, no leakage.
- **New**: `test_authenticated_family_sees_per_family_flag_in_public_endpoint` — full E2E loop: register family → public flags shows `family_locator_enabled=false` → `/location/latest` 403s with the per-family message → admin flips ON → public flags reflects → 403 lifts.
- **7/7 PASS**.
- Combined with 11 recurring-income tests: **18/18** on the new suites. All 31 pre-existing tests still pass — zero regressions.

**Verified live** (Playwright on https://family-timeplan.preview.emergentagent.com/admin):
- Feature-Flags card renders the new master-switch description.
- Family list shows 619 rows, all with `LOCATION OFF` badge + `Enable locator` button.
- Clicking the toggle flips `LOCATION OFF` → `LOCATION ON` instantly, toast confirms "Family Locator disabled for this family." / "Family Locator enabled for this family." Bidirectional.

**Affected files**:
- `/app/backend/server.py` (guard signature, `/feature-flags` shape, location/update extra check, migration step 10).
- `/app/backend/auth_module.py` (admin list + `POST /admin/families/{id}/locator`).
- `/app/backend/tests/test_feature_flags.py` (updated + 2 new tests).
- `/app/frontend/src/lib/featureFlags.js` (default + DEFAULTS shape).
- `/app/frontend/src/lib/auth.js` (`adminSetFamilyLocator`, invalidateFeatureFlags after login/selectMember).
- `/app/frontend/src/pages/Admin.jsx` (status badge + toggle button + handler + import).
- `/app/frontend/src/pages/WallBoard.jsx` (gate now AND of both flags).
- `/app/frontend/src/lib/translations.js` (18 new keys total — 6 × 3 langs).

