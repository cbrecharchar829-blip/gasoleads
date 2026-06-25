import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, MapPin } from 'lucide-react';

// Searches OpenStreetMap's free Nominatim service (no API key, no backend).
// This replaces the original Base44 AI lookup and matches the geocoding the
// Map page already uses.
export default function BusinessLocationSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setError('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const mapped = (data || []).map((d) => {
        const a = d.address || {};
        const city = a.city || a.town || a.village || a.hamlet || a.county || '';
        const state = a.state || '';
        const zipcode = a.postcode || '';
        const streetParts = [a.house_number, a.road].filter(Boolean).join(' ');
        const name = (d.display_name || '').split(',')[0];
        const address = streetParts || name;
        const full = [address, city, state].filter(Boolean).join(', ');
        const maps_url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full || d.display_name)}`;
        return { name, address, city, state, zipcode, maps_url };
      });
      setResults(mapped);
      if (mapped.length === 0) setError('No matches found. Try a more specific name or address.');
    } catch {
      setError('Search failed. Check your connection and try again.');
    }
    setLoading(false);
  };

  const handleSelect = (result) => {
    setResults([]);
    const fullAddress = [result.address, result.city, result.state].filter(Boolean).join(', ');
    onSelect({ address: fullAddress, zipcode: result.zipcode, maps_url: result.maps_url });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
          placeholder="Search business name or address…"
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={handleSearch} disabled={loading || !query.trim()} className="shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-emerald-50 transition-colors"
            >
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                <p className="text-xs text-gray-500">{[r.address, r.city, r.state, r.zipcode].filter(Boolean).join(', ')}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-gray-400 text-center py-1">{error}</p>
      )}
    </div>
  );
}
