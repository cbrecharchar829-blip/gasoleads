import React, { useState, useRef, useEffect } from 'react';
import { Search, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STAGES } from '@/lib/cadenceUtils';

const COMPANIES = ['ADP', 'CaneyCloud/VAV'];
const RELATIONSHIP_TYPES = ['Prospect', 'Partner', 'Client'];

function AutocompleteInput({ value, onChange, suggestions, placeholder, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const filtered = value
    ? [...new Set(suggestions.filter(s => s && s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()))].slice(0, 8)
    : [];

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
      {value && (
        <button onClick={() => { onChange(''); setOpen(false); }} className="absolute right-2 top-[26px] text-gray-400 hover:text-gray-600">
          <X className="w-3 h-3" />
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg text-xs max-h-40 overflow-y-auto">
          {filtered.map(s => (
            <li
              key={s}
              onMouseDown={() => { onChange(s); setOpen(false); }}
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

  const set = (key, val) => onChange({ ...filters, [key]: val === 'all' ? '' : val });
  const clearAll = () => onChange({ search: '', company: '', relationship_type: '', stage: '', industry: '', zipcode: '', sort: 'newest' });

  const activeFilterCount = [filters.company, filters.relationship_type, filters.stage, filters.industry, filters.zipcode].filter(Boolean).length;

  const industrySuggestions = leads.map(l => l.job_industry).filter(Boolean);
  const zipcodeSuggestions = leads.map(l => l.zipcode).filter(Boolean);

  return (
    <div className="space-y-3">
      {/* Search + toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={filters.search || ''}
            onChange={e => set('search', e.target.value)}
            placeholder="Search by name, company, phone, email…"
            className="pl-9"
          />
          {filters.search && (
            <button onClick={() => set('search', '')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Sort */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sort By</label>
              <Select value={filters.sort || 'newest'} onValueChange={v => set('sort', v)}>
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
            {/* Company */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Company</label>
              <Select value={filters.company || 'all'} onValueChange={v => set('company', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {COMPANIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Relationship */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Relationship</label>
              <Select value={filters.relationship_type || 'all'} onValueChange={v => set('relationship_type', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {RELATIONSHIP_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Stage */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Stage</label>
              <Select value={filters.stage || 'all'} onValueChange={v => set('stage', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Industry autocomplete */}
            <AutocompleteInput
              label="Industry"
              value={filters.industry || ''}
              onChange={v => set('industry', v)}
              suggestions={industrySuggestions}
              placeholder="e.g. Healthcare"
            />
            {/* ZIP autocomplete */}
            <AutocompleteInput
              label="ZIP Code"
              value={filters.zipcode || ''}
              onChange={v => set('zipcode', v)}
              suggestions={zipcodeSuggestions}
              placeholder="e.g. 77001"
            />
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
