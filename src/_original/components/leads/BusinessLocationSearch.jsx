import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, MapPin, Check } from 'lucide-react';

export default function BusinessLocationSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Search Google Maps for the business: "${query}". Return up to 5 real matching business locations. For each result include: name, address (street address), city, state, zipcode, and the full Google Maps URL (https://www.google.com/maps/search/?api=1&query=ENCODED_ADDRESS). Only return real, plausible businesses. If nothing matches well, return an empty list.`,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                address: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                zipcode: { type: 'string' },
                maps_url: { type: 'string' }
              }
            }
          }
        }
      }
    });
    setResults(res.results || []);
    setLoading(false);
  };

  const handleSelect = (result, idx) => {
    setSelectedIndex(idx);
    setResults([]);
    const fullAddress = `${result.address}, ${result.city}, ${result.state}`;
    const mapsUrl = result.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
    onSelect({ address: fullAddress, zipcode: result.zipcode, maps_url: mapsUrl });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search business name…"
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
              onClick={() => handleSelect(r, i)}
              className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-emerald-50 transition-colors"
            >
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                <p className="text-xs text-gray-500">{r.address}, {r.city}, {r.state} {r.zipcode}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && query && (
        <p className="text-xs text-gray-400 text-center py-1">No results yet — press search or hit Enter.</p>
      )}
    </div>
  );
}
