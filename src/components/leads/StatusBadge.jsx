import React from 'react';

const colorMap = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
};

// Leads that are closed (Won/Lost) don't get a freshness color — show grey.
const CLOSED_STAGES = ['Won', 'Lost'];

export default function StatusBadge({ color, size = 'sm', stage }) {
  const sizeClass = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  const colorClass = CLOSED_STAGES.includes(stage) ? 'bg-gray-300' : (colorMap[color] || colorMap.green);
  return (
    <span className={`inline-block rounded-full ${sizeClass} ${colorClass}`} />
  );
}
