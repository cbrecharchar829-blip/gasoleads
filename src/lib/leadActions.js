// -----------------------------------------------------------------------------
// Shared lead actions — ONE correct copy of "add a lead" and "mark a touch done".
// Previously these were copy-pasted across Home / Leads / LeadDetail and had
// drifted apart. Centralizing them removes that whole class of bug.
// -----------------------------------------------------------------------------
import moment from 'moment';
import { base44 } from '@/api/localClient';
import { getCadenceKey, calculateColorStatus, scheduleTouch } from '@/lib/cadenceUtils';
import { shiftToBusinessDay } from '@/lib/businessDays';

// Turn the Add-Lead form into clean, save-ready data.
// FIX (the #1 bug): blank "count" / "roll_call" used to be empty strings, which
// the backend rejected -> the lead silently failed to save. We coerce them to
// null, drop empty phone/email rows, and only keep client_status for Clients.
function sanitizeForm(form) {
  const toNumberOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const relationship = form.relationship_type || 'Prospect';

  return {
    ...form,
    company: form.company || 'ADP',
    relationship_type: relationship,
    client_status: relationship === 'Client' ? (form.client_status || 'New') : null,
    phones: (form.phones || []).filter((p) => p && (p.value || '').trim()),
    emails: (form.emails || []).filter((e) => e && (e.value || '').trim()),
    count: toNumberOrNull(form.count),
    roll_call: toNumberOrNull(form.roll_call),
  };
}

// Create a lead from the Add-Lead form and SCHEDULE its first/next touch.
// Adding a lead no longer auto-logs a touch — you mark it done when you do it.
//
// options (all optional):
//   firstTouchAt : ISO string — when the first touch is due (default: now/today).
//   touchesDone  : number     — start mid-cadence: how many touches already happened.
//   lastTouchAt  : ISO string — when that last touch happened (anchors the schedule).
//
// User-chosen dates are honored exactly (no "never sooner than tomorrow" clamp).
export async function addLead(form, templates, options = {}) {
  const clean = sanitizeForm(form);
  const cadenceKey = getCadenceKey(clean.company, clean.relationship_type, clean.client_status || 'New');
  const template = templates.find((t) => t.key === cadenceKey);
  const now = new Date().toISOString();

  const midCadence = options.touchesDone != null && Number(options.touchesDone) > 0;

  let nextIndex;
  let anchor;
  let stage;
  let lastTouchDate;
  if (midCadence) {
    nextIndex = Number(options.touchesDone);     // touches 0..N-1 done → next is index N
    anchor = options.lastTouchAt || now;
    stage = 'Contacted';
    lastTouchDate = anchor;
  } else {
    nextIndex = 0;                               // brand-new lead, nothing logged yet
    anchor = options.firstTouchAt || now;
    stage = 'New';
    lastTouchDate = null;
  }

  const sched = scheduleTouch(template, nextIndex, anchor);

  const leadData = {
    ...clean,
    stage,
    cadence_key: cadenceKey,
    cadence_start_date: sched.cadence_start_date || anchor,
    current_touch_index: nextIndex,
    cadence_completed: !!sched.cadence_completed,
    last_touch_date: lastTouchDate,
    next_touch_channel: sched.cadence_completed ? null : sched.next_touch_channel,
    next_touch_date: sched.cadence_completed ? null : sched.next_touch_date,
  };

  // Rule 1 (at creation): a lead added as already past its last touch has a
  // finished non-permanent cadence with no response yet — drop it to Nurture.
  if (sched.cadence_completed) {
    leadData.stage = 'Nurture';
    leadData.nurture_revisit_date = moment().add(6, 'weeks').toISOString();
  }

  leadData.color_status = calculateColorStatus(leadData.next_touch_date);

  const newLead = await base44.entities.Lead.create(leadData);

  // Optional first note from the Add-Lead form — pinned to the top of the list.
  if (options.firstNote && options.firstNote.trim()) {
    await base44.entities.Note.create({
      lead_id: newLead.id,
      content: options.firstNote.trim(),
      pinned: true,
    });
  }

  return newLead;
}

