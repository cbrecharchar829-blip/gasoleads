import React, { useState, useRef, useEffect } from 'react';
import { Search, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STAGES } from '@/lib/cadenceUtils';
import { activeCategoryCount, emptyFilters } from '@/lib/leadFilters';

const COMPANIES = ['ADP', 'CaneyCloud/VAV'];
const RELATIONSHIP_TYPES = ['Prospect', 'Partner', 'Client'];

// Toggle-chip group for fixed-option categories (multi-select, OR within).
function ChipGroup({ label, options, selected, onToggle }) {
  const sel = selected || [];
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <div className="flex flex-wrap gap-1">
        {options.map(opt => {
          const active = sel.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-2 py-1 rounded-md text-xs border transition-colors ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Autocomplete that builds a list of removable chips (multi-select, OR within).
// Selecting a suggestion or pressing Enter adds the value; free text is allowed.
function MultiAutocomplete({ label, values, onChange, suggestions, placeholder }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sel = values || [];

  const pool = [...new Set(suggestions.filter(Boolean))].filter(s => !sel.includes(s));
  const filtered = (input
    ? pool.filter(s => s.toLowerCase().includes(input.toLowerCase()))
    : pool
  ).slice(0, 8);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const add = (v) => {
    const t = (v || '').trim();
    if (t && !sel.includes(t)) onChange([...sel, t]);
    setInput('');
  };
  const remove = (v) => onChange(sel.filter(x => x !== v));

  return (
    <div ref={ref} className="relative">
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      {sel.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {sel.map(v => (
            <span key={v} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-md px-1.5 py-0.5">
              {v}
              <button onClick={() => remove(v)} className="text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={input}
        onChange={e => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg text-xs max-h-40 overflow-y-auto">
          {filtered.map(s => (
            <li
              key={s}
              onMouseDown={() => { add(s); }}
              className="px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-gray-700 truncate"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LeadFilters({ filters, onChange, leads = [] }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggle = (key, val) => {
    const cur = filters[key] || [];
    const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val];
    onChange({ ...filters, [key]: next });
  };
  const setValues = (key, vals) => onChange({ ...filters, [key]: vals });
  const setOne = (key, val) => onChange({ ...filters, [key]: val });
  const clearAll = () => onChange(emptyFilters());

  const activeFilterCount = activeCategoryCount(filters);

  const uniq = (sel) => [...new Set(leads.map(sel).filter(Boolean))];
  const industrySuggestions = uniq(l => l.job_industry);
  const zipcodeSuggestions = uniq(l => l.zipcode);
  const productSuggestions = uniq(l => l.product);
  const competitorSuggestions = uniq(l => l.competitor);

  return (
    <div className="space-y-3">
      {/* Search + toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={filters.search || ''}
            onChange={e => setOne('search', e.target.value)}
            placeholder="Search by name, company, phone, email…"
            className="pl-9"
          />
          {filters.search && (
            <button onClick={() => setOne('search', '')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdvanced(v => !v)}
          className={`gap-1.5 shrink-0 h-9 ${activeFilterCount > 0 ? 'border-gray-800 text-gray-900' : ''}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 bg-gray-900 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
          {/* Sort (single-select) */}
          <div className="w-40">
            <label className="text-xs text-gray-500 mb-1 block">Sort By</label>
            <Select value={filters.sort || 'newest'} onValueChange={v => setOne('sort', v)}>
              <SelectTrigger className="h-8 text-xs">
                <ArrowUpDown className="w-3 h-3 mr-1 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-[11px] text-gray-400 -mb-1">Pick multiple in any category — matches use OR within a category, AND across categories.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ChipGroup label="Company" options={COMPANIES} selected={filters.company} onToggle={v => toggle('company', v)} />
            <ChipGroup label="Relationship" options={RELATIONSHIP_TYPES} selected={filters.relationship_type} onToggle={v => toggle('relationship_type', v)} />
            <ChipGroup label="Stage" options={STAGES} selected={filters.stage} onToggle={v => toggle('stage', v)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MultiAutocomplete label="Industry" values={filters.industry} onChange={vals => setValues('industry', vals)} suggestions={industrySuggestions} placeholder="Add industry…" />
            <MultiAutocomplete label="ZIP Code" values={filters.zipcode} onChange={vals => setValues('zipcode', vals)} suggestions={zipcodeSuggestions} placeholder="Add ZIP…" />
            <MultiAutocomplete label="Product" values={filters.product} onChange={vals => setValues('product', vals)} suggestions={productSuggestions} placeholder="Add product…" />
            <MultiAutocomplete label="Competitor" values={filters.competitor} onChange={vals => setValues('competitor', vals)} suggestions={competitorSuggestions} placeholder="Add competitor…" />
          </div>

          {(activeFilterCount > 0 || (filters.sort && filters.sort !== 'newest')) && (
            <div className="flex justify-end">
              <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
                <X className="w-3 h-3" /> Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
