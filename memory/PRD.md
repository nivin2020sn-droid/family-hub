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
- **Feb 2026 (latest)**: Multi-language support. New lightweight i18n (no external library) in `lib/translations.js` + `lib/i18n.jsx`. Supported languages: English (default), Arabic (RTL), German. `<I18nProvider>` wraps the App; selected language is persisted in `localStorage.mfml_lang` and applies `<html lang dir>` automatically. New `LanguageSwitcher` component (globe icon + dropdown showing native name + flag + checkmark) — pinned to the top-right of the Login page and the WallBoard top bar, and also exposed inside the Settings dialog. All user-facing strings on Login, WallBoard (sections, empty states, bottom nav, sync states, settings dialog, hero overlay default text), and all editor dialogs (Hero/Message/Goal/Countdown/Achievement/Note/FamilyEvent/GoalHistory) flow through `t(key)`. RTL fonts (Tajawal/Cairo fallback) added in `index.css`. User-saved content (hero title/subtitle, message text, goal labels, etc.) is preserved as-is — only chrome and defaults are translated.
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

## Next Tasks
- After user review: choose between deepening Time Plan (recurring, drag-drop) or starting Home Budget MVP.
