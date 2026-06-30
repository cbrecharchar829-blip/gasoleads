import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/localClient';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Fuel, Users, Settings, Navigation, X, Route, ExternalLink, Sun, Zap, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_COLORS = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

// Excluded stages — won't appear on the map
const EXCLUDED_STAGES = ['Nurture', 'Won', 'Lost'];

// Map is limited to the Miami metro / tri-county South Florida area: roughly
// West Palm Beach southward — Palm Beach, Broward, and Miami-Dade counties.
// Leads outside this box are hidden from the MAP ONLY; they stay in the pipeline
// and lead list everywhere else.
const MIAMI_METRO = { south: 25.0, north: 27.0, west: -80.95, east: -79.95 };
function inMiamiMetro(lat, lng) {
  return (
    lat != null && lng != null &&
    lat >= MIAMI_METRO.south && lat <= MIAMI_METRO.north &&
    lng >= MIAMI_METRO.west && lng <= MIAMI_METRO.east
  );
}

// A lead's address counts as verified if it was confirmed via search (has a
// maps_url) or was explicitly flagged verified.
function isVerified(lead) {
  return !!(lead.maps_url || lead.is_address_verified);
}

// Best text/coords to hand a maps app for one stop (real address, else coords).
function stopQuery(lead) {
  const addr = [lead.address, lead.zipcode].filter(Boolean).join(', ');
  if (addr) return addr;
  if (lead.lat != null && lead.lng != null) return `${lead.lat},${lead.lng}`;
  return '';
}

// Throttled, cached geocoding so we stay polite to Nominatim (it asks for slow
// request rates) and pins never randomly drop. Successful lookups are cached in
// localStorage, so repeat map visits are instant and don't re-hit the network.
const GEO_CACHE_KEY = 'gasoleads:geocache';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function readGeoCache() {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}'); } catch { return {}; }
}
function writeGeoCache(cache) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

// Remove apartment/suite/unit designators (e.g. "Apt 306", "Suite 200", "#4B").
// These sub-unit numbers routinely break street geocoding. We deliberately do
// NOT match "floor/fl" so a state abbreviation like "FL" is never clobbered.
function stripUnit(address) {
  if (!address) return '';
  const cleaned = address.replace(
    /(?:#|\bapt\.?|\bapartment\b|\bste\.?|\bsuite\b|\bunit\b|\bbldg\.?|\bbuilding\b|\brm\.?|\broom\b)\s*#?\s*[a-z0-9][a-z0-9-]*/gi,
    ''
  );
  // Re-join on commas to drop any empty segment the removal left behind.
  return cleaned.split(',').map(p => p.trim()).filter(Boolean).join(', ').trim();
}

// Build the geocoding query for a lead: street address (unit stripped), anchored
// with the ZIP code when present so "street + zip" lands on the right spot.
function buildGeoQuery(lead) {
  const street = stripUnit(lead.address || '');
  const zip = (lead.zipcode || '').trim();
  const parts = [];
  if (street) parts.push(street);
  if (zip && !street.includes(zip)) parts.push(zip); // anchor with zip
  return parts.join(', ');
}

// Look up one free-text query -> {lat,lng} or null. Caches hits into `cache`.
async function geocodeQuery(query, cache) {
  const key = (query || '').trim().toLowerCase();
  if (!key) return null;
  if (cache[key]) return cache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data && data[0]) {
      const coord = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      cache[key] = coord;
      return coord;
    }
  } catch { /* network/parse error -> not found; will retry on a later visit */ }
  return null;
}

// Calculate color based on days since last contact
function getContactAgeColor(lastTouchDate) {
  if (!lastTouchDate) return 'red'; // No contact = red
  const days = Math.floor((new Date() - new Date(lastTouchDate)) / (1000 * 60 * 60 * 24));
  if (days <= 7) return 'green';   // Contacted within 7 days
  if (days <= 30) return 'yellow'; // 8-30 days
  return 'red';                    // >30 days
}

function createStatusIcon(colorHex) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 26px; height: 26px;
      background: ${colorHex};
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -30],
  });
}

const STAGE_FILTERS = ['All', 'New', 'Contacted', 'Engaged', 'Meeting'];

