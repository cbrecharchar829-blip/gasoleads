# GASOLEADS — project notes for Claude Code

A browser-only React lead manager (no server, no login). All data lives in the
browser's `localStorage`. Built with Vite + React + React Router + Tailwind +
Leaflet. This file orients a fresh Claude session — read it first.

## Run / test / deploy
- **Dev:** `npm run dev` → http://localhost:5173
- **Build:** `npm run build`
- **Cadence tests:** `npm run test:cadence` (33 checks over a simulated clock)
- **Publish updates:** `npm run deploy:pages` — builds and force-pushes `dist/` to
  the `gh-pages` branch. Live ~1 min later. Always run this after a change the
  user wants live.

## Hosting (important context)
- **Live URL (use this):** https://cbrecharchar829-blip.github.io/gasoleads/
  Hosted on **GitHub Pages** from the `gh-pages` branch.
- Also deployed on **Vercel** (project `gasoleads`), but the user's ADP work
  computer **blocks `*.vercel.app`** via a corporate web filter. `github.io` is
  **allowed**, so GitHub Pages is the one that works at work. Prefer Pages.
- Repo: `cbrecharchar829-blip/gasoleads` (public, so free Pages works).
- GitHub Pages served under the subpath `/gasoleads/`, so:
  - `vite.config.js` sets `base: process.env.BASE_PATH || '/'` (the Pages build
    sets `BASE_PATH=/gasoleads/`; local/Vercel use `/`).
  - `src/App.jsx` uses **HashRouter** (URLs like `/#/leads/123`) so deep links
    don't 404 on static hosting.
- Deploy is a branch push (`scripts/deploy-pages.sh`), NOT GitHub Actions — the
  user's gh token lacks the `workflow` scope, so we can't push workflow files.

## Data & backup
- Everything is in `localStorage` under the `gasoleads:` prefix, per browser/device
  (no sync across devices). Data layer: `src/api/localClient.js` (mimics a backend).
- **Backup/restore:** `src/lib/backup.js` + UI in Settings. Export downloads a
  JSON of every `gasoleads:*` key; Import restores it. This is how the user moves
  data to a new computer. There's also a daily reminder + optional auto-download.
- Realistic scale: the user expects **≤ ~200 leads**. Note: several queries cap at
  500 records (`Lead.list('-created_date', 500)` in Home/Leads/Map) — raise if the
  user ever approaches 500. localStorage's ~5MB limit is the long-term ceiling.

## Where things live
- `src/lib/cadenceUtils.js` — cadence math, default templates, `calculateColorStatus`,
  `isFinalTouch`, `needsShoulderTap`, business-day-aware coloring.
- `src/lib/leadActions.js` — `addLead`, `markTouchDone`, `restartCadence`,
  shoulder-tap actions, `shouldConfirmSameDayTouch`.
- `src/lib/businessDays.js` — weekends + Days Off; `shiftToBusinessDay`,
  `businessDaysOverdue`.
- `src/lib/backup.js` — export/import.
- `src/lib/leadFilters.js` — shared filter logic (Today + Leads).
- `src/pages/` — Home (Today), Leads, LeadDetail, MapView, Blitzkrieg, CadenceSettings.
- `src/components/DailyTodo.jsx` — the ADHD to-do panel on Today.

## Cadence rules (how the app behaves)
- **Two cadence types:** *Fixed* (set touches on set day-offsets, runs once) and
  *Recurring* (rotating channels every N days, loops forever).
- **Business days:** automatic scheduling skips weekends + Days Off; overdue/color
  is counted in working days. Manual reschedule / add-lead first touch are honored
  exactly (even weekends).
- **One touch per day:** fixed cadences clamp; recurring shows a confirm prompt.
- **Nurture rules:** a finished *fixed* cadence auto-moves to Nurture only if no
  response was ever logged. *Recurring/permanent* leads never auto-move — they get
  a "shoulder tap" prompt after 3 weeks with no logged contact (keep going / move
  to Nurture). Permanent-cadence restart returns to touch #0 (the true first touch).
- **Restart Cadence** (any lead): back to touch #1, keeps history, red "Cadence
  restarted (N)" marker, reactivates to Contacted, first touch next business day.
- **Final touch:** amber "Final touch" button on the last touch of a fixed cadence.

## Working style with this user (beginner-friendly)
- Non-technical; go slow, one step at a time; explain plainly. For anything they
  must run themselves (interactive logins etc.), suggest the `! <command>` prompt.
- After code changes they want live: run `npm run deploy:pages` and tell them to
  refresh the GitHub Pages link.
