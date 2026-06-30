// -----------------------------------------------------------------------------
// Business-day brain — the single source of truth for "what's a working day."
//
// A working day is any weekday (Mon–Fri) that is NOT in the user's Days Off list.
// Two jobs:
//   1. shiftToBusinessDay(date)   — roll an AUTOMATICALLY-scheduled touch off a
//                                    weekend / day-off onto the next working day.
//   2. businessDaysOverdue(date)  — how many WORKING days a touch is past due,
//                                    so weekends & days-off don't drive coloring.
//
// Days Off live in a single localStorage key (this is a browser-only app, so a
// synchronous read here is fine — no need to thread the list through every
// scheduling call). Each entry is { date: 'YYYY-MM-DD', label?: string }.
// -----------------------------------------------------------------------------
import moment from 'moment';

const DAYS_OFF_KEY = 'gasoleads:daysOff';

// --- Days Off storage --------------------------------------------------------

// Returns the raw list: [{ date: 'YYYY-MM-DD', label: string }], sorted by date.
export function getDaysOff() {
  try {
    const raw = JSON.parse(localStorage.getItem(DAYS_OFF_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((d) => d && typeof d.date === 'string')
      .map((d) => ({ date: d.date, label: d.label || '' }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function setDaysOff(list) {
  const clean = (Array.isArray(list) ? list : [])
    .filter((d) => d && typeof d.date === 'string' && d.date.trim())
    .map((d) => ({ date: d.date, label: (d.label || '').trim() }));
  localStorage.setItem(DAYS_OFF_KEY, JSON.stringify(clean));
}

export function addDayOff(date, label = '') {
  if (!date) return getDaysOff();
  const list = getDaysOff().filter((d) => d.date !== date); // de-dupe by date
  list.push({ date, label: (label || '').trim() });
  setDaysOff(list);
  return getDaysOff();
}

export function removeDayOff(date) {
  setDaysOff(getDaysOff().filter((d) => d.date !== date));
  return getDaysOff();
}

// A fast lookup Set of the day-off date strings ('YYYY-MM-DD').
function daysOffSet() {
  return new Set(getDaysOff().map((d) => d.date));
}

// --- Core predicates ---------------------------------------------------------

// True when `m` (a moment) is a working day: a weekday that isn't a day-off.
export function isBusinessDay(m, offSet = daysOffSet()) {
  const dow = m.day(); // 0 = Sun, 6 = Sat
  if (dow === 0 || dow === 6) return false;
  if (offSet.has(m.format('YYYY-MM-DD'))) return false;
  return true;
}

// Roll an automatically-scheduled date forward to the next working day, keeping
// its time-of-day. A date already on a working day is returned unchanged.
// Accepts/returns an ISO string (passes null/undefined through untouched).
export function shiftToBusinessDay(date) {
  if (!date) return date;
  const offSet = daysOffSet();
  const m = moment(date);
  while (!isBusinessDay(m, offSet)) {
    m.add(1, 'day');
  }
  return m.toISOString();
}

// How many WORKING days a touch is overdue, measured by whole days.
//   - due today or in the future        -> 0
//   - each working day strictly after the due day, up to & including today, +1
// Weekends and days-off in between are not counted, so a Friday touch reads as
// 0 over the weekend and only becomes 1 once Monday (a working day) arrives.
export function businessDaysOverdue(nextTouchDate, now = moment()) {
  if (!nextTouchDate) return 0;
  const today = moment(now).startOf('day');
  const due = moment(nextTouchDate).startOf('day');
  if (!due.isBefore(today)) return 0; // due today or future — not overdue

  const offSet = daysOffSet();
  let count = 0;
  const cursor = due.clone().add(1, 'day');
  while (!cursor.isAfter(today)) {
    if (isBusinessDay(cursor, offSet)) count += 1;
    cursor.add(1, 'day');
  }
  return count;
}
