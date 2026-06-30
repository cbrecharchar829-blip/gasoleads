// -----------------------------------------------------------------------------
// Cadence rule tests — runs the REAL app logic (markTouchDone / needsShoulderTap
// and the local data layer) against a simulated clock. No app changes needed.
//
//   Run:  npm run test:cadence      (from the project root)
//   or:   node ./scripts/cadence-tests.mjs
//
// Exits non-zero if any check fails, so it's safe to wire into CI later.
//
// What it verifies:
//   [1]  Non-permanent cadence -> auto-Nurture ONLY after the final touch, and
//        only when no response was ever logged (Rule 1).
//   [2]  Permanent cadence -> shoulder-tap FLAG after 3 weeks idle, never an
//        auto-move; recent contact / dismissal clears it (Rule 2).
//   [3]  The old "4 weeks from start date" auto-Nurture is gone — actively-worked
//        leads are not moved.
//   [4]  Marking a touch done always advances next_touch_date (never stuck on a
//        past/same date), with weekends skipped.
// -----------------------------------------------------------------------------

import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// --- browser + clock stubs (install BEFORE importing app code) ---------------
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

// Controllable clock: moment(), new Date(), and Date.now() all follow FAKE.
const RealDate = Date;
let FAKE = RealDate.parse('2026-03-02T09:00:00'); // a Monday
globalThis.Date = class extends RealDate {
  constructor(...args) { if (args.length === 0) super(FAKE); else super(...args); }
  static now() { return FAKE; }
};
const advanceTo = (iso) => { FAKE = Math.max(FAKE, RealDate.parse(iso)); };
const resetClock = () => { FAKE = RealDate.parse('2026-03-02T09:00:00'); };

// Map "@/..." imports to ./src so we can load the real modules.
register(pathToFileURL(path.resolve('scripts/alias-hook.mjs')).href);

const { base44 } = await import('@/api/localClient.js');
const { markTouchDone } = await import('@/lib/leadActions.js');
const { needsShoulderTap } = await import('@/lib/cadenceUtils.js');
const moment = (await import('moment')).default;

// --- tiny assert framework ---------------------------------------------------
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  PASS:', msg); }
  else { fail++; console.log('  ** FAIL **:', msg); }
};
const section = (title) => console.log('\n' + title);

const templates = await base44.entities.CadenceTemplate.list('-created_date', 50);
const ap = templates.find((t) => t.key === 'adp_prospect');     // fixed, non-permanent
const partner = templates.find((t) => t.key === 'adp_partner'); // recurring (permanent loop)

const newFixed = (extra = {}) => base44.entities.Lead.create({
  name: 'P', company: 'ADP', relationship_type: 'Prospect', cadence_key: 'adp_prospect',
  cadence_start_date: new Date().toISOString(), current_touch_index: 0,
  next_touch_channel: ap.channels[0], next_touch_date: new Date().toISOString(),
  stage: 'New', permanent_cadence: false, ...extra,
});

// ============================================================================
section('[1] NON-PERMANENT: full sequence, no response -> Nurture only at the end');
resetClock();
let f = await newFixed();
let movedEarly = false, completedEarly = false;
const n = ap.total_touches;
for (let i = 1; i <= n; i++) {
  f = await base44.entities.Lead.get(f.id);
  advanceTo(f.next_touch_date);
  await markTouchDone(f, templates);
  f = await base44.entities.Lead.get(f.id);
  if (i < n) {
    if (f.stage === 'Nurture') movedEarly = true;
    if (f.cadence_completed) completedEarly = true;
  }
}
ok(!movedEarly, 'lead was NOT moved to Nurture before the final touch');
ok(!completedEarly, 'cadence was NOT marked completed before the final touch');
ok(f.cadence_completed === true, 'cadence IS completed after the last touch');
ok(f.stage === 'Nurture', 'lead IS in Nurture after the last touch (no response logged)');
ok(f.next_touch_date == null, 'no next touch scheduled after completion');

section('[1b] NON-PERMANENT: same sequence but a response WAS logged -> stays put');
resetClock();
let g = await newFixed();
for (let i = 1; i <= n; i++) {
  g = await base44.entities.Lead.get(g.id);
  advanceTo(g.next_touch_date);
  await markTouchDone(g, templates);
  if (i === 4) {
    const logs = await base44.entities.TouchLog.filter({ lead_id: g.id }, '-completed_date', 99);
    await base44.entities.TouchLog.update(logs[0].id, { response_received: true });
  }
}
g = await base44.entities.Lead.get(g.id);
ok(g.cadence_completed === true, 'cadence completes');
ok(g.stage !== 'Nurture', `lead NOT auto-nurtured because a response was logged (stage=${g.stage})`);

