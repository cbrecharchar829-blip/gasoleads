import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/localClient';
import { Link } from 'react-router-dom';
import { Fuel, Users, Settings, Save, Plus, X, Sun, Map, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import ChannelIcon from '@/components/leads/ChannelIcon';
import { getDaysOff, addDayOff, removeDayOff } from '@/lib/businessDays';
import moment from 'moment';
import { CalendarOff } from 'lucide-react';

const COMPANIES = ['ADP', 'CaneyCloud/VAV'];

export default function CadenceSettings() {
  const [templates, setTemplates] = useState([]);
  const [partnershipTypes, setPartnershipTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [newType, setNewType] = useState({ label: '', company: 'ADP', is_recurring: false, interval_days: 7, channels: ['Call'] });
  const [addingType, setAddingType] = useState(false);
  const [daysOff, setDaysOffState] = useState([]);
  const [newDayOff, setNewDayOff] = useState({ date: '', label: '' });
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    const [all, pts] = await Promise.all([
      base44.entities.CadenceTemplate.list('-created_date', 50),
      base44.entities.PartnershipType.list('-created_date', 100),
    ]);
    setTemplates(all);
    setPartnershipTypes(pts);
    setDaysOffState(getDaysOff());
    setLoading(false);
  }, []);

  const handleAddDayOff = () => {
    if (!newDayOff.date) return;
    setDaysOffState(addDayOff(newDayOff.date, newDayOff.label));
    setNewDayOff({ date: '', label: '' });
    toast({ title: 'Day off added', description: moment(newDayOff.date).format('dddd, MMM D, YYYY') });
  };

  const handleRemoveDayOff = (date) => {
    setDaysOffState(removeDayOff(date));
  };

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async (template) => {
    setSaving(template.id);
    await base44.entities.CadenceTemplate.update(template.id, {
      total_touches: template.channels.length,
      total_days: template.total_days,
      recurring_interval_days: template.recurring_interval_days,
      channels: template.channels,
      touch_days: template.touch_days,
      is_recurring: template.is_recurring,
    });
    toast({ title: 'Saved', description: `${template.label} updated` });
    setSaving(null);
  };

  const updateTemplate = (id, field, value) => {
    setTemplates(prev => prev.map(t =>
      t.id === id ? { ...t, [field]: value } : t
    ));
  };

  const updateChannel = (id, index, value) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== id) return t;
      const channels = [...t.channels];
      channels[index] = value;
      return { ...t, channels };
    }));
  };

  const addChannel = (id) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== id) return t;
      return {
        ...t,
        channels: [...t.channels, 'Call'],
        total_touches: t.total_touches + 1,
        touch_days: t.touch_days.length > 0 ? [...t.touch_days, (t.touch_days[t.touch_days.length - 1] || 0) + 1] : t.touch_days,
      };
    }));
  };

  const removeChannel = (id, index) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== id) return t;
      const channels = t.channels.filter((_, i) => i !== index);
      const touchDays = t.touch_days.length > 0 ? t.touch_days.filter((_, i) => i !== index) : t.touch_days;
      return { ...t, channels, total_touches: channels.length, touch_days: touchDays };
    }));
  };

  const updateTouchDay = (id, index, value) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== id) return t;
      const touchDays = [...t.touch_days];
      touchDays[index] = parseInt(value) || 0;
      return { ...t, touch_days: touchDays };
    }));
  };

  const channelOptions = ['Call', 'Text', 'Email', 'WhatsApp', 'In-person drop-in'];

  const handleCreatePartnershipType = async () => {
    if (!newType.label.trim()) return;
    setAddingType(true);
    const key = `${newType.company === 'ADP' ? 'adp' : 'caneycloud'}_${newType.label.toLowerCase().replace(/\s+/g, '_')}`;
    await base44.entities.PartnershipType.create({ label: newType.label.trim(), key, company: newType.company });
    await base44.entities.CadenceTemplate.create({
      key,
      label: `${newType.company} – ${newType.label.trim()}`,
      company: newType.company,
      relationship_type: newType.label.trim(),
      is_recurring: newType.is_recurring,
      recurring_interval_days: newType.is_recurring ? newType.interval_days : null,
      total_touches: newType.channels.length,
      total_days: newType.is_recurring ? null : newType.channels.length,
      channels: newType.channels,
      touch_days: newType.is_recurring ? [] : newType.channels.map((_, i) => i),
    });
    toast({ title: 'Partnership type created', description: newType.label });
    setNewType({ label: '', company: 'ADP', is_recurring: false, interval_days: 7, channels: ['Call'] });
    setAddingType(false);
    loadData();
  };

  const deletePartnershipType = async (pt) => {
    await base44.entities.PartnershipType.delete(pt.id);
    const tmpl = templates.find(t => t.key === pt.key);
    if (tmpl) await base44.entities.CadenceTemplate.delete(tmpl.id);
    toast({ title: 'Deleted', description: pt.label });
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
              <Link to="/leads" className="text-gray-500"><Users className="w-4 h-4 mr-1.5" />Leads</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/map" className="text-gray-500"><Map className="w-4 h-4 mr-1.5" />Map</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" className="text-gray-900 font-medium"><Settings className="w-4 h-4 mr-1.5" />Settings</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-6">Cadence Settings</h2>

        {/* Days Off */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <CalendarOff className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900">Days Off</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Holidays and vacation days. Automatic touches that land on a weekend or one of these
            days are pushed to the next working day, and overdue coloring skips them too.
          </p>

          {daysOff.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {daysOff.map(d => (
                <span key={d.date} className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700">
                  {moment(d.date).format('MMM D, YYYY')}
                  {d.label && <span className="text-gray-400 text-xs">· {d.label}</span>}
                  <button onClick={() => handleRemoveDayOff(d.date)} className="text-gray-400 hover:text-red-400 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-gray-500">Date</Label>
              <Input
                type="date"
                value={newDayOff.date}
                onChange={e => setNewDayOff(p => ({ ...p, date: e.target.value }))}
                className="mt-1 w-44"
              />
            </div>
            <div className="flex-1 min-w-[12rem]">
              <Label className="text-xs text-gray-500">Label (optional)</Label>
              <Input
                value={newDayOff.label}
                onChange={e => setNewDayOff(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Thanksgiving, Vacation…"
                className="mt-1"
              />
            </div>
            <Button size="sm" onClick={handleAddDayOff} disabled={!newDayOff.date} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Day Off
            </Button>
          </div>
        </div>

        {/* Partnership Types */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-8">
          <h3 className="font-semibold text-gray-900 mb-1">Custom Partnership Types</h3>
          <p className="text-sm text-gray-500 mb-4">Add new relationship types that will appear when creating leads.</p>

          {partnershipTypes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {partnershipTypes.map(pt => (
                <span key={pt.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700">
                  {pt.label} <span className="text-gray-400 text-xs">({pt.company})</span>
                  <button onClick={() => deletePartnershipType(pt)} className="text-gray-400 hover:text-red-400 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label className="text-xs text-gray-500">Type Name</Label>
              <Input
                value={newType.label}
                onChange={e => setNewType(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Vendor, Referral…"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Company</Label>
              <select
                value={newType.company}
                onChange={e => setNewType(p => ({ ...p, company: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-md px-2 py-2 bg-white"
              >
                {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Switch
              checked={newType.is_recurring}
              onCheckedChange={v => setNewType(p => ({ ...p, is_recurring: v }))}
            />
            <span className="text-sm text-gray-600">{newType.is_recurring ? 'Recurring cadence' : 'Fixed sequence'}</span>
            {newType.is_recurring && (
              <div className="flex items-center gap-1.5 ml-4">
                <span className="text-xs text-gray-500">Every</span>
                <Input
                  type="number"
                  value={newType.interval_days}
                  onChange={e => setNewType(p => ({ ...p, interval_days: parseInt(e.target.value) || 7 }))}
                  className="w-16 h-8 text-sm"
                />
                <span className="text-xs text-gray-500">days</span>
              </div>
            )}
          </div>
          <div className="mb-3">
            <Label className="text-xs text-gray-500">Initial Channels</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {newType.channels.map((ch, i) => (
                <div key={i} className="flex items-center gap-1">
                  <select
                    value={ch}
                    onChange={e => setNewType(p => ({ ...p, channels: p.channels.map((c, ci) => ci === i ? e.target.value : c) }))}
                    className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                  >
                    {channelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <button onClick={() => setNewType(p => ({ ...p, channels: p.channels.filter((_, ci) => ci !== i) }))} className="text-gray-300 hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setNewType(p => ({ ...p, channels: [...p.channels, 'Call'] }))}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 px-2 py-1.5 border border-dashed border-gray-200 rounded-md"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </div>
          <Button size="sm" onClick={handleCreatePartnershipType} disabled={addingType || !newType.label.trim()} className="gap-1.5">
            <Plus className="w-4 h-4" />
            {addingType ? 'Creating…' : 'Create Partnership Type'}
          </Button>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cadence Templates</h3>
        <div className="space-y-6">
          {templates.map(template => (
            <div key={template.id} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{template.label}</h3>
                  <p className="text-sm text-gray-500">
                    {template.is_recurring ? 'Recurring' : 'Fixed sequence'}
                    {template.is_recurring && template.recurring_interval_days ? ` · every ${template.recurring_interval_days} days` : ''}
                    {!template.is_recurring && template.total_days ? ` · ${template.total_days} days` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSave(template)}
                  disabled={saving === template.id}
                  className="gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {saving === template.id ? 'Saving…' : 'Save'}
                </Button>
              </div>

              {template.is_recurring && (
                <div className="mb-4">
                  <Label className="text-xs text-gray-500">Interval (days)</Label>
                  <Input
                    type="number"
                    value={template.recurring_interval_days || ''}
                    onChange={e => updateTemplate(template.id, 'recurring_interval_days', parseInt(e.target.value) || 0)}
                    className="w-32 mt-1"
                  />
                </div>
              )}

              {!template.is_recurring && (
                <div className="mb-4">
                  <Label className="text-xs text-gray-500">Total days span</Label>
                  <Input
                    type="number"
                    value={template.total_days || ''}
                    onChange={e => updateTemplate(template.id, 'total_days', parseInt(e.target.value) || 0)}
                    className="w-32 mt-1"
                  />
                </div>
              )}

              <div className="mb-3">
                <Label className="text-xs text-gray-500">
                  Touches ({template.channels.length})
                </Label>
              </div>

              <div className="space-y-2">
                {template.channels.map((ch, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-6 text-right">{i + 1}.</span>
                    <ChannelIcon channel={ch} className="w-4 h-4 text-gray-400" />
                    <select
                      value={ch}
                      onChange={e => updateChannel(template.id, i, e.target.value)}
                      className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                    >
                      {channelOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {!template.is_recurring && template.touch_days.length > i && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">Day</span>
                        <Input
                          type="number"
                          value={template.touch_days[i]}
                          onChange={e => updateTouchDay(template.id, i, e.target.value)}
                          className="w-16 h-8 text-sm"
                        />
                      </div>
                    )}
                    <button
                      onClick={() => removeChannel(template.id, i)}
                      className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <Button variant="ghost" size="sm" onClick={() => addChannel(template.id)} className="mt-2 text-gray-500 gap-1">
                <Plus className="w-3.5 h-3.5" /> Add touch
              </Button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
