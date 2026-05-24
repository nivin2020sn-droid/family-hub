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

