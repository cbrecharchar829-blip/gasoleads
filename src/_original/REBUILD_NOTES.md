# Rebuild notes — Base44 things to replace with browser-friendly equivalents

These are collected as files are pasted. Nothing is built yet. Address at "done".

## Data layer
- All entities (`Lead`, `Note`, `CadenceTemplate`, `PartnershipType`, `TouchLog`) come from
  Base44 via `@/api/entities`. Rebuild: replace with a localStorage-backed data layer that
  exposes the same calls (list/filter/create/update/delete) so page logic stays unchanged.
- `@/api/base44Client` — the Base44 connection. Rebuild: remove; not needed for browser-only.
- Base44 auto-adds `id`, `created_date`/`updated_date` to every record. Rebuild: our local
  data layer must generate `id` and timestamps so existing sorting/linking keeps working.
- Entity API surface used so far (local layer must match exactly):
  - `.list(sort, limit)`  e.g. `.list('-created_date', 500)`  ('-' = descending)
  - `.filter(query, sort, limit)` with MONGO-STYLE operators, e.g.
    `{ completed_date: { $gte: weekStart } }`  -> support $gte/$lte/$gt/$lt/$ne + plain equals
  - `.create(obj)` returns the created record (with new id) ; `.update(id, partial)` ; `.delete(id)`
  - `.get(id)` returns one record by id (LeadDetail.jsx)
  - `.filter({ lead_id: x }, ...)` plain-equality match also needed (Notes/TouchLogs by lead)
  - Home.jsx relies on `.create()` RETURNING the new lead (uses newLead.id right after).

## Integrations / external services
- `BusinessLocationSearch.jsx`: uses `base44.integrations.Core.InvokeLLM` (Gemini) +
  `add_context_from_internet` to search businesses. Needs paid Base44 backend.
  Rebuild candidate: OpenStreetMap **Nominatim** free search API (no key), matches the
  Leaflet/OpenStreetMap map already in use. Keeps same UX (type name -> pick -> fill address).
  CONFIRMED: MapView.jsx ALREADY calls Nominatim directly via fetch for geocoding, so use
  the same service in BusinessLocationSearch for consistency (no Base44 / no AI needed).
  Note: Nominatim asks for low request rates — geocode politely (the map already batches).

## Libraries to add to package.json
- `moment` — used by lib/cadenceUtils.js for all date math. Keep it (don't swap to date-fns)
  so cadence timing stays byte-for-byte identical to the original logic.
- `leaflet` + `react-leaflet` — for the Map page (OpenStreetMap tiles already shown in UI).

## Seed data
- lib/cadenceUtils.js `DEFAULT_CADENCE_TEMPLATES` = 6 built-in cadences. Use to seed
  localStorage on first run so the app works with an empty DB.

## Entities inventory (5)
- CadenceTemplate, Lead, Note, PartnershipType, TouchLog

## UI building blocks referenced (shadcn, from components/ui/)
- dialog, button, input, label, select, switch, use-toast (toast notifications),
  textarea, alert-dialog
- icons: lucide-react
- NOTE: pages do NOT share a Layout file — each page renders its own header/nav.
  Routes seen: "/" Today, "/leads" Leads list, "/leads/:id" Lead detail, "/map" Map,
  "/settings" CadenceSettings.
