import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Phone, Mail, MapPin, Users, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from './StatusBadge';
import ChannelIcon from './ChannelIcon';
import StageBadge from './StageBadge';
import { isTintable, nextTint, CPA_TINT_CARD, CPA_TINT_SWATCH } from '@/lib/cpaTint';
import CompetitorTag from './CompetitorTag';

const companyAccent = {
  'ADP': 'border-l-4 border-l-red-500 bg-white',
  'CaneyCloud/VAV': 'border-l-4 border-l-[#c0654a] bg-[#fdf3f0]',
};

export default function TouchCard({ lead, onMarkDone, onSetTint, onDelete, compact = false }) {
  const touchNum = (lead.current_touch_index || 0) + 1;
  const [showActions, setShowActions] = useState(false);

  // Get first phone and email for quick access
  const primaryPhone = lead.phones?.[0]?.value || lead.phone;
  const primaryEmail = lead.emails?.[0]?.value || lead.email;

  const tintable = isTintable(lead);
  const tint = lead.cpa_tint || '';
  const tintCard = tintable && tint ? CPA_TINT_CARD[tint] : '';

  return (
    <div className={`flex flex-col rounded-xl border transition-all hover:border-gray-200 ${tintCard || `border-gray-100 ${companyAccent[lead.company] || 'bg-white'}`}`}>
      <Link to={`/leads/${lead.id}`} className="flex items-start gap-3 sm:gap-4 p-4 flex-1 min-w-0">
        <StatusBadge color={lead.color_status} size="md" stage={lead.stage} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{lead.company_name || lead.name}</h3>
            {!compact && <StageBadge stage={lead.stage} />}
            <CompetitorTag name={lead.competitor} className="shrink-0" />
          </div>
          {lead.company_name && (
            <p className="text-xs text-gray-500 mb-1">{lead.name}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-2">
            <span className="inline-flex items-center gap-1">
              <ChannelIcon channel={lead.next_touch_channel} className="w-3 h-3" />
              {lead.next_touch_channel} · Touch #{touchNum}
            </span>
            <span className="text-gray-300 hidden sm:inline">·</span>
            <span className="hidden sm:inline">{lead.company} · {lead.relationship_type}{lead.relationship_type === 'Client' && lead.client_status ? ` (${lead.client_status})` : ''}</span>
            {lead.count && <span className="text-gray-300 hidden sm:inline">·</span>}
            {lead.count && <span className="hidden sm:inline">{lead.company === 'ADP' ? 'Employees' : 'Rooms'}: {lead.count}</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
            {lead.decision_maker && <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{lead.decision_maker}</span>}
            {lead.gatekeeper && <span className="inline-flex items-center gap-1 text-gray-300">GK: {lead.gatekeeper}</span>}
            {primaryPhone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{primaryPhone}</span>}
            {primaryEmail && <span className="inline-flex items-center gap-1 truncate max-w-[14rem]"><Mail className="w-3 h-3 shrink-0" />{primaryEmail}</span>}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              setShowActions(!showActions);
            }}
            className="shrink-0 text-gray-300 hover:text-gray-700 text-lg transition-colors"
            title={['', 'Important', 'Most important', 'Extremely important'][lead.importance || 0]}
          >
            <span>{['', '!', '!!', '!!!'][lead.importance || 0] || ''}</span>
          </button>
          <ChevronRight className="w-4 h-4 text-gray-300 hidden sm:block" />
        </div>
      </Link>

      {/* Quick action row */}
      <div className="flex items-center gap-2 px-4 pb-3 sm:pb-4 border-t border-gray-50 sm:border-t-0">
        <Button
          size="sm"
          variant="default"
          className="flex-1 sm:flex-none h-10 gap-1.5 text-white bg-emerald-600 hover:bg-emerald-700"
          onClick={() => onMarkDone(lead)}
        >
          <Check className="w-4 h-4" />
          <span className="hidden sm:inline">Done</span>
        </Button>
        {primaryPhone && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none h-10 gap-1"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = `tel:${primaryPhone}`;
            }}
            title="Call"
          >
            <Phone className="w-4 h-4" />
          </Button>
        )}
        {primaryEmail && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none h-10 gap-1"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = `mailto:${primaryEmail}`;
            }}
            title="Email"
          >
            <Mail className="w-4 h-4" />
          </Button>
        )}
        {tintable && onSetTint && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none h-10 gap-1.5 px-2.5 ml-auto sm:ml-0"
            onClick={(e) => { e.preventDefault(); onSetTint(lead, nextTint(tint)); }}
            title="Tap to set Partner tint (cycles green → yellow → red → none)"
          >
            <span className={`w-3.5 h-3.5 rounded-full border border-black/10 ${CPA_TINT_SWATCH[tint]}`} />
            <span className="text-xs hidden sm:inline">Tint</span>
          </Button>
        )}
        {tintable && tint === 'red' && onDelete && (
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-1 text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => { e.preventDefault(); onDelete(lead); }}
            title="Delete lead"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