// ============================================================================
section('[2] PERMANENT: shoulder-tap flag by 3-week inactivity (never auto-moved)');
resetClock();
const idle = moment().subtract(22, 'days').toISOString();
const recent = moment().subtract(4, 'days').toISOString();
ok(needsShoulderTap({ stage: 'Contacted', cadence_key: 'adp_partner', last_touch_date: idle }, partner) === true,
  'permanent lead idle 22d IS flagged for the shoulder tap');
ok(needsShoulderTap({ stage: 'Contacted', cadence_key: 'adp_partner', last_touch_date: recent }, partner) === false,
  'permanent lead contacted 4d ago is NOT flagged');
ok(needsShoulderTap({ stage: 'Nurture', cadence_key: 'adp_partner', last_touch_date: idle }, partner) === false,
  'already-Nurture lead is NOT flagged');
ok(needsShoulderTap({ stage: 'Contacted', cadence_key: 'adp_partner', last_touch_date: idle, nudge_dismissed_date: recent }, partner) === false,
  '"Keep going" (recent dismissal) resets the 3-week clock');
const beforeObj = { stage: 'Contacted', cadence_key: 'adp_partner', last_touch_date: idle };
const snap = JSON.stringify(beforeObj);
needsShoulderTap(beforeObj, partner);
ok(JSON.stringify(beforeObj) === snap, 'detector is read-only — it never mutates/auto-moves the lead');

// ============================================================================
section('[3] OLD 4-week start-date auto-Nurture is GONE');
resetClock();
let old = await newFixed({
  cadence_start_date: moment().subtract(6, 'weeks').toISOString(),
  last_touch_date: recent, stage: 'Contacted', current_touch_index: 3,
  next_touch_channel: ap.channels[3], next_touch_date: moment().subtract(1, 'day').toISOString(),
});
await markTouchDone(old, templates);
old = await base44.entities.Lead.get(old.id);
ok(old.stage !== 'Nurture', `actively-worked lead with 6-week-old start is NOT auto-nurtured (stage=${old.stage})`);
ok(needsShoulderTap(old, ap) === false, 'non-permanent lead is never shoulder-tapped (Rule 2 only applies to permanent loops)');

// ============================================================================
section('[4] Marking done ADVANCES next_touch_date (do each touch on its due date)');
resetClock();
let h = await newFixed();
let strict = true, neverPast = true; const seq = [];
for (let i = 1; i <= 12; i++) {
  h = await base44.entities.Lead.get(h.id);
  advanceTo(h.next_touch_date);
  const prev = h.next_touch_date;
  await markTouchDone(h, templates);
  h = await base44.entities.Lead.get(h.id);
  if (h.cadence_completed) break;
  seq.push(moment(h.next_touch_date).format('ddd MM-DD'));
  if (!moment(h.next_touch_date).isAfter(moment(prev))) strict = false;
  if (moment(h.next_touch_date).isBefore(moment(FAKE).startOf('day'))) neverPast = false;
  const dow = moment(h.next_touch_date).day();
  if (dow === 0 || dow === 6) neverPast = false; // also: never lands on a weekend
}
console.log('  fixed dates:', seq.join('  '));
ok(strict, 'fixed: next_touch_date strictly advances on each on-time mark-done');
ok(neverPast, 'fixed: next_touch_date never in the past and never on a weekend');

resetClock();
let r = await base44.entities.Lead.create({
  name: 'R', company: 'ADP', relationship_type: 'Partner', cadence_key: 'adp_partner',
  cadence_start_date: new Date().toISOString(), current_touch_index: 0,
  next_touch_channel: partner.channels[0], next_touch_date: new Date().toISOString(),
  stage: 'New', permanent_cadence: false,
});
let rStrict = true; const rseq = [];
for (let i = 1; i <= 5; i++) {
  r = await base44.entities.Lead.get(r.id);
  advanceTo(r.next_touch_date);
  const prev = r.next_touch_date;
  await markTouchDone(r, templates);
  r = await base44.entities.Lead.get(r.id);
  rseq.push(moment(r.next_touch_date).format('ddd MM-DD'));
  if (!moment(r.next_touch_date).isAfter(moment(prev))) rStrict = false;
}
console.log('  recurring dates:', rseq.join('  '));
ok(rStrict, 'recurring: each mark-done schedules a strictly later next_touch_date');

// --- summary -----------------------------------------------------------------
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);
