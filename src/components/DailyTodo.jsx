// -----------------------------------------------------------------------------
// DailyTodo — an ADHD-optimized, deliberately minimal daily task panel for the
// Today page. No due dates, subtasks, categories, or notifications.
//
//   • Active zone: the top 3 OPEN tasks (+ a quick-add box).
//   • Later pen:   a SEPARATE, collapsed section for open tasks #4+ — overflow
//                  stays out of sight (not a one-tap "show all").
//   • Auto-refill: checking an active task sinks it to Done, and the next open
//                  task promotes into the active zone automatically.
//   • Drag to reorder within the open list (top = next up). No priority labels.
//   • Daily reset: done tasks clear on a new day; unchecked tasks carry over with
//                  a "carried over" tag; 3+ days carried → red do/delegate/kill nudge.
//
// Everything lives in localStorage under `gasoleads:todos`.
// -----------------------------------------------------------------------------
import React, { useState, useEffect, useRef } from 'react';
import moment from 'moment';
import { Plus, X, GripVertical, ChevronDown, ChevronRight, ListChecks, Circle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

const KEY = 'gasoleads:todos';
const todayKey = () => moment().format('YYYY-MM-DD');

let counter = 0;
const uid = () => `todo_${Date.now().toString(36)}_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// Roll the stored state to the current day: drop completed tasks and bump the
// carry counter on everything that survived unchecked (by whole days elapsed, so
// leaving the app closed for a few days still ages tasks correctly).
function applyDailyReset(state) {
  const today = todayKey();
  if (state.date === today) return state;
  let elapsed = moment(today).diff(moment(state.date), 'days');
  if (!Number.isFinite(elapsed) || elapsed < 1) elapsed = 1;
  const tasks = state.tasks
    .filter(t => !t.done)
    .map(t => ({ ...t, carryDays: (t.carryDays || 0) + elapsed }));
  return { ...state, date: today, tasks };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || !Array.isArray(raw.tasks)) return { date: todayKey(), tasks: [], collapsed: false };
    return applyDailyReset({ collapsed: false, ...raw });
  } catch {
    return { date: todayKey(), tasks: [], collapsed: false };
  }
}

// Insert a task just after the last OPEN task (bottom of the open queue), so new
// items land at the end of the queue (into Later if 3 are already active).
function insertAtOpenEnd(arr, task) {
  let idx = -1;
  for (let i = 0; i < arr.length; i++) if (!arr[i].done) idx = i;
  const next = [...arr];
  next.splice(idx + 1, 0, task);
  return next;
}

export default function DailyTodo() {
  const [state, setState] = useState(load);
  const [text, setText] = useState('');
  const [laterOpen, setLaterOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [dragId, setDragId] = useState(null);

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ }
  }, [state]);

  // Roll over to a new day even if the tab is left open past midnight.
  useEffect(() => {
    const id = setInterval(() => {
      setState(s => (s.date === todayKey() ? s : applyDailyReset(s)));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const open = state.tasks.filter(t => !t.done);
  const active = open.slice(0, 3);
  const later = open.slice(3);
  const done = state.tasks.filter(t => t.done);

  const addTask = () => {
    const t = text.trim();
    if (!t) return;
    setState(s => ({ ...s, tasks: insertAtOpenEnd(s.tasks, { id: uid(), text: t, done: false, carryDays: 0 }) }));
    setText('');
  };

  const toggleDone = (id) => setState(s => {
    const arr = s.tasks.map(t => (t.id === id ? { ...t, done: !t.done } : t));
    const i = arr.findIndex(t => t.id === id);
    const [it] = arr.splice(i, 1);
    if (it.done) arr.push(it);                 // done → sink to the bottom
    else return { ...s, tasks: insertAtOpenEnd(arr, it) }; // un-done → bottom of open queue
    return { ...s, tasks: arr };
  });

  const remove = (id) => setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));

  const dropOn = (targetId) => setState(s => {
    if (!dragId || dragId === targetId) return s;
    const arr = [...s.tasks];
    const from = arr.findIndex(t => t.id === dragId);
    if (from < 0) return s;
    const [moved] = arr.splice(from, 1);
    const to = arr.findIndex(t => t.id === targetId);
    if (to < 0) { arr.splice(from, 0, moved); return s; }
    arr.splice(to, 0, moved);
    return { ...s, tasks: arr };
  });

  const setCollapsed = (v) => setState(s => ({ ...s, collapsed: v }));

  const TaskRow = ({ t, canDrag }) => {
    const carry = t.carryDays || 0;
    const nudge = carry >= 3;
    return (
      <div
        draggable={canDrag}
        onDragStart={() => setDragId(t.id)}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => { if (canDrag) e.preventDefault(); }}
        onDrop={() => canDrag && dropOn(t.id)}
        className={`group flex items-start gap-1.5 rounded-lg px-2 py-1.5 border ${nudge ? 'border-red-300 bg-red-50/60' : 'border-transparent hover:border-gray-100 hover:bg-gray-50'} transition-colors`}
      >
        {canDrag && (
          <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        <button onClick={() => toggleDone(t.id)} className="mt-0.5 shrink-0" title={t.done ? 'Mark not done' : 'Mark done'}>
          {t.done
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <Circle className={`w-4 h-4 ${nudge ? 'text-red-400' : 'text-gray-300 hover:text-gray-500'}`} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug break-words ${t.done ? 'line-through text-gray-400' : nudge ? 'text-red-800' : 'text-gray-800'}`}>{t.text}</p>
          {!t.done && nudge && (
            <p className="text-[10px] text-red-600 font-medium flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 shrink-0" /> carried {carry}d · do it, delegate it, or kill it
            </p>
          )}
          {!t.done && carry >= 1 && carry < 3 && (
            <p className="text-[10px] text-gray-400 mt-0.5">carried over{carry > 1 ? ` · ${carry}d` : ''}</p>
          )}
        </div>
        <button onClick={() => remove(t.id)} className="text-gray-300 hover:text-red-500 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete task">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!state.collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 text-left"
      >
        <ListChecks className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-900">To-Do</span>
        <span className="text-xs text-gray-400">{open.length ? `${active.length} up · ${later.length} later` : 'clear'}</span>
        <span className="ml-auto text-gray-400">{state.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>

      {!state.collapsed && (
        <div className="p-3 space-y-3">
          {/* Quick add */}
          <div className="flex gap-1.5">
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
              placeholder="Jot a task…"
              className="h-9 text-sm"
            />
            <button onClick={addTask} disabled={!text.trim()} title="Add task"
              className="shrink-0 h-9 w-9 rounded-md bg-gray-900 text-white flex items-center justify-center disabled:opacity-40">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Active zone (top 3) */}
          {active.length === 0 ? (
            <p className="text-xs text-gray-400 px-1 py-2">Nothing queued — add a task above.</p>
          ) : (
            <div className="space-y-0.5">
              {active.map(t => <TaskRow key={t.id} t={t} canDrag />)}
            </div>
          )}

          {/* Later pen — separate, collapsed by default */}
          {later.length > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <button onClick={() => setLaterOpen(o => !o)} className="w-full flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800">
                {laterOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Later <span className="text-gray-400">({later.length})</span>
              </button>
              {laterOpen && (
                <div className="space-y-0.5 mt-1">
                  {later.map(t => <TaskRow key={t.id} t={t} canDrag />)}
                </div>
              )}
            </div>
          )}

          {/* Done today — collapsed by default */}
          {done.length > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <button onClick={() => setDoneOpen(o => !o)} className="w-full flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-800">
                {doneOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                ✓ Done today <span className="text-emerald-500/70">({done.length})</span>
              </button>
              {doneOpen && (
                <div className="space-y-0.5 mt-1">
                  {done.map(t => <TaskRow key={t.id} t={t} canDrag={false} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
