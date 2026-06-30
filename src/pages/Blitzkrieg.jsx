import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { Fuel, Users, Settings, Map, Sun, Zap, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FREQUENCIES = ['Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'];

// -----------------------------------------------------------------------------
// Blitzkrieg — live daily trackers. Holds a sub-toggle between sections; for now
// only "Phone Blitz" exists. To add "Win the Day" later: add it to SECTIONS and
// render its component in the switch below — the toggle bar is already wired.
// -----------------------------------------------------------------------------

const STORAGE_KEY = 'gasoleads:phoneblitz';
const CALLS_COUNT = 100;

// Each call square cycles through 3 states on tap (a double-tap lands on
// "contacted", so it works exactly like a double-click without timing hacks):
const EMPTY = 0;      // not dialed
const DIALED = 1;     // dialed, no contact (amber)
const CONTACTED = 2;  // reached someone (blue)

const todayKey = () => moment().format('YYYY-MM-DD');

const blankState = () => ({
  date: todayKey(),
  calls: Array(CALLS_COUNT).fill(EMPTY),
  appts: [],
});

// Load today's data; if the stored day isn't today (or nothing stored), start
// blank. We only ever keep the current day — no history is saved.
function loadToday() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && raw.date === todayKey()) {
      return {
        date: raw.date,
        calls: normalizeStates(raw.calls, CALLS_COUNT),
        appts: Array.isArray(raw.appts) ? raw.appts : [],
      };
    }
  } catch { /* ignore corrupt data */ }
  return blankState();
}

function normalizeStates(arr, len) {
  const out = Array(len).fill(EMPTY);
  if (Array.isArray(arr)) for (let i = 0; i < len; i++) {
    const v = Number(arr[i]);
    out[i] = v === DIALED || v === CONTACTED ? v : EMPTY;
  }
  return out;
}

const SECTIONS = [
  { key: 'phone', label: 'Phone Blitz' },
  // Future: { key: 'win', label: 'Win the Day' },
];

export default function Blitzkrieg() {
  const [section, setSection] = useState('phone');

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">GASOLEADS</h1>
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/blitzkrieg" className="text-gray-900 font-medium flex items-center gap-1.5"><Zap className="w-4 h-4" />Blitzkrieg</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="text-gray-500 flex items-center gap-1.5"><Sun className="w-4 h-4" />Today</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/leads" className="text-gray-500"><Users className="w-4 h-4 mr-1.5" />Leads</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/map" className="text-gray-500"><Map className="w-4 h-4 mr-1.5" />Map</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" className="text-gray-500"><Settings className="w-4 h-4 mr-1.5" />Settings</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Section sub-toggle (room for "Win the Day" later) */}
        <div className="flex items-center gap-1 mb-6 p-1 bg-gray-100 rounded-xl w-fit">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${section === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === 'phone' && <PhoneBlitz />}
      </main>
    </div>
  );
}

