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
