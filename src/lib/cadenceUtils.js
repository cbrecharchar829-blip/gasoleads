import moment from 'moment';

// Generate touch schedule from a cadence template for a lead
export function generateTouchSchedule(template, startDate) {
  const start = moment(startDate);
  const touches = [];

  if (template.touch_days && template.touch_days.length > 0) {
    // Fixed schedule
    for (let i = 0; i < template.total_touches; i++) {
      const dayOffset = template.touch_days[i] || 0;
      touches.push({
        index: i,
        channel: template.channels[i % template.channels.length],
        due_date: start.clone().add(dayOffset, 'days').toISOString(),
      });
    }
  } else if (template.is_recurring && template.recurring_interval_days) {
    // Recurring: generate a batch of touches cycling through channels
    const channelCount = template.channels.length;
    for (let i = 0; i < channelCount; i++) {
      touches.push({
        index: i,
        channel: template.channels[i],
        due_date: start.clone().add(i * template.recurring_interval_days, 'days').toISOString(),
      });
    }
  }

  return touches;
}

// Get next touch info for a lead
export function getNextTouch(template, currentTouchIndex, lastTouchDate) {
  if (!template) return null;

  if (template.is_recurring) {
    const channels = template.channels;
    const nextChannel = channels[currentTouchIndex % channels.length];
    const nextDate = moment(lastTouchDate || new Date())
      .add(template.recurring_interval_days, 'days')
      .toISOString();
    return { channel: nextChannel, date: nextDate, index: currentTouchIndex };
  }

  // Fixed cadence
  if (currentTouchIndex >= template.total_touches) {
    return null; // cadence complete
  }

  const nextChannel = template.channels[currentTouchIndex % template.channels.length];
  const startDate = moment(lastTouchDate || new Date());
  return { channel: nextChannel, date: startDate.toISOString(), index: currentTouchIndex };
}

// Calculate color status based on next touch date
export function calculateColorStatus(nextTouchDate) {
  if (!nextTouchDate) return 'green';

  const now = moment();
  const due = moment(nextTouchDate);
  const diffDays = due.diff(now, 'days', true);

  if (diffDays >= 0) return 'green';       // on track or due today
  if (diffDays >= -2) return 'yellow';      // 1-2 days overdue
  return 'red';                             // 3+ days overdue
}

// Get cadence key from lead fields.
// NOTE: spaces are converted to underscores so multi-word custom partnership
// types (e.g. "Referral Partner") match the key created in Settings.
export function getCadenceKey(company, relationshipType, clientStatus) {
  const companyKey = company === 'ADP' ? 'adp' : 'caneycloud';
  const slug = (s) => (s || '').toLowerCase().replace(/\s+/g, '_');

  if (relationshipType === 'Client') {
    const status = slug(clientStatus || 'New');
    return `${companyKey}_client_${status}`;
  }

  return `${companyKey}_${slug(relationshipType)}`;
}

// Shared scheduling brain. Computes the scheduling fields for a lead whose NEXT
// touch is `nextIndex` (0-based), measured from `anchorDate`.
//   - nextIndex === 0 : new lead. anchorDate is the desired first-touch date/time.
//   - nextIndex  >  0 : mid-cadence. anchorDate is when the PREVIOUS touch happened.
// Returns { next_touch_channel, next_touch_date, cadence_start_date, cadence_completed }.
export function scheduleTouch(template, nextIndex, anchorDate) {
  const anchorIso = moment(anchorDate).toISOString();

  if (!template) {
    return { next_touch_channel: null, next_touch_date: anchorIso, cadence_start_date: anchorIso, cadence_completed: false };
  }

  const channels = template.channels || [];
  const channelFor = (i) => (channels.length ? channels[i % channels.length] : null);

  // Recurring cadence: each touch is one interval after the previous one.
  if (template.is_recurring) {
    if (nextIndex <= 0) {
      return { next_touch_channel: channelFor(0), next_touch_date: anchorIso, cadence_start_date: anchorIso, cadence_completed: false };
    }
    const date = moment(anchorDate).add(template.recurring_interval_days || 0, 'days').toISOString();
    return { next_touch_channel: channelFor(nextIndex), next_touch_date: date, cadence_start_date: anchorIso, cadence_completed: false };
  }

  // Fixed cadence: touch_days[] holds day-offsets from the cadence start.
  if (nextIndex >= (template.total_touches || channels.length)) {
    return { next_touch_channel: null, next_touch_date: null, cadence_start_date: anchorIso, cadence_completed: true };
  }
  const days = template.touch_days || [];
  if (nextIndex <= 0) {
    // First touch happens at the anchor; back-derive the start so offsets line up.
    const start = moment(anchorDate).subtract(days[0] || 0, 'days');
    return { next_touch_channel: channelFor(0), next_touch_date: anchorIso, cadence_start_date: start.toISOString(), cadence_completed: false };
  }
  // Mid-cadence: anchor is when the previous touch (index nextIndex-1) happened.
  const prevOffset = days[nextIndex - 1] || 0;
  const start = moment(anchorDate).subtract(prevOffset, 'days');
  const nextOffset = days[nextIndex] || 0;
  const date = start.clone().add(nextOffset, 'days').toISOString();
  return { next_touch_channel: channelFor(nextIndex), next_touch_date: date, cadence_start_date: start.toISOString(), cadence_completed: false };
}

