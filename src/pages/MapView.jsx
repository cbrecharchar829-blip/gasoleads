import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/localClient';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Fuel, Users, Settings, Navigation, X, Route, ExternalLink, Sun, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
  const [stageFilter, setStageFilter] = useState('All');
  const [routeLeads, setRouteLeads] = useState([]); // selected for route
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

  // Geocode addresses
  useEffect(() => {
    if (leads.length === 0) { setPinnedLeads([]); return; }
    const withAddr = leads.filter(l => l.address || l.zipcode || l.maps_url);
    if (withAddr.length === 0) { setPinnedLeads([]); return; }

    setGeocoding(true);
    const geocodeAll = async () => {
      try {
        const results = await Promise.all(
          withAddr.map(async (lead) => {
            if (lead.maps_url) {
              const match1 = lead.maps_url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
              if (match1) return { ...lead, lat: parseFloat(match1[1]), lng: parseFloat(match1[2]) };

              const match2 = lead.maps_url.match(/[?&]query=([^&]+)/);
              if (match2) {
                const decodedQuery = decodeURIComponent(match2[1]);
                try {
                  const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(decodedQuery)}&format=json&limit=1`,
                    { headers: { 'Accept-Language': 'en' } }
                  );
                  const data = await res.json();
                  if (data && data[0]) return { ...lead, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                } catch {}
              }
            }

            const query = [lead.address, lead.zipcode].filter(Boolean).join(' ');
            if (!query) return null;

            try {
              const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
                { headers: { 'Accept-Language': 'en' } }
              );
              const data = await res.json();
              if (data && data[0]) return { ...lead, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            } catch {}

            return null;
          })
        );
        const verified = results.filter(Boolean).map(r => ({ ...r, is_address_verified: true }));
        setPinnedLeads(verified);
      } catch (error) {
        console.error('Error geocoding addresses:', error);
        setPinnedLeads([]);
      } finally {
        setGeocoding(false);
      }
    };
    geocodeAll();
  }, [leads]);

  const [zipFilter, setZipFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [relationshipFilter, setRelationshipFilter] = useState('All');

  const filtered = pinnedLeads.filter(l => {
    if (stageFilter !== 'All' && l.stage !== stageFilter) return false;
    if (zipFilter && !(l.zipcode || '').includes(zipFilter)) return false;
    if (industryFilter && !(l.job_industry || '').toLowerCase().includes(industryFilter.toLowerCase())) return false;
    if (relationshipFilter !== 'All' && l.relationship_type !== relationshipFilter) return false;
    return true;
  });

  const center = filtered.length > 0 ? [filtered[0].lat, filtered[0].lng] : [39.5, -98.35];
  const zoom = filtered.length > 0 ? 10 : 4;

  const toggleRoutePin = (lead) => {
    setRouteLeads(prev =>
      prev.find(l => l.id === lead.id)
        ? prev.filter(l => l.id !== lead.id)
        : [...prev, lead]
    );
  };

  const inRoute = (lead) => routeLeads.some(l => l.id === lead.id);

  const buildGoogleMapsUrl = () => {
    if (routeLeads.length === 0) return '';
    const addrs = routeLeads.map(l => encodeURIComponent([l.address, l.zipcode].filter(Boolean).join(', ')));
    if (addrs.length === 1) return `https://www.google.com/maps/search/?api=1&query=${addrs[0]}`;
    const [first, ...rest] = addrs;
    const dest = rest[rest.length - 1];
    const waypoints = rest.slice(0, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
  };

  const buildAppleMapsUrl = () => {
    if (routeLeads.length === 0) return '';
    const addrs = routeLeads.map(l => [l.address, l.zipcode].filter(Boolean).join(', '));
    return `https://maps.apple.com/?daddr=${encodeURIComponent(addrs[addrs.length - 1])}&dirflg=d`;
  };

  const buildWazeUrl = () => {
    if (routeLeads.length === 0) return '';
    const last = routeLeads[routeLeads.length - 1];
    return `https://waze.com/ul?ll=${last.lat},${last.lng}&navigate=yes`;
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
              <a href={buildGoogleMapsUrl()} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
                <ExternalLink className="w-3.5 h-3.5" />Google Maps
              </a>
              <a href={buildAppleMapsUrl()} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
                <Navigation className="w-3.5 h-3.5" />Apple Maps
              </a>
              <a href={buildWazeUrl()} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-[#00d2ff] hover:bg-[#00bce8] text-gray-900 text-xs font-semibold rounded-lg transition-colors shadow-sm">
                <Navigation className="w-3.5 h-3.5" />Waze
              </a>
            </div>
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
                <Popup maxWidth={240}>
                  <div className="text-sm space-y-1.5">
                    <div className="font-semibold text-gray-900">{lead.company_name || lead.name}</div>
                    {lead.company_name && <div className="text-gray-500 text-xs">{lead.name}</div>}
                    <div className="text-xs text-gray-500">{lead.company} · {lead.relationship_type}</div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full inline-block ${getContactAgeColor(lead.last_touch_date) === 'red' ? 'bg-red-500' : getContactAgeColor(lead.last_touch_date) === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'}`} />
                      <span className="text-gray-600">{lead.stage}</span>
                    </div>
                    {lead.address && <div className="text-xs text-gray-500">📍 {lead.address}{lead.zipcode ? ` ${lead.zipcode}` : ''}{!lead.is_address_verified && <span className="ml-1 text-gray-400">(NV)</span>}</div>}
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