function PhoneBlitz() {
  const [state, setState] = useState(loadToday);
  const firstRun = useRef(true);

  // Persist on every change (so a mid-blitz refresh keeps the tally).
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // If the calendar day rolls over while the tab is open, reset to blank.
  useEffect(() => {
    const tick = setInterval(() => {
      setState(prev => (prev.date === todayKey() ? prev : blankState()));
    }, 60 * 1000);
    return () => clearInterval(tick);
  }, []);

  // A contacted call was still a dial, so Dials counts amber + blue.
  const dialsCount = state.calls.filter(c => c >= DIALED).length;
  const contactsCount = state.calls.filter(c => c === CONTACTED).length;
  const apptsCount = state.appts.length;

  // Tap cycles empty -> dialed -> contacted -> empty (double-tap = contacted).
  const cycleCall = (idx) => {
    setState(prev => {
      const next = prev.calls.slice();
      next[idx] = (next[idx] + 1) % 3;
      return { ...prev, calls: next };
    });
  };

  const clearCalls = () => {
    setState(prev => ({ ...prev, calls: prev.calls.map(() => EMPTY) }));
  };

  const addAppt = () => {
    setState(prev => ({ ...prev, appts: [...prev.appts, { id: uid(), name: '', date: '', channel: '', ee: '', benefits: false, frequency: '', note: '' }] }));
  };
  const updateAppt = (id, key, value) => {
    setState(prev => ({ ...prev, appts: prev.appts.map(a => a.id === id ? { ...a, [key]: value } : a) }));
  };
  const removeAppt = (id) => {
    setState(prev => ({ ...prev, appts: prev.appts.filter(a => a.id !== id) }));
  };

  return (
    <div className="space-y-6">
      {/* Date + live tally */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Phone Blitz</h2>
          <p className="text-sm text-gray-500 mt-0.5">{moment().format('dddd, MMMM D')}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Tally label="Dials" value={dialsCount} className="bg-amber-50 text-amber-700" />
          <Tally label="Contacts" value={contactsCount} className="bg-blue-50 text-blue-700" />
          <Tally label="Appts" value={apptsCount} className="bg-emerald-50 text-emerald-700" />
        </div>
      </div>

      {/* Call grid — tap to dial (amber), tap again / double-tap for contacted (blue) */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Calls</h3>
          {dialsCount > 0 && (
            <button onClick={clearCalls} className="text-xs text-gray-400 hover:text-gray-700">Clear</button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500" /> Dialed: <b className="text-gray-700">{dialsCount}</b></span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" /> Contacted: <b className="text-gray-700">{contactsCount}</b></span>
          <span className="text-gray-400">Tap = dialed · double-tap = contacted · tap again to clear</span>
        </div>
        <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] sm:grid-cols-[repeat(20,minmax(0,1fr))] gap-0.5 sm:gap-1">
          {state.calls.map((s, i) => (
            <button
              key={i}
              onClick={() => cycleCall(i)}
              className={`aspect-square rounded-md border transition-colors ${
                s === CONTACTED ? 'bg-blue-500 border-blue-500'
                : s === DIALED ? 'bg-amber-500 border-amber-500'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
              title={`#${i + 1}${s === DIALED ? ' · dialed' : s === CONTACTED ? ' · contacted' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* Appts */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Appts <span className="text-gray-400 font-normal">({apptsCount})</span></h3>
          <Button size="sm" onClick={addAppt} className="gap-1.5"><Plus className="w-4 h-4" />Add row</Button>
        </div>
        {state.appts.length === 0 ? (
          <p className="text-sm text-gray-400">No appointments yet. Tap “Add row” when you book one.</p>
        ) : (
          <div className="space-y-3">
            {state.appts.map(a => (
              <div key={a.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Field label="Name">
                    <Input value={a.name} onChange={e => updateAppt(a.id, 'name', e.target.value)} placeholder="Name" className="h-10" />
                  </Field>
                  <Field label="Date">
                    <Input type="date" value={a.date} onChange={e => updateAppt(a.id, 'date', e.target.value)} className="h-10 px-2" />
                  </Field>
                  <Field label="Channel">
                    <Input value={a.channel} onChange={e => updateAppt(a.id, 'channel', e.target.value)} placeholder="Call, In-person…" className="h-10" />
                  </Field>
                  <Field label="EE#">
                    <Input type="number" min="0" value={a.ee} onChange={e => updateAppt(a.id, 'ee', e.target.value)} placeholder="e.g. 25" className="h-10" />
                  </Field>
                  <Field label="Benefits?">
                    <div className="h-10 flex items-center gap-2">
                      <Switch checked={!!a.benefits} onCheckedChange={v => updateAppt(a.id, 'benefits', v)} />
                      <span className="text-sm text-gray-600">{a.benefits ? 'Yes' : 'No'}</span>
                    </div>
                  </Field>
                  <Field label="Frequency">
                    <Select value={a.frequency || ''} onValueChange={v => updateAppt(a.id, 'frequency', v)}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-start gap-2">
                  <Textarea
                    value={a.note}
                    onChange={e => updateAppt(a.id, 'note', e.target.value)}
                    placeholder="Reminders / notes from this call…"
                    className="min-h-[56px] text-sm flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={() => removeAppt(a.id)} className="h-10 w-9 text-red-500 hover:text-red-700 shrink-0" title="Remove appointment">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] text-gray-400 mb-0.5 block">{label}</label>
      {children}
    </div>
  );
}

function Tally({ label, value, className }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium ${className}`}>
      <span className="font-bold">{value}</span>{label}
    </span>
  );
}

let _c = 0;
function uid() {
  _c += 1;
  return `appt_${_c}_${Math.random().toString(36).slice(2, 7)}`;
}
