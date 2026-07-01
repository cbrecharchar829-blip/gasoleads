// -----------------------------------------------------------------------------
// Backup & restore — export ALL of the app's browser storage to a single JSON
// file, and restore it on another computer/browser. Because every bit of data
// lives in localStorage (leads, notes, cadences, touch logs, meetings, days off,
// to-dos, blitz, tints, etc.), a full backup is simply every `gasoleads:` key.
//
// This is the lifeline for moving to a new computer or recovering from a wipe.
// -----------------------------------------------------------------------------
import moment from 'moment';

const PREFIX = 'gasoleads:';
const LAST_BACKUP_KEY = 'gasoleads:lastBackupAt';
const AUTO_KEY = 'gasoleads:autoBackupDaily';

// Gather every gasoleads:* key. Values are stored as JSON strings, so we parse
// them for a readable file and re-serialize on import.
function collectData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const raw = localStorage.getItem(key);
    try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
  }
  return data;
}

export function buildBackup() {
  return { app: 'gasoleads', version: 1, exportedAt: new Date().toISOString(), data: collectData() };
}

// Trigger a download of the backup file and stamp the last-backup time.
export function downloadBackup() {
  const backup = buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gasoleads-backup-${moment().format('YYYY-MM-DD_HHmm')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  return backup;
}

// Count records (leads/notes/etc.) in a parsed backup, for a friendly summary.
export function summarize(backup) {
  const d = (backup && backup.data) || {};
  const count = (k) => (Array.isArray(d[PREFIX + k]) ? d[PREFIX + k].length : 0);
  return { leads: count('Lead'), notes: count('Note'), touches: count('TouchLog'), meetings: count('Meeting') };
}

// Restore from a File. Overwrites the matching keys with the backup's contents.
// Returns a summary; the caller should reload the page afterward so the UI
// re-reads storage.
export async function importBackup(file) {
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file isn’t valid — it may be corrupted or not a backup file.'); }
  if (!parsed || parsed.app !== 'gasoleads' || typeof parsed.data !== 'object') {
    throw new Error('This doesn’t look like a GASOLEADS backup file.');
  }
  Object.entries(parsed.data).forEach(([key, val]) => {
    if (!key.startsWith(PREFIX)) return;
    localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
  });
  return { summary: summarize(parsed), exportedAt: parsed.exportedAt };
}

// --- backup freshness + daily-auto toggle ------------------------------------
export function getLastBackupAt() {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function lastBackupLabel() {
  const at = getLastBackupAt();
  return at ? moment(at).fromNow() : 'never';
}

// True if a backup was already made today (used to show/hide the daily nudge).
export function backedUpToday() {
  const at = getLastBackupAt();
  return !!at && moment(at).isSame(moment(), 'day');
}

export function isAutoBackupOn() {
  return localStorage.getItem(AUTO_KEY) === '1';
}

export function setAutoBackup(on) {
  localStorage.setItem(AUTO_KEY, on ? '1' : '0');
}
