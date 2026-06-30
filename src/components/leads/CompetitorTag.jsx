import React from 'react';

// Red pill shown on cards/headers when a lead has a competitor. Shows the
// competitor's NAME (with a small "CT" marker) so it reads at a glance.
export default function CompetitorTag({ name, className = '' }) {
  if (!name) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 max-w-[12rem] text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5 ${className}`}
      title={`Competitor: ${name}`}
    >
      <span className="opacity-60">CT</span>
      <span className="font-medium truncate">{name}</span>
    </span>
  );
}
