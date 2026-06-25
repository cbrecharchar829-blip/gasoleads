# GASOLEADS — browser-only lead manager

A 100% client-side React app. All data is stored in your browser's `localStorage`.
No Base44, no login, no server.

## First-time setup

1. **Install Node.js** (one time). Download the macOS installer (LTS) from
   https://nodejs.org and run it. To confirm it worked, open Terminal and run:
   ```
   node --version
   ```
2. **Install the project's libraries** (one time, needs internet). In Terminal:
   ```
   cd ~/Desktop/lead-app
   npm install
   ```
3. **Start the app:**
   ```
   npm run dev
   ```
   Then open the URL it prints (usually http://localhost:5173).

## Notes

- Your data lives in this browser only. Clearing site data / "Clear localStorage"
  erases your leads. (Export/backup could be added later.)
- The **Map** and **address search** use the free OpenStreetMap (Nominatim) service,
  so they need an internet connection. Everything else works offline.
- The 6 built-in cadence templates are seeded automatically on first run.

## Where things live

- `src/api/localClient.js` — the localStorage data layer (mimics the old backend)
- `src/lib/cadenceUtils.js` — cadence math + the default templates
- `src/lib/leadActions.js` — shared "add lead" / "mark touch done" logic
- `src/pages/` — the 5 screens (Today, Leads, Lead detail, Map, Settings)
- `src/components/leads/` — lead-specific UI pieces
- `src/components/ui/` — reusable buttons/inputs/dialogs/etc.
- `src/_original/` — your original Base44 files, kept for reference (not used at runtime)
