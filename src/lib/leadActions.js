// -----------------------------------------------------------------------------
// Shared lead actions — ONE correct copy of "add a lead" and "mark a touch done".
// Previously these were copy-pasted across Home / Leads / LeadDetail and had
// drifted apart. Centralizing them removes that whole class of bug.
// -----------------------------------------------------------------------------
import moment from 'moment';
import { base44 } from '@/api/localClient';
import { getCadenceKey, calculateColorStatus, scheduleTouch } from '@/lib/cadenceUtils';

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

  // A completed Prospect cadence drops straight into Nurture (existing rule).
  if (sched.cadence_completed && clean.relationship_type === 'Prospect') {
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
    if (template.is_recurring) {
      const channels = template.channels;
      const nextDate = moment().add(template.recurring_interval_days, 'days');
      updateData.next_touch_channel = channels[nextIndex % channels.length];
      updateData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
      updateData.color_status = 'green';
    } else if (nextIndex >= template.total_touches) {
      if (lead.permanent_cadence) {
        // Restart the cadence from the beginning
        const dayOffset = template.touch_days[1] || 1;
        const nextDate = moment().add(dayOffset, 'days');
        updateData.current_touch_index = 1;
        updateData.cadence_start_date = now;
        updateData.cadence_completed = false;
        updateData.next_touch_channel = template.channels[1 % template.channels.length];
        updateData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
        updateData.color_status = 'green';
      } else {
        updateData.cadence_completed = true;
        updateData.next_touch_date = null;
        updateData.next_touch_channel = null;
        if (lead.relationship_type === 'Prospect') {
          updateData.stage = 'Nurture';
          updateData.nurture_revisit_date = moment().add(6, 'weeks').toISOString();
        }
      }
    } else {
      const dayOffset = template.touch_days[nextIndex] || 0;
      const nextDate = moment(lead.cadence_start_date).add(dayOffset, 'days');
      updateData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
      updateData.next_touch_channel = template.channels[nextIndex % template.channels.length];
      updateData.color_status = calculateColorStatus(updateData.next_touch_date);
    }
  }

  await base44.entities.Lead.update(lead.id, updateData);
  return updateData;
}
