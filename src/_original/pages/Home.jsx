import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { Plus, Users, Settings, CalendarCheck, Fuel, UserPlus, X, MapPin, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import TouchCard from '@/components/leads/TouchCard';
import AddLeadDialog from '@/components/leads/AddLeadDialog';
import LeadFilters from '@/components/leads/LeadFilters';
import { getCadenceKey, calculateColorStatus, DEFAULT_CADENCE_TEMPLATES } from '@/lib/cadenceUtils';

export default function Home() {
  const [leads, setLeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [weeklyTouches, setWeeklyTouches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filters, setFilters] = useState({ search: '', company: '', relationship_type: '', stage: '', industry: '', zipcode: '', sort: 'newest', overdueOnly: false });
  const [today, setToday] = useState(moment().startOf('day'));
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const weekStart = moment().startOf('isoWeek').toISOString();
      const [allLeads, allTemplates, allTouches] = await Promise.all([
        base44.entities.Lead.list('-created_date', 500),
        base44.entities.CadenceTemplate.list('-created_date', 50),
        base44.entities.TouchLog.filter({ completed_date: { $gte: weekStart } }, '-completed_date', 500),
      ]);
      setTemplates(allTemplates);
      setWeeklyTouches(allTouches.length);
      const updated = allLeads.map(l => ({
        ...l,
        color_status: calculateColorStatus(l.next_touch_date),
      }));
      setLeads(updated);
      setLoading(false);
    } catch (error) {
      toast({ title: 'Error loading data', description: 'Unable to fetch leads. Please refresh the page.' });
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh when calendar day changes (midnight)
  useEffect(() => {
    const now = moment();
    const nextMidnight = moment().clone().add(1, 'day').startOf('day');
    const msUntilMidnight = nextMidnight.diff(now);

    const timeout = setTimeout(() => {
      setToday(moment().startOf('day'));
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, []);

  // Auto-move Prospects to Nurture after 4 weeks with no response
  useEffect(() => {
    if (leads.length === 0) return;
    const fourWeeksAgo = moment().subtract(4, 'weeks');
    const toNurture = leads.filter(l =>
      l.relationship_type === 'Prospect' &&
      !['Nurture', 'Won', 'Lost'].includes(l.stage) &&
      l.cadence_start_date &&
      moment(l.cadence_start_date).isBefore(fourWeeksAgo)
    );
    if (toNurture.length === 0) return;
    Promise.all(toNurture.map(l =>
      base44.entities.Lead.update(l.id, {
        stage: 'Nurture',
        nurture_revisit_date: moment().add(6, 'weeks').toISOString(),
      })
    )).then(() => {
      if (toNurture.length > 0) {
        toast({ title: `${toNurture.length} prospect${toNurture.length > 1 ? 's' : ''} moved to Nurture`, description: 'No response after 4 weeks.' });
        loadData();
      }
    });
  }, [leads]);

  // Filter for today's touches — today AND any overdue (past due) leads
  const todayLeads = leads.filter(l => {
    if (!l.next_touch_date || l.cadence_completed) return false;
    if (l.stage === 'Won' || l.stage === 'Lost') return false;
    const due = moment(l.next_touch_date).startOf('day');
    if (due.isAfter(today)) return false; // future — not yet
    if (filters.overdueOnly && !due.isBefore(today)) return false; // only past days
    // Apply advanced filters
    if (filters.company && l.company !== filters.company) return false;
    if (filters.relationship_type && l.relationship_type !== filters.relationship_type) return false;
    if (filters.stage && l.stage !== filters.stage) return false;
    if (filters.industry && !(l.job_industry || '').toLowerCase().includes(filters.industry.toLowerCase())) return false;
    if (filters.zipcode && !(l.zipcode || '').toLowerCase().includes(filters.zipcode.toLowerCase())) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const fields = [l.name, l.company_name, l.company, l.phone, l.email, l.decision_maker, l.gatekeeper, l.address].filter(Boolean);
      if (!fields.some(f => f.toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (filters.sort === 'oldest') return new Date(a.created_date) - new Date(b.created_date);
    if (filters.sort === 'newest') return new Date(b.created_date) - new Date(a.created_date);
    // Default: red first, then yellow, then green
    const order = { red: 0, yellow: 1, green: 2 };
    return (order[a.color_status] || 2) - (order[b.color_status] || 2);
  });

  const [stagePopover, setStagePopover] = useState(null); // { label, leads }

  const overdueCount = todayLeads.filter(l => moment(l.next_touch_date).startOf('day').isBefore(today)).length;
  const dueCount = todayLeads.filter(l => moment(l.next_touch_date).startOf('day').isSame(today)).length;

  const handleMarkDone = async (lead) => {
    try {
      const template = templates.find(t => t.key === lead.cadence_key);
      const nextIndex = (lead.current_touch_index || 0) + 1;
      const now = new Date().toISOString();

      // Log the touch
      await base44.entities.TouchLog.create({
        lead_id: lead.id,
        touch_index: lead.current_touch_index || 0,
        channel: lead.next_touch_channel || '',
        completed_date: now,
      });

    // Calculate next touch
    let updateData = {
      current_touch_index: nextIndex,
      last_touch_date: now,
    };

    // Auto-advance stage from New to Contacted on first touch
    if (lead.stage === 'New') {
      updateData.stage = 'Contacted';
    }

    // Minimum next touch = tomorrow (one touch per day max)
    const tomorrow = moment().add(1, 'day').startOf('day');

    if (template) {
      if (template.is_recurring) {
        const channels = template.channels;
        const nextChannel = channels[nextIndex % channels.length];
        const nextDate = moment().add(template.recurring_interval_days, 'days');
        updateData.next_touch_channel = nextChannel;
        updateData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
        updateData.color_status = 'green';
      } else {
        if (nextIndex >= template.total_touches) {
          if (lead.permanent_cadence) {
            const dayOffset = template.touch_days[1] || 1;
            const nextDate = moment().add(dayOffset, 'days');
            updateData.current_touch_index = 1;
            updateData.cadence_start_date = now;
            updateData.cadence_completed = false;
            updateData.next_touch_channel = template.channels[1 % template.channels.length];
            updateData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
            updateData.color_status = 'green';
          } else {
            updateData.cadence_completed = true;
            updateData.next_touch_date = null;
            updateData.next_touch_channel = null;
            if (lead.relationship_type === 'Prospect') {
              updateData.stage = 'Nurture';
              updateData.nurture_revisit_date = moment().add(6, 'weeks').toISOString();
            }
          }
        } else {
          const dayOffset = template.touch_days[nextIndex] || 0;
          const cadenceStart = moment(lead.cadence_start_date);
          const nextDate = cadenceStart.clone().add(dayOffset, 'days');
          updateData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
          updateData.next_touch_channel = template.channels[nextIndex % template.channels.length];
          updateData.color_status = calculateColorStatus(updateData.next_touch_date);
        }
      }
    }

      await base44.entities.Lead.update(lead.id, updateData);
      toast({ title: 'Touch completed', description: `${lead.name} — next touch scheduled` });
      loadData();
    } catch (error) {
      toast({ title: 'Error marking touch', description: 'Unable to update lead status.' });
    }
  };

  const handleAddLead = async (form) => {
    try {
      const cadenceKey = getCadenceKey(form.company, form.relationship_type, form.client_status);
      const template = templates.find(t => t.key === cadenceKey);
      const now = new Date().toISOString();

      // Touch #1 is the act of adding the lead — log it and schedule touch #2
      const nextIndex = 1;
      let leadData = {
        ...form,
        stage: 'Contacted',
        cadence_key: cadenceKey,
        cadence_start_date: now,
        current_touch_index: nextIndex,
        cadence_completed: false,
        color_status: 'green',
        last_touch_date: now,
      };

      // Next touch is tomorrow at the earliest (one touch per day)
      const tomorrow = moment().add(1, 'day').startOf('day');

      if (template) {
        if (template.is_recurring) {
          const nextDate = moment().add(template.recurring_interval_days, 'days');
          leadData.next_touch_channel = template.channels[nextIndex % template.channels.length];
          leadData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
        } else if (nextIndex >= template.total_touches) {
          leadData.cadence_completed = true;
          leadData.next_touch_date = null;
          leadData.next_touch_channel = null;
          if (form.relationship_type === 'Prospect') {
            leadData.stage = 'Nurture';
            leadData.nurture_revisit_date = moment().add(6, 'weeks').toISOString();
          }
        } else {
          const dayOffset = template.touch_days[nextIndex] || 0;
          const nextDate = moment(now).add(dayOffset, 'days');
          leadData.next_touch_date = (nextDate.isBefore(tomorrow) ? tomorrow : nextDate).toISOString();
          leadData.next_touch_channel = template.channels[nextIndex % template.channels.length];
        }
      }

      const newLead = await base44.entities.Lead.create(leadData);

      // Log touch #1 (the registration touch)
      if (template) {
        await base44.entities.TouchLog.create({
          lead_id: newLead.id,
          touch_index: 0,
          channel: template.channels[0],
          completed_date: now,
        });
      }

      toast({ title: 'Lead added', description: `${form.name} — Touch #1 logged, next touch scheduled` });
      loadData();
    } catch (error) {
      toast({ title: 'Error adding lead', description: 'Unable to create lead. Please try again.' });
    }
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
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">GASOLEADS</h1>
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="text-gray-900 font-medium flex items-center gap-1.5"><Sun className="w-4 h-4" />Today</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/leads" className="text-gray-500"><Users className="w-4 h-4 mr-1.5" />Leads</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/map" className="text-gray-500"><MapPin className="w-4 h-4 mr-1.5" />Map</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" className="text-gray-500"><Settings className="w-4 h-4 mr-1.5" />Settings</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="flex items-center gap-6 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Today</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {moment().format('dddd, MMMM D')}
            </p>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {overdueCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-600 font-medium">{overdueCount} overdue</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm">
              <CalendarCheck className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{dueCount} due today</span>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Add Lead
            </Button>
          </div>
        </div>

        {/* Stage + weekly touches summary */}
        {(() => {
          const stages = ['New', 'Contacted', 'Engaged', 'Meeting', 'Won', 'Nurture'];
          const stageCounts = stages.map(s => ({ label: s, count: leads.filter(l => l.stage === s).length })).filter(s => s.count > 0);
          return (
            <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-white rounded-xl border border-gray-100 text-sm">
              {stageCounts.map(({ label, count }) => (
                <button
                  key={label}
                  onClick={() => setStagePopover(p => p?.label === label ? null : { label, leads: leads.filter(l => l.stage === label) })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${stagePopover?.label === label ? 'bg-gray-900 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-900'}`}
                >
                  <span className="font-semibold">{count}</span>
                  <span className={stagePopover?.label === label ? 'text-gray-300' : 'text-gray-500'}>{label}</span>
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-lg">
                <span className="font-semibold text-emerald-700">{weeklyTouches}</span>
                <span className="text-emerald-600">touches this week</span>
              </div>
            </div>
          );
        })()}

        {/* Stage popover */}
        {stagePopover && (
          <div className="mb-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="font-semibold text-gray-900 text-sm">{stagePopover.label} <span className="text-gray-400 font-normal">({stagePopover.leads.length})</span></span>
              <button onClick={() => setStagePopover(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {stagePopover.leads.map(l => (
                <Link key={l.id} to={`/leads/${l.id}`} onClick={() => setStagePopover(null)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${l.company === 'ADP' ? 'bg-red-400' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate block">{l.company_name || l.name}</span>
                    {l.company_name && <span className="text-xs text-gray-400 truncate block">{l.name}</span>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{l.company} · {l.relationship_type}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Added Today sneak peek */}
        {(() => {
          const addedToday = leads.filter(l => moment(l.created_date).isSame(moment(), 'day'));
          if (addedToday.length === 0) return null;
          return (
            <div className="mb-4 p-3 bg-white rounded-xl border border-gray-100 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mr-1">
                <UserPlus className="w-3.5 h-3.5" />
                <span className="font-medium">Added today</span>
              </div>
              {addedToday.map(l => (
                <Link key={l.id} to={`/leads/${l.id}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-medium text-gray-700 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full ${l.company === 'ADP' ? 'bg-red-400' : 'bg-amber-500'}`} />
                  {l.name}
                  {l.company_name && <span className="text-gray-400 font-normal">· {l.company_name}</span>}
                </Link>
              ))}
            </div>
          );
        })()}

        {/* Overdue / All toggle + Filters */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setFilters(f => ({ ...f, overdueOnly: false }))}
              className={`px-3 py-1.5 transition-colors ${!filters.overdueOnly ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              All
            </button>
            <button
              onClick={() => setFilters(f => ({ ...f, overdueOnly: true }))}
              className={`px-3 py-1.5 transition-colors flex items-center gap-1.5 ${filters.overdueOnly ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Overdue {overdueCount > 0 && `(${overdueCount})`}
            </button>
          </div>
          <LeadFilters filters={filters} onChange={setFilters} leads={leads} />
        </div>

        {/* Today's touches */}
        {todayLeads.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CalendarCheck className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">All caught up!</h3>
            <p className="text-gray-500 text-sm">No touches due today. Great work.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayLeads.map(lead => (
              <TouchCard key={lead.id} lead={lead} onMarkDone={handleMarkDone} />
            ))}
          </div>
        )}
      </main>

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} onSave={handleAddLead} />
    </div>
  );
}
