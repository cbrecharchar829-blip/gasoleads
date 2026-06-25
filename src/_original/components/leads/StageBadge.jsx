import React from 'react';

const stageColors = {
  'New': 'bg-blue-50 text-blue-700 border-blue-200',
  'Contacted': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Engaged': 'bg-violet-50 text-violet-700 border-violet-200',
  'Meeting': 'bg-purple-50 text-purple-700 border-purple-200',
  'Won': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Lost': 'bg-gray-50 text-gray-500 border-gray-200',
  'Nurture': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function StageBadge({ stage }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${stageColors[stage] || stageColors['New']}`}>
      {stage}
    </span>
  );
}
