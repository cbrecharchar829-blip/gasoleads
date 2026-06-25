// -----------------------------------------------------------------------------
// Local data layer — a drop-in replacement for Base44's backend.
//
// It mimics the small slice of the Base44 API your pages use:
//   Entity.list(sort, limit)
//   Entity.filter(query, sort, limit)   // query supports $gte/$gt/$lte/$lt/$ne/$in
//   Entity.get(id)
//   Entity.create(obj)                  // returns the created record (with id)
//   Entity.update(id, partial)          // returns the updated record
//   Entity.delete(id)
//
// All data is stored in the browser's localStorage. No server, no login.
// -----------------------------------------------------------------------------
import { DEFAULT_CADENCE_TEMPLATES } from '@/lib/cadenceUtils';

const PREFIX = 'gasoleads:';
const ENTITY_NAMES = ['Lead', 'Note', 'CadenceTemplate', 'PartnershipType', 'TouchLog', 'Meeting'];

function read(name) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + name) || '[]');
  } catch {
    return [];
  }
}

function write(name, rows) {
  localStorage.setItem(PREFIX + name, JSON.stringify(rows));
}

let counter = 0;
function uid() {
  counter += 1;
  return (
    'id_' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8) +
    counter.toString(36)
  );
}

// Compare one record value against a condition (plain value or { $gte: ... } etc.)
function matchCondition(recVal, cond) {
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, val]) => {
      switch (op) {
        case '$gte': return recVal >= val;
        case '$gt':  return recVal > val;
        case '$lte': return recVal <= val;
        case '$lt':  return recVal < val;
        case '$ne':  return recVal !== val;
        case '$in':  return Array.isArray(val) && val.includes(recVal);
        default:     return recVal === val; // unknown operator -> equality
      }
    });
  }
  return recVal === cond;
}

function applySort(rows, sort) {
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const sorted = [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp;
    const ad = Date.parse(av);
    const bd = Date.parse(bv);
    if (!isNaN(ad) && !isNaN(bd) && typeof av === 'string' && typeof bv === 'string') {
      cmp = ad - bd;
    } else if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return desc ? -cmp : cmp;
  });
  return sorted;
}

function makeEntity(name) {
  return {
    async list(sort, limit) {
      let rows = applySort(read(name), sort);
      if (limit != null) rows = rows.slice(0, limit);
      return rows.map((r) => ({ ...r }));
    },

    async filter(query = {}, sort, limit) {
      let rows = read(name).filter((r) =>
        Object.entries(query).every(([k, cond]) => matchCondition(r[k], cond))
      );
      rows = applySort(rows, sort);
      if (limit != null) rows = rows.slice(0, limit);
      return rows.map((r) => ({ ...r }));
    },

    async get(id) {
      const found = read(name).find((r) => r.id === id);
      return found ? { ...found } : null;
    },

    async create(obj) {
      const rows = read(name);
      const nowIso = new Date().toISOString();
      const record = {
        ...obj,
        id: obj.id || uid(),
        created_date: obj.created_date || nowIso,
        updated_date: nowIso,
      };
      rows.push(record);
      write(name, rows);
      return { ...record };
    },

    async update(id, partial) {
      const rows = read(name);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      rows[idx] = { ...rows[idx], ...partial, updated_date: new Date().toISOString() };
      write(name, rows);
      return { ...rows[idx] };
    },

    async delete(id) {
      const rows = read(name).filter((r) => r.id !== id);
      write(name, rows);
      return { success: true };
    },
  };
}

// Seed the built-in cadence templates once, so the app works on a fresh browser.
function seedOnce() {
  if (localStorage.getItem(PREFIX + 'seeded')) return;
  const baseTime = Date.now();
  const templates = DEFAULT_CADENCE_TEMPLATES.map((t, i) => ({
    ...t,
    id: uid(),
    // Stagger timestamps so list('-created_date') keeps the defined order.
    created_date: new Date(baseTime - i * 1000).toISOString(),
    updated_date: new Date(baseTime - i * 1000).toISOString(),
  }));
  write('CadenceTemplate', templates);
  ENTITY_NAMES.filter((n) => n !== 'CadenceTemplate').forEach((n) => {
    if (localStorage.getItem(PREFIX + n) == null) write(n, []);
  });
  localStorage.setItem(PREFIX + 'seeded', '1');
}

seedOnce();

export const base44 = {
  entities: ENTITY_NAMES.reduce((acc, name) => {
    acc[name] = makeEntity(name);
    return acc;
  }, {}),
};

export default base44;