// Default cadence templates data
export const DEFAULT_CADENCE_TEMPLATES = [
  {
    key: 'adp_prospect',
    label: 'ADP – Prospect',
    company: 'ADP',
    relationship_type: 'Prospect',
    client_status: '',
    is_recurring: false,
    total_touches: 13,
    total_days: 18,
    recurring_interval_days: 0,
    channels: ['Call', 'Text', 'Email', 'In-person drop-in', 'Call', 'Email', 'Text', 'Call', 'In-person drop-in', 'Email', 'Call', 'Text', 'Email'],
    touch_days: [0, 0, 1, 2, 3, 4, 5, 7, 9, 11, 13, 15, 18],
    no_repeat_channel: true,
  },
  {
    key: 'adp_partner',
    label: 'ADP – Partner',
    company: 'ADP',
    relationship_type: 'Partner',
    client_status: '',
    is_recurring: true,
    total_touches: 2,
    total_days: 0,
    recurring_interval_days: 10,
    channels: ['Email', 'Call'],
    touch_days: [],
    no_repeat_channel: false,
  },
  {
    key: 'caneycloud_prospect',
    label: 'CaneyCloud/VAV – Prospect',
    company: 'CaneyCloud/VAV',
    relationship_type: 'Prospect',
    client_status: '',
    is_recurring: false,
    total_touches: 4,
    total_days: 10,
    recurring_interval_days: 0,
    channels: ['WhatsApp', 'Call', 'WhatsApp', 'Email'],
    touch_days: [0, 3, 6, 10],
    no_repeat_channel: false,
  },
  {
    key: 'caneycloud_client_new',
    label: 'CaneyCloud/VAV – Client (New)',
    company: 'CaneyCloud/VAV',
    relationship_type: 'Client',
    client_status: 'New',
    is_recurring: true,
    total_touches: 3,
    total_days: 0,
    recurring_interval_days: 14,
    channels: ['WhatsApp', 'Call', 'Email'],
    touch_days: [],
    no_repeat_channel: false,
  },
  {
    key: 'caneycloud_client_established',
    label: 'CaneyCloud/VAV – Client (Established)',
    company: 'CaneyCloud/VAV',
    relationship_type: 'Client',
    client_status: 'Established',
    is_recurring: true,
    total_touches: 3,
    total_days: 0,
    recurring_interval_days: 28,
    channels: ['WhatsApp', 'Call', 'Email'],
    touch_days: [],
    no_repeat_channel: false,
  },
  {
    key: 'caneycloud_partner',
    label: 'CaneyCloud/VAV – Partner',
    company: 'CaneyCloud/VAV',
    relationship_type: 'Partner',
    client_status: '',
    is_recurring: true,
    total_touches: 3,
    total_days: 0,
    recurring_interval_days: 14,
    channels: ['WhatsApp', 'Call', 'Email'],
    touch_days: [],
    no_repeat_channel: false,
  },
];

export const STAGES = ['New', 'Contacted', 'Engaged', 'Meeting', 'Won', 'Lost', 'Nurture'];

export const CHANNEL_ICONS = {
  'Call': 'Phone',
  'Text': 'MessageSquare',
  'Email': 'Mail',
  'WhatsApp': 'MessageCircle',
  'In-person drop-in': 'MapPin',
};
