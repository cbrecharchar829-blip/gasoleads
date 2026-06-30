import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/localClient';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { Plus, Users, Settings, Fuel, ChevronRight, Phone, Mail, MapPin, CheckSquare, Square, Map, Sun, Trash2, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import StatusBadge from '@/components/leads/StatusBadge';
import StageBadge from '@/components/leads/StageBadge';
import ChannelIcon from '@/components/leads/ChannelIcon';
import LeadFilters from '@/components/leads/LeadFilters';
import AddLeadDialog from '@/components/leads/AddLeadDialog';
import { calculateColorStatus } from '@/lib/cadenceUtils';
import { addLead } from '@/lib/leadActions';
import { isTintable, nextTint, CPA_TINT_CARD, CPA_TINT_SWATCH } from '@/lib/cpaTint';
import { matchesCategoryFilters, emptyFilters } from '@/lib/leadFilters';
import CompetitorTag from '@/components/leads/CompetitorTag';

const companyAccent = {
  'ADP': 'border-l-4 border-l-red-500 bg-white',
  'CaneyCloud/VAV': 'border-l-4 border-l-[#c0654a] bg-[#fdf3f0]',
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filters, setFilters] = useState(emptyFilters());
  const [selected, setSelected] = useState(new Set());
  const [showClosed, setShowClosed] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [allLeads, allTemplates] = await Promise.all([
        base44.entities.Lead.list('-created_date', 500),
        base44.entities.CadenceTemplate.list('-created_date', 50),
      ]);
      setTemplates(allTemplates);
      const updated = allLeads.map(l => ({
        ...l,
        color_status: calculateColorStatus(l.next_touch_date),
      }));
      setLeads(updated);
      setLoading(false);
    } catch (error) {
      toast({ title: 'Error loading leads', description: 'Unable to fetch leads. Please refresh the page.' });
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const closedCount = leads.filter(l => l.stage === 'Won' || l.stage === 'Lost').length;

  const filteredLeads = leads.filter(l => {
    if (!showClosed && (l.stage === 'Won' || l.stage === 'Lost')) return false;
    if (!matchesCategoryFilters(l, filters)) return false;
    return true;
  }).sort((a, b) => {
    const da = new Date(a.created_date), db = new Date(b.created_date);
    return filters.sort === 'oldest' ? da - db : db - da;
  });

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredLeads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const handleBulkUpdate = async (field, value) => {
    try {
      await Promise.all([...selected].map(id => base44.entities.Lead.update(id, { [field]: value })));
      toast({ title: `Updated ${selected.size} lead${selected.size > 1 ? 's' : ''}` });
      setSelected(new Set());
      loadData();
    } catch (error) {
      toast({ title: 'Error updating leads', description: 'Unable to update selected leads.' });
    }
  };

  const handleAddLead = async (form, options) => {
    try {
      await addLead(form, templates, options);
      toast({ title: 'Lead added', description: `${form.name} — first touch scheduled` });
      loadData();
    } catch (error) {
      toast({ title: 'Error adding lead', description: 'Unable to create lead. Please try again.' });
    }
  };

  const handleSetTint = async (lead, tint, e) => {
    e.stopPropagation();
    await base44.entities.Lead.update(lead.id, { cpa_tint: tint });
    loadData();
  };

  const handleDeleteLead = async (lead, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${lead.name}? This cannot be undone.`)) return;
    await base44.entities.Lead.delete(lead.id);
    toast({ title: 'Lead deleted' });
    loadData();
  };

  const cycleImportance = async (lead, e) => {
    e.stopPropagation();
    const nextLevel = ((lead.importance || 0) % 3) + 1;
    await base44.entities.Lead.update(lead.id, { importance: nextLevel });
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center">
               <Fuel className="w-5 h-5 text-white" />
             </div>
             <h1 className="text-lg font-semibold text-gray-900 tracking-tight">GASOLEADS</h1>
           </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/blitzkrieg" className="text-gray-500 flex items-center gap-1.5"><Zap className="w-4 h-4" />Blitzkrieg</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="text-gray-500 flex items-center gap-1.5"><Sun className="w-4 h-4" />Today</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/leads" className="text-gray-900 font-medium"><Users className="w-4 h-4 mr-1.5" />Leads</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/map" className="text-gray-500"><Map className="w-4 h-4 mr-1.5" />Map</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" className="text-gray-500"><Settings className="w-4 h-4 mr-1.5" />Settings</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">All Leads</h2>
            <p className="text-sm text-gray-500 mt-0.5">{filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Lead
          </Button>
        </div>

        <div className="mb-4">
          <LeadFilters filters={filters} onChange={setFilters} leads={leads} />
        </div>

        <div className="flex items-center gap-2 mb-6">
          <Switch checked={showClosed} onCheckedChange={setShowClosed} />
          <span className="text-sm text-gray-600">
            Show closed
            {closedCount > 0 && <span className="text-gray-400"> ({closedCount} Won/Lost)</span>}
          </span>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="mb-3 flex items-center gap-3 p-3 bg-gray-900 text-white rounded-xl flex-wrap">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <span className="text-xs text-gray-400">Set stage:</span>
              <Select onValueChange={v => handleBulkUpdate('stage', v)}>
                <SelectTrigger className="h-7 w-32 text-xs bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Stage…" />
                </SelectTrigger>
                <SelectContent>
                  {['New','Contacted','Engaged','Meeting','Won','Lost','Nurture'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-400">Relationship:</span>
              <Select onValueChange={v => handleBulkUpdate('relationship_type', v)}>
                <SelectTrigger className="h-7 w-32 text-xs bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Type…" />
                </SelectTrigger>
                <SelectContent>
                  {['Prospect','Partner','Client'].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-white ml-1">Clear</button>
            </div>
          </div>
        )}

        {filteredLeads.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No leads found</h3>
            <p className="text-gray-500 text-sm">Add your first lead or adjust filters.</p>
          </div>
        ) : (
          <>
            {/* Select all */}
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 mb-2 ml-1">
              {selected.size === filteredLeads.length && filteredLeads.length > 0
                ? <CheckSquare className="w-3.5 h-3.5" />
                : <Square className="w-3.5 h-3.5" />}
              {selected.size === filteredLeads.length && filteredLeads.length > 0 ? 'Deselect all' : 'Select all'}
            </button>
          <div className="space-y-1">
            {filteredLeads.map(lead => {
              const tintable = isTintable(lead);
              const tint = lead.cpa_tint || '';
              const isSel = selected.has(lead.id);
              const tintCard = !isSel && tintable && tint ? CPA_TINT_CARD[tint] : '';
              return (
              <div
                key={lead.id}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all hover:border-gray-200 ${isSel ? 'border-gray-400 bg-gray-50' : (tintCard || `border-gray-100 ${companyAccent[lead.company] || 'bg-white'}`)}`}
              >
                <button onClick={e => toggleSelect(lead.id, e)} className="shrink-0 text-gray-400 hover:text-gray-700">
                  {selected.has(lead.id) ? <CheckSquare className="w-4 h-4 text-gray-800" /> : <Square className="w-4 h-4" />}
                </button>
                <button onClick={() => navigate(`/leads/${lead.id}`)} className="flex-1 flex items-center gap-4 text-left min-w-0">
                <StatusBadge color={lead.color_status} size="md" stage={lead.stage} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-gray-900 truncate">{lead.company_name || lead.name}</span>
                    <StageBadge stage={lead.stage} />
                    <CompetitorTag name={lead.competitor} className="shrink-0" />
                  </div>
                  {lead.company_name && (
                    <p className="text-xs text-gray-500 mb-0.5">{lead.name}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-0.5">
                    <span>{lead.company} · {lead.relationship_type}{lead.relationship_type === 'Client' && lead.client_status ? ` (${lead.client_status})` : ''}</span>
                    {lead.count && <span>· {lead.company === 'ADP' ? 'Employees' : 'Rooms'}: {lead.count}</span>}
                    {lead.next_touch_channel && (
                      <span className="inline-flex items-center gap-1">
                        · <ChannelIcon channel={lead.next_touch_channel} className="w-3 h-3" />
                        {lead.next_touch_date ? moment(lead.next_touch_date).fromNow() : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                    {lead.decision_maker && <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{lead.decision_maker}</span>}
                    {lead.gatekeeper && <span className="inline-flex items-center gap-1">GK: {lead.gatekeeper}</span>}
                    {(lead.phones?.[0]?.value || lead.phone) && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phones?.[0]?.value || lead.phone}</span>}
                    {(lead.emails?.[0]?.value || lead.email) && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{lead.emails?.[0]?.value || lead.email}</span>}
                    {lead.address && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.address}{lead.zipcode ? ` ${lead.zipcode}` : ''}</span>}
                  </div>
                </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                  {tintable && (
                    <button
                      onClick={(e) => handleSetTint(lead, nextTint(tint), e)}
                      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                      title="Tap to set Partner tint (cycles green → yellow → red → none)"
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border border-black/10 ${CPA_TINT_SWATCH[tint]}`} />
                    </button>
                  )}
                  {tintable && tint === 'red' && (
                    <button
                      onClick={(e) => handleDeleteLead(lead, e)}
                      className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                      title="Delete lead"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                  onClick={(e) => cycleImportance(lead, e)}
                  className="shrink-0 text-gray-300 hover:text-gray-700 text-lg transition-colors"
                  title={['', 'Important', 'Most important', 'Extremely important'][lead.importance || 0]}
                  >
                  <span>{['', '!', '!!', '!!!'][lead.importance || 0] || ''}</span>
                  </button>
                  </div>
              );
            })}
          </div>
          </>
        )}
      </main>

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} onSave={handleAddLead} />
    </div>
  );
}
