// -----------------------------------------------------------------------------
// Shared lead filtering — ONE definition of the filter semantics used by both the
// Today (Home) and All Leads pages, so they can never drift apart.
//
// Every category filter is a MULTI-SELECT array of values:
//   - OR within a category  (stage = [Contacted, Engaged] -> either matches)
//   - AND across categories (stage filter AND relationship filter both apply)
// An empty array means "no constraint" for that category.
//
// Fixed-option categories (company / relationship / stage) match by equality.
// Free-text categories (industry / zip / product / competitor) match by substring
// so partial values typed into the autocomplete still work.
// -----------------------------------------------------------------------------

// Normalize a filter value to a clean array (tolerates legacy string / empty).
function arr(v) {
  if (Array.isArray(v)) return v.filter(x => x != null && String(x).trim() !== '');
  if (v == null || String(v).trim() === '') return [];
  return [v];
}

function anyEquals(values, fieldVal) {
  return values.includes(fieldVal);
}

function anyIncludes(values, fieldVal) {
  const f = (fieldVal || '').toLowerCase();
  return values.some(v => f.includes(String(v).toLowerCase()));
}

// Free-text search across the lead's real fields, including phone/email arrays.
export function leadMatchesSearch(l, q) {
  const query = q.toLowerCase();
  const fields = [l.name, l.company_name, l.company, l.decision_maker, l.gatekeeper, l.address, l.product, l.competitor];
  (l.phones || []).forEach(p => fields.push(p.value));
  (l.emails || []).forEach(e => fields.push(e.value));
  return fields.filter(Boolean).some(f => f.toLowerCase().includes(query));
}

// True if the lead passes ALL active category filters (and the search box).
export function matchesCategoryFilters(l, filters) {
  const company = arr(filters.company);
  const relationship = arr(filters.relationship_type);
  const stage = arr(filters.stage);
  const industry = arr(filters.industry);
  const zipcode = arr(filters.zipcode);
  const product = arr(filters.product);
  const competitor = arr(filters.competitor);

  if (company.length && !anyEquals(company, l.company)) return false;
  if (relationship.length && !anyEquals(relationship, l.relationship_type)) return false;
  if (stage.length && !anyEquals(stage, l.stage)) return false;
  if (industry.length && !anyIncludes(industry, l.job_industry)) return false;
  if (zipcode.length && !anyIncludes(zipcode, l.zipcode)) return false;
  if (product.length && !anyIncludes(product, l.product)) return false;
  if (competitor.length && !anyIncludes(competitor, l.competitor)) return false;
  if (filters.search && !leadMatchesSearch(l, filters.search)) return false;
  return true;
}

// The category keys, for counting how many filters are active.
export const FILTER_CATEGORIES = ['company', 'relationship_type', 'stage', 'industry', 'zipcode', 'product', 'competitor'];

export function activeCategoryCount(filters) {
  return FILTER_CATEGORIES.filter(k => arr(filters[k]).length > 0).length;
}

// A fresh, fully-empty set of category filters (used by Clear all / initial state).
export function emptyFilters(extra = {}) {
  return { search: '', company: [], relationship_type: [], stage: [], industry: [], zipcode: [], product: [], competitor: [], sort: 'newest', ...extra };
}
