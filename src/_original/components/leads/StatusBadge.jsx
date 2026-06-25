import React from 'react';

const colorMap = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
};

export default function StatusBadge({ color, size = 'sm' }) {
  const sizeClass = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  return (
    <span className={`inline-block rounded-full ${sizeClass} ${colorMap[color] || colorMap.green}`} />
  );
}
