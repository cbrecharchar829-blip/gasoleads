// -----------------------------------------------------------------------------
// Partner card-tint helpers — shared by the Today (TouchCard) and All Leads cards.
//
// Only leads whose relationship type is "Partner" (any company) can be tinted.
// Tapping the swatch cycles: none -> green -> yellow -> red -> none, persisted on
// the lead as `cpa_tint`. The pastel shades here are intentionally soft (the -50
// backgrounds) so they read as clearly distinct from the saturated freshness dot.
// -----------------------------------------------------------------------------

export function isTintable(lead) {
  return lead?.relationship_type === 'Partner';
}

// Cycle order — empty string means "no tint".
export const TINT_CYCLE = ['', 'green', 'yellow', 'red'];

export function nextTint(current) {
  const idx = TINT_CYCLE.indexOf(current || '');
  return TINT_CYCLE[(idx + 1) % TINT_CYCLE.length];
}

// Soft pastel card background + border for each tint (distinct from the dot).
export const CPA_TINT_CARD = {
  green: 'bg-green-50 border-green-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  red: 'bg-red-50 border-red-200',
};

// Small swatch fill shown on the cycle button so the current tint is visible.
export const CPA_TINT_SWATCH = {
  '': 'bg-gray-200',
  green: 'bg-green-300',
  yellow: 'bg-yellow-300',
  red: 'bg-red-300',
};