// Mark the current touch done: log it, then schedule the next one (or complete
// / loop the cadence). Mutates the lead via the data layer.
export async function markTouchDone(lead, templates) {
  const template = templates.find((t) => t.key === lead.cadence_key);
  const nextIndex = (lead.current_touch_index || 0) + 1;
  const now = new Date().toISOString();

  await base44.entities.TouchLog.create({
    lead_id: lead.id,
    touch_index: lead.current_touch_index || 0,
    channel: lead.next_touch_channel || '',
    completed_date: now,
  });

  const updateData = { current_touch_index: nextIndex, last_touch_date: now };

  // First touch advances New -> Contacted
  if (lead.stage === 'New') updateData.stage = 'Contacted';

  // Never schedule sooner than tomorrow (one touch per day max)
  const tomorrow = moment().add(1, 'day').startOf('day');

  if (template) {
    updateData.cadence_template_missing = false; // template found — clear any stale flag
    if (template.is_recurring) {
      const channels = template.channels;
      const nextDate = moment().add(template.recurring_interval_days, 'days');
      updateData.next_touch_channel = channels[nextIndex % channels.length];
      updateData.next_touch_date = shiftToBusinessDay((nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString());
      updateData.color_status = 'green';
    } else if (nextIndex >= template.total_touches) {
      if (lead.permanent_cadence) {
        // Restart the cadence from the TRUE beginning (index 0), so the first
        // touch fires on every loop. (Day-0 offsets clamp to tomorrow below.)
        const dayOffset = template.touch_days[0] || 0;
        const nextDate = moment().add(dayOffset, 'days');
        updateData.current_touch_index = 0;
        updateData.cadence_start_date = now;
        updateData.cadence_completed = false;
        updateData.next_touch_channel = template.channels[0];
        updateData.next_touch_date = shiftToBusinessDay((nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString());
        updateData.color_status = 'green';
      } else {
        // Rule 1: a non-permanent cadence just finished its full sequence (the
        // last touch is the breakup message). If the lead never logged a
        // response across the whole sequence, drop it to Nurture automatically.
        // If they ever responded, leave the stage alone — the rep is engaging.
        updateData.cadence_completed = true;
        updateData.next_touch_date = null;
        updateData.next_touch_channel = null;
        const responded = await base44.entities.TouchLog.filter(
          { lead_id: lead.id, response_received: true }, null, 1
        );
        if (responded.length === 0) {
          updateData.stage = 'Nurture';
          updateData.nurture_revisit_date = moment().add(6, 'weeks').toISOString();
        }
      }
    } else {
      const dayOffset = template.touch_days[nextIndex] || 0;
      const nextDate = moment(lead.cadence_start_date).add(dayOffset, 'days');
      updateData.next_touch_date = shiftToBusinessDay((nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString());
      updateData.next_touch_channel = template.channels[nextIndex % template.channels.length];
      updateData.color_status = calculateColorStatus(updateData.next_touch_date);
    }
  } else {
    // No matching cadence template (e.g. its Partnership Type was deleted). The
    // touch is still logged, but we can't compute a next one — so clear the
    // schedule instead of leaving a stale past date stuck on the Today page,
    // and flag the lead so the UI can warn that its template is missing.
    updateData.next_touch_date = null;
    updateData.next_touch_channel = null;
    updateData.color_status = 'green';
    updateData.cadence_template_missing = true;
  }

  await base44.entities.Lead.update(lead.id, updateData);
  return updateData;
}

// True when marking a touch done should ask for confirmation first: a recurring
// cadence that already had a touch logged TODAY. Recurring cadences schedule the
// next touch as "interval days from now", so doing several in one day just keeps
// resetting the same date and inflates the counter — so we confirm. (Fixed
// cadences already self-limit via their one-touch-per-day clamp.)
export function shouldConfirmSameDayTouch(lead, templates) {
  const template = templates.find((t) => t.key === lead.cadence_key);
  return !!(
    template?.is_recurring &&
    lead.last_touch_date &&
    moment(lead.last_touch_date).isSame(moment(), 'day')
  );
}

// Rule 2 actions — the user's decision on a shoulder-tapped permanent-loop lead.
// "Keep going" just resets the 3-week inactivity clock (no stage change).
export async function dismissShoulderTap(lead) {
  return base44.entities.Lead.update(lead.id, { nudge_dismissed_date: new Date().toISOString() });
}

// "Move to Nurture" — the user chooses to park a looping lead.
export async function moveLeadToNurture(lead) {
  return base44.entities.Lead.update(lead.id, {
    stage: 'Nurture',
    nurture_revisit_date: moment().add(6, 'weeks').toISOString(),
  });
}

// Restart the whole cadence from the first touch. Keeps all prior touch history
// (and its notes) and drops a red "Cadence restarted (N)" marker into the touch
// timeline, then reschedules touch #1 for the next business day and reactivates
// the lead (stage -> Contacted) so it returns to the Today tab.
export async function restartCadence(lead, templates) {
  const template = templates.find((t) => t.key === lead.cadence_key);
  const now = new Date().toISOString();
  const restartIndex = (lead.restart_count || 0) + 1;

  // Timeline marker (rendered as a red divider in Touch History). Stored as a
  // TouchLog with is_restart_marker so it sorts inline by date; it is excluded
  // from the weekly-touches count and never rendered as a real touch row.
  await base44.entities.TouchLog.create({
    lead_id: lead.id,
    is_restart_marker: true,
    restart_index: restartIndex,
    channel: '',
    completed_date: now,
  });

  // First touch of the new cycle: today, rolled forward off weekends/days-off.
  const firstChannel = template ? template.channels[0] : (lead.next_touch_channel || 'Call');
  const firstDate = shiftToBusinessDay(now);

  const updateData = {
    current_touch_index: 0,
    cadence_start_date: firstDate,
    cadence_completed: false,
    cadence_template_missing: template ? false : lead.cadence_template_missing,
    stage: 'Contacted',
    restart_count: restartIndex,
    next_touch_channel: firstChannel,
    next_touch_date: firstDate,
    color_status: calculateColorStatus(firstDate),
    nudge_dismissed_date: now, // fresh activity — don't immediately shoulder-tap
  };

  await base44.entities.Lead.update(lead.id, updateData);
  return updateData;
}