export default function MapView() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [pinnedLeads, setPinnedLeads] = useState([]);
  const [unplaced, setUnplaced] = useState([]); // have address but failed to geocode
  const [stageFilter, setStageFilter] = useState('All');
  const [routeLeads, setRouteLeads] = useState([]); // selected for route
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      const allLeads = await base44.entities.Lead.list('-created_date', 500);
      // Only active leads — exclude Nurture, Won, Lost
      const active = allLeads.filter(l => !EXCLUDED_STAGES.includes(l.stage));
      setLeads(active);
      setLoading(false);
    } catch (error) {
      console.error('Error loading leads for map:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Geocode addresses — SEQUENTIALLY with a polite throttle and a localStorage
  // cache, so pins resolve reliably (no more random drops from rate-limiting)
  // and repeat visits are instant. Leads that have an address but can't be
  // located are collected into `unplaced` so they're never silently missing.
  useEffect(() => {
    const withAddr = leads.filter(l => l.address || l.zipcode || l.maps_url);
    if (withAddr.length === 0) { setPinnedLeads([]); setUnplaced([]); return; }

    let cancelled = false;
    const cache = readGeoCache();

    const run = async () => {
      setGeocoding(true);
      const placed = [];
      const failed = [];
      let madeNetworkCall = false;

      for (const lead of withAddr) {
        if (cancelled) return;
        let coord = null;

        // 1) Coordinates embedded in a verified maps_url — no network needed.
        const at = lead.maps_url && lead.maps_url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (at) {
          coord = { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
        } else {
          // 2) Build a query: maps_url's ?query=, else the normalized address
          //    (apt/suite/unit stripped, anchored with ZIP).
          let query = '';
          const qm = lead.maps_url && lead.maps_url.match(/[?&]query=([^&]+)/);
          if (qm) { try { query = decodeURIComponent(qm[1]); } catch { query = qm[1]; } }
          if (!query) query = buildGeoQuery(lead);

          const key = query.trim().toLowerCase();
          if (key && cache[key]) {
            coord = cache[key]; // cached — instant, no throttle
          } else if (key) {
            if (madeNetworkCall) await delay(1100); // ~1 req/sec to Nominatim
            if (cancelled) return;
            coord = await geocodeQuery(query, cache);
            madeNetworkCall = true;
          }
        }

        if (coord) placed.push({ ...lead, lat: coord.lat, lng: coord.lng });
        else failed.push({ id: lead.id, name: lead.company_name || lead.name });

        if (!cancelled) setPinnedLeads([...placed]); // stream pins as they resolve
      }

      if (cancelled) return;
      writeGeoCache(cache);
      setPinnedLeads(placed);
      setUnplaced(failed);
      setGeocoding(false);
    };

    run();
    return () => { cancelled = true; };
  }, [leads]);

  const [zipFilter, setZipFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [relationshipFilter, setRelationshipFilter] = useState('All');

  const filtered = pinnedLeads.filter(l => {
    if (!inMiamiMetro(l.lat, l.lng)) return false; // map shows Miami metro only
    if (stageFilter !== 'All' && l.stage !== stageFilter) return false;
    if (zipFilter && !(l.zipcode || '').includes(zipFilter)) return false;
    if (industryFilter && !(l.job_industry || '').toLowerCase().includes(industryFilter.toLowerCase())) return false;
    if (relationshipFilter !== 'All' && l.relationship_type !== relationshipFilter) return false;
    return true;
  });

  // Leads that geocoded fine but sit outside the Miami metro box (hidden from the
  // map only — still in the pipeline). Shown as a separate, quieter note.
  const placedOutside = pinnedLeads.filter(l => !inMiamiMetro(l.lat, l.lng));

  // Default to the Miami metro view when nothing is pinned yet.
  const center = filtered.length > 0 ? [filtered[0].lat, filtered[0].lng] : [25.95, -80.2];
  const zoom = filtered.length > 0 ? 10 : 9;

  const toggleRoutePin = (lead) => {
    setRouteLeads(prev =>
      prev.find(l => l.id === lead.id)
        ? prev.filter(l => l.id !== lead.id)
        : [...prev, lead]
    );
  };

  const inRoute = (lead) => routeLeads.some(l => l.id === lead.id);

  // Google Maps carries ALL stops: current location -> each stop in order ->
  // destination (last stop). Origin is omitted so Maps uses your live location.
  const buildGoogleMapsUrl = () => {
    const stops = routeLeads.map(stopQuery).filter(Boolean);
    if (stops.length === 0) return '';
    if (stops.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stops[0])}&travelmode=driving`;
    }
    const destination = encodeURIComponent(stops[stops.length - 1]);
    const waypoints = stops.slice(0, -1).map(encodeURIComponent).join('%7C');
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
  };

  // Apple Maps & Waze URL schemes are single-destination, so they navigate to
  // the FIRST stop (your immediate next destination) using its real address.
  const buildAppleMapsUrl = () => {
    if (routeLeads.length === 0) return '';
    const q = stopQuery(routeLeads[0]);
    return q ? `https://maps.apple.com/?daddr=${encodeURIComponent(q)}&dirflg=d` : '';
  };

  const buildWazeUrl = () => {
    if (routeLeads.length === 0) return '';
    const first = routeLeads[0];
    if (first.lat != null && first.lng != null) return `https://waze.com/ul?ll=${first.lat},${first.lng}&navigate=yes`;
    const q = stopQuery(first);
    return q ? `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes` : '';
  };

  const googleUrl = buildGoogleMapsUrl();
  const appleUrl = buildAppleMapsUrl();
  const wazeUrl = buildWazeUrl();

  const copyGoogleUrl = async () => {
    if (!googleUrl) return;
    try {
      await navigator.clipboard.writeText(googleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center">
               <Fuel className="w-5 h-5 text-white" />
             </div>
             <h1 className="text-lg font-semibold text-gray-900 tracking-tight">GASOLEADS</h1>
           </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/blitzkrieg" className="text-gray-500 flex items-center gap-1.5"><Zap className="w-4 h-4" />Blitzkrieg</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="text-gray-500 flex items-center gap-1.5"><Sun className="w-4 h-4" />Today</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/leads" className="text-gray-500"><Users className="w-4 h-4 mr-1.5" />Leads</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/map" className="text-gray-900 font-medium"><MapPin className="w-4 h-4 mr-1.5" />Map</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" className="text-gray-500"><Settings className="w-4 h-4 mr-1.5" />Settings</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 gap-4">
        {/* Controls row */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Lead Map</h2>
              <p className="text-sm text-gray-500">
                {geocoding ? 'Locating addresses…' : `${filtered.length} lead${filtered.length !== 1 ? 's' : ''} pinned${routeLeads.length > 0 ? ` · ${routeLeads.length} in route` : ''}`}
              </p>
            </div>
          </div>

          {/* Filter controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {STAGE_FILTERS.map(s => (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    stageFilter === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="h-5 w-px bg-gray-200" />
            {['All', 'Prospect', 'Partner', 'Client'].map(r => (
              <button
                key={r}
                onClick={() => setRelationshipFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  relationshipFilter === r ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r}
              </button>
            ))}
            <div className="h-5 w-px bg-gray-200" />
            <input
              type="text"
              placeholder="Filter by zipcode…"
              value={zipFilter}
              onChange={e => setZipFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="Filter by industry…"
              value={industryFilter}
              onChange={e => setIndustryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-xs text-gray-500 flex-wrap">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Contacted within 7 days</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />8–30 days since contact</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />No contact in over 30 days</div>
          <span className="ml-2 text-gray-400">· Click pins to add to route</span>
        </div>

        {/* Route planner panel */}
        {routeLeads.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
                <Route className="w-4 h-4" />
                Route Builder ({routeLeads.length} stop{routeLeads.length !== 1 ? 's' : ''})
              </div>
              <button onClick={() => setRouteLeads([])} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Clear all</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {routeLeads.map((l, i) => (
                <div key={l.id} className="flex items-center gap-1.5 bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">{i + 1}</span>
                  <span className="font-medium text-gray-800">{l.company_name || l.name}</span>
                  <button onClick={() => toggleRoutePin(l)} className="text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-blue-700 font-medium">Export to:</span>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
                <ExternalLink className="w-3.5 h-3.5" />Google Maps
              </a>
              <a href={appleUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
                <Navigation className="w-3.5 h-3.5" />Apple Maps
              </a>
              <a href={wazeUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-[#00d2ff] hover:bg-[#00bce8] text-gray-900 text-xs font-semibold rounded-lg transition-colors shadow-sm">
                <Navigation className="w-3.5 h-3.5" />Waze
              </a>
            </div>

            {/* Copyable Google Maps route link */}
            <div>
              <label className="text-xs text-blue-700 font-medium block mb-1">Google Maps route link</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={googleUrl}
                  onFocus={e => e.target.select()}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-[11px] font-mono text-gray-700 truncate"
                />
                <button
                  onClick={copyGoogleUrl}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg transition-colors shrink-0"
                >
                  {copied ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-blue-700/80">
              Google Maps includes every stop in order. Apple Maps &amp; Waze open turn-by-turn to your first stop.
            </p>
          </div>
        )}

        {/* Couldn't-place notice */}
        {!geocoding && unplaced.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            <div className="font-medium mb-1.5">
              ⚠ {unplaced.length} lead{unplaced.length !== 1 ? 's have' : ' has'} an address but couldn't be placed on the map
            </div>
            <div className="flex flex-wrap gap-1.5">
              {unplaced.map(u => (
                <Link
                  key={u.id}
                  to={`/leads/${u.id}`}
                  className="px-2 py-0.5 bg-white border border-amber-200 rounded-md text-xs font-medium text-amber-900 hover:bg-amber-100"
                >
                  {u.name}
                </Link>
              ))}
            </div>
            <div className="text-xs text-amber-700/80 mt-1.5">
              Open the lead and use a full street address (street, city, state, ZIP) so it can be located.
            </div>
          </div>
        )}

        {/* Outside-metro note */}
        {!geocoding && placedOutside.length > 0 && (
          <div className="text-xs text-gray-500">
            {placedOutside.length} lead{placedOutside.length !== 1 ? 's are' : ' is'} outside the Miami metro area and hidden from the map (still in your pipeline):{' '}
            {placedOutside.map((l, i) => (
              <React.Fragment key={l.id}>
                <Link to={`/leads/${l.id}`} className="text-gray-600 hover:text-gray-900 underline">{l.company_name || l.name}</Link>
                {i < placedOutside.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Map */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative" style={{ minHeight: '520px' }}>
          {geocoding && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 rounded-2xl">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                Geocoding addresses…
              </div>
            </div>
          )}
          <MapContainer
            key={`${center[0]}-${center[1]}`}
            center={center}
            zoom={zoom}
            style={{ height: '100%', width: '100%', minHeight: '520px' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filtered.map(lead => (
              <Marker
                key={lead.id}
                position={[lead.lat, lead.lng]}
                icon={createStatusIcon(STATUS_COLORS[getContactAgeColor(lead.last_touch_date)])}
              >
                <Tooltip direction="top" offset={[0, -22]}>
                  <div className="text-xs">
                    <div className="font-semibold text-gray-900">{lead.company_name || lead.name}</div>
                    {isVerified(lead)
                      ? <div className="text-green-600">✓ Address verified</div>
                      : <div className="text-amber-600">⚠ Address not verified</div>}
                  </div>
                </Tooltip>
                <Popup maxWidth={240}>
                  <div className="text-sm space-y-1.5">
                    <div className="font-semibold text-gray-900">{lead.company_name || lead.name}</div>
                    {lead.company_name && <div className="text-gray-500 text-xs">{lead.name}</div>}
                    <div className="text-xs text-gray-500">{lead.company} · {lead.relationship_type}</div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full inline-block ${getContactAgeColor(lead.last_touch_date) === 'red' ? 'bg-red-500' : getContactAgeColor(lead.last_touch_date) === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'}`} />
                      <span className="text-gray-600">{lead.stage}</span>
                    </div>
                    {lead.address && <div className="text-xs text-gray-500">📍 {lead.address}{lead.zipcode ? ` ${lead.zipcode}` : ''}</div>}
                    <div className={`text-xs font-medium ${isVerified(lead) ? 'text-green-600' : 'text-amber-600'}`}>
                      {isVerified(lead) ? '✓ Address verified' : '⚠ Address not verified'}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >View lead →</button>
                      <button
                        onClick={() => toggleRoutePin(lead)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-md transition-colors ${
                          inRoute(lead)
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {inRoute(lead) ? '− Remove from route' : '+ Add to route'}
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {filtered.length === 0 && !geocoding && (
          <p className="text-center text-sm text-gray-400 py-4">No leads with addresses found for this filter.</p>
        )}
      </main>
    </div>
  );
}
