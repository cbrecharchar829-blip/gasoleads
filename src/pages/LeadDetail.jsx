import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/localClient';
import { Link, useNavigate, useParams } from 'react-router-dom';
import moment from 'moment';
import {
  ArrowLeft, Phone, Mail, Linkedin, Instagram, Briefcase, Check, Trash2,
  ExternalLink, RefreshCw, MapPin, Copy, Pencil, Plus, Link2, X
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import StatusBadge from '@/components/leads/StatusBadge';
import StageBadge from '@/components/leads/StageBadge';
import ChannelIcon from '@/components/leads/ChannelIcon';
import { STAGES, calculateColorStatus, getCadenceKey } from '@/lib/cadenceUtils';
import { markTouchDone } from '@/lib/leadActions';

const CHANNEL_OPTIONS = ['Call', 'Text', 'Email', 'WhatsApp', 'In-person drop-in'];

export default function LeadDetail() {
  const { id: leadId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState([]);
  const [touchLogs, setTouchLogs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editTouch, setEditTouch] = useState(null);   // { id, when, answered }
  const [pairingNoteId, setPairingNoteId] = useState(null);
  const [mtgForm, setMtgForm] = useState({ date: '', content: '' });
  const [editMtg, setEditMtg] = useState(null);        // { id, date, content }
  const [addingTouch, setAddingTouch] = useState(false);
  const [touchForm, setTouchForm] = useState({ channel: 'Call', when: '', number: '', answered: false });

  const loadData = useCallback(async () => {
    const [leadData, allNotes, allTouches, allTemplates, allMeetings] = await Promise.all([
      base44.entities.Lead.get(leadId),
      base44.entities.Note.filter({ lead_id: leadId }, '-created_date', 100),
      base44.entities.TouchLog.filter({ lead_id: leadId }, '-completed_date', 100),
      base44.entities.CadenceTemplate.list('-created_date', 50),
      base44.entities.Meeting.filter({ lead_id: leadId }, '-date', 100),
    ]);
    if (!leadData) { setLead(null); setLoading(false); return; }
    leadData.color_status = calculateColorStatus(leadData.next_touch_date);
    setLead(leadData);
    setNotes(allNotes);
    setTouchLogs(allTouches);
    setTemplates(allTemplates);
    setMeetings(allMeetings);
    setEditForm({
     company_name: leadData.company_name || '',
     decision_maker: leadData.decision_maker || '',
     gatekeeper: leadData.gatekeeper || '',
     name: leadData.name, phones: leadData.phones || [], emails: leadData.emails || [],
     company: leadData.company || 'ADP',
     linkedin_url: leadData.linkedin_url || '', instagram: leadData.instagram || '',
     job_industry: leadData.job_industry || '',
     address: leadData.address || '',
     zipcode: leadData.zipcode || '',
     maps_url: leadData.maps_url || '',
     is_address_verified: leadData.is_address_verified || false,
     count: leadData.count || '',
     roll_call: leadData.roll_call || '',
     });
    setLoading(false);
  }, [leadId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await base44.entities.Note.create({ lead_id: leadId, content: newNote.trim() });
    setNewNote('');
    loadData();
  };

  const handleStageChange = async (newStage) => {
    await base44.entities.Lead.update(leadId, { stage: newStage });
    toast({ title: 'Stage updated', description: `Moved to ${newStage}` });
    loadData();
  };

  const handleClientStatusToggle = async () => {
    const newStatus = lead.client_status === 'New' ? 'Established' : 'New';
    const newCadenceKey = getCadenceKey(lead.company, 'Client', newStatus);
    const template = templates.find(t => t.key === newCadenceKey);

    const updateData = {
      client_status: newStatus,
      cadence_key: newCadenceKey,
      current_touch_index: 0,
      cadence_start_date: new Date().toISOString(),
      cadence_completed: false,
    };

    if (template) {
      updateData.next_touch_channel = template.channels[0];
      updateData.next_touch_date = moment().add(template.recurring_interval_days, 'days').toISOString();
    }

    await base44.entities.Lead.update(leadId, updateData);
    toast({ title: 'Status flipped', description: `Now ${newStatus}` });
    loadData();
  };

  const handleMarkDone = async () => {
    try {
      await markTouchDone(lead, templates);
      toast({ title: 'Touch completed' });
      loadData();
    } catch (error) {
      toast({ title: 'Error marking touch', description: 'Unable to update lead status.' });
    }
  };

  const handleTogglePermanent = async () => {
    const newVal = !lead.permanent_cadence;
    await base44.entities.Lead.update(leadId, { permanent_cadence: newVal });
    toast({ title: newVal ? 'Cadence set to permanent' : 'Cadence set to one-time' });
    loadData();
  };

  const handleSaveEdit = async () => {
    const toNum = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
    const cleaned = {
      ...editForm,
      count: toNum(editForm.count),
      roll_call: toNum(editForm.roll_call),
      phones: (editForm.phones || []).filter(p => p && (p.value || '').trim()),
      emails: (editForm.emails || []).filter(e => e && (e.value || '').trim()),
    };
    await base44.entities.Lead.update(leadId, cleaned);
    setEditing(false);
    toast({ title: 'Lead updated' });
    loadData();
  };

  const handleDelete = async () => {
    await base44.entities.Lead.delete(leadId);
    toast({ title: 'Lead deleted' });
    navigate('/leads');
  };

  // --- Editing / adding logged touches ------------------------------------
  const toLocalInput = (iso) => {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const startEditTouch = (t) => {
    setEditTouch({ id: t.id, when: toLocalInput(t.completed_date), answered: !!t.response_received });
  };

  const saveTouchEdit = async () => {
    await base44.entities.TouchLog.update(editTouch.id, {
      completed_date: new Date(editTouch.when).toISOString(),
      response_received: editTouch.answered,
    });
    setEditTouch(null);
    toast({ title: 'Touch updated' });
    loadData();
  };

  const deleteTouch = async (t) => {
    await base44.entities.TouchLog.delete(t.id);
    toast({ title: 'Touch deleted' });
    loadData();
  };

  const submitNewTouch = async () => {
    const idx = touchForm.number ? Math.max(0, parseInt(touchForm.number) - 1) : touchLogs.length;
    await base44.entities.TouchLog.create({
      lead_id: leadId,
      touch_index: idx,
      channel: touchForm.channel,
      completed_date: touchForm.when ? new Date(touchForm.when).toISOString() : new Date().toISOString(),
      response_received: touchForm.answered,
    });
    setAddingTouch(false);
    setTouchForm({ channel: 'Call', when: '', number: '', answered: false });
    toast({ title: 'Touch added' });
    loadData();
  };

  // --- Pairing a note to a touch ------------------------------------------
  const pairNote = async (noteId, touchId) => {
    await base44.entities.Note.update(noteId, { touch_id: touchId });
    setPairingNoteId(null);
    loadData();
  };

  const unpairNote = async (noteId) => {
    await base44.entities.Note.update(noteId, { touch_id: null });
    loadData();
  };

  // --- Meeting notes -------------------------------------------------------
  const addMeeting = async () => {
    if (!mtgForm.content.trim()) return;
    await base44.entities.Meeting.create({
      lead_id: leadId,
      date: mtgForm.date || new Date().toISOString().slice(0, 10),
      content: mtgForm.content.trim(),
    });
    setMtgForm({ date: '', content: '' });
    toast({ title: 'Meeting added' });
    loadData();
  };

  const saveMtgEdit = async () => {
    await base44.entities.Meeting.update(editMtg.id, { date: editMtg.date, content: editMtg.content });
    setEditMtg(null);
    toast({ title: 'Meeting updated' });
    loadData();
  };

  const deleteMeeting = async (m) => {
    await base44.entities.Meeting.delete(m.id);
    toast({ title: 'Meeting deleted' });
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Lead not found</p>
        <Button variant="link" asChild className="mt-2"><Link to="/leads">Back to leads</Link></Button>
      </div>
    );
  }

  const template = templates.find(t => t.key === lead.cadence_key);

  // Derived helpers for notes <-> touches pairing.
  const touchById = Object.fromEntries(touchLogs.map(t => [t.id, t]));
  const usedTouchIds = new Set(notes.filter(n => n.touch_id).map(n => n.touch_id));
  const pairableTouches = touchLogs.filter(t => !usedTouchIds.has(t.id));
  const sortedNotes = [...notes].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.created_date) - new Date(a.created_date)
  );

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <StatusBadge color={lead.color_status} size="md" stage={lead.stage} />
            <h1 className="text-lg font-semibold text-gray-900 truncate">{lead.name}</h1>
            <StageBadge stage={lead.stage} />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Next Touch Card */}
        {lead.next_touch_channel && !lead.cadence_completed && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Next Touch</p>
                <div className="flex items-center gap-2">
                  <ChannelIcon channel={lead.next_touch_channel} className="w-5 h-5 text-gray-700" />
                  <span className="text-lg font-semibold text-gray-900">{lead.next_touch_channel}</span>
                  <span className="text-sm text-gray-500">
                    · Touch #{(lead.current_touch_index || 0) + 1}
                    {template && !template.is_recurring && ` of ${template.total_touches}`}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {lead.next_touch_date ? moment(lead.next_touch_date).calendar() : ''}
                </p>
              </div>
              <Button onClick={handleMarkDone} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <Check className="w-4 h-4" /> Mark Done
              </Button>
            </div>
          </div>
        )}

        {/* Permanent cadence toggle */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-800">Permanent Cadence</p>
              <p className="text-xs text-gray-400">When the cadence ends, automatically restart it</p>
            </div>
          </div>
          <Switch checked={!!lead.permanent_cadence} onCheckedChange={handleTogglePermanent} />
        </div>

        {lead.cadence_completed && lead.stage === 'Nurture' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            Cadence completed. This lead is in Nurture — revisit {lead.nurture_revisit_date ? moment(lead.nurture_revisit_date).fromNow() : 'soon'}.
          </div>
        )}

        {/* Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Details</h3>
            {!editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveEdit}>Save</Button>
              </div>
            )}
          </div>

          {editing ? (
            <div className="grid gap-3">
              <div>
                <label className="text-xs text-gray-500">Company Name</label>
                <Input value={editForm.company_name} onChange={e => setEditForm(p => ({ ...p, company_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Decision Maker</label>
                  <Input value={editForm.decision_maker} onChange={e => setEditForm(p => ({ ...p, decision_maker: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Gatekeeper</label>
                  <Input value={editForm.gatekeeper} onChange={e => setEditForm(p => ({ ...p, gatekeeper: e.target.value }))} />
                </div>
              </div>
              <div className="border-t border-gray-100 pt-1" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Contact Name</label>
                  <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Company</label>
                  <Select value={editForm.company} onValueChange={v => setEditForm(p => ({ ...p, company: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADP">ADP</SelectItem>
                      <SelectItem value="CaneyCloud/VAV">CaneyCloud/VAV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-2">Phone Numbers</label>
                <div className="space-y-2">
                  {editForm.phones.map((p, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input placeholder="e.g. Mobile" value={p.label} onChange={e => setEditForm(f => ({ ...f, phones: f.phones.map((x, i) => i === idx ? { ...x, label: e.target.value } : x) }))} className="w-24" />
                      <Input placeholder="+1 555-0123" value={p.value} onChange={e => setEditForm(f => ({ ...f, phones: f.phones.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) }))} className="flex-1" />
                      <Button variant="outline" size="icon" onClick={() => setEditForm(f => ({ ...f, phones: f.phones.filter((_, i) => i !== idx) }))} className="text-red-500">×</Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setEditForm(f => ({ ...f, phones: [...f.phones, { label: '', value: '' }] }))}>+ Add Phone</Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-2">Email Addresses</label>
                <div className="space-y-2">
                  {editForm.emails.map((e, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input placeholder="e.g. Work" value={e.label} onChange={ev => setEditForm(f => ({ ...f, emails: f.emails.map((x, i) => i === idx ? { ...x, label: ev.target.value } : x) }))} className="w-24" />
                      <Input placeholder="email@example.com" value={e.value} onChange={ev => setEditForm(f => ({ ...f, emails: f.emails.map((x, i) => i === idx ? { ...x, value: ev.target.value } : x) }))} className="flex-1" />
                      <Button variant="outline" size="icon" onClick={() => setEditForm(f => ({ ...f, emails: f.emails.filter((_, i) => i !== idx) }))} className="text-red-500">×</Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setEditForm(f => ({ ...f, emails: [...f.emails, { label: '', value: '' }] }))}>+ Add Email</Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Job / Industry</label>
                <Input value={editForm.job_industry} onChange={e => setEditForm(p => ({ ...p, job_industry: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">LinkedIn</label>
                  <Input value={editForm.linkedin_url} onChange={e => setEditForm(p => ({ ...p, linkedin_url: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Instagram</label>
                  <Input value={editForm.instagram} onChange={e => setEditForm(p => ({ ...p, instagram: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Address</label>
                  <Input value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St, City, State" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">ZIP Code</label>
                  <Input value={editForm.zipcode} onChange={e => setEditForm(p => ({ ...p, zipcode: e.target.value }))} placeholder="12345" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Google Maps URL</label>
                <Input value={editForm.maps_url} onChange={e => setEditForm(p => ({ ...p, maps_url: e.target.value }))} placeholder="https://maps.google.com/..." />
              </div>
              <div>
                <label className="text-xs text-gray-500">{lead.company === 'ADP' ? 'Number of Employees' : 'Number of Rooms'}</label>
                <Input type="number" value={editForm.count} onChange={e => setEditForm(p => ({ ...p, count: e.target.value ? parseInt(e.target.value) : '' }))} placeholder="e.g. 50" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Roll Call (Contract Value)</label>
                <Input type="number" value={editForm.roll_call} onChange={e => setEditForm(p => ({ ...p, roll_call: e.target.value ? parseFloat(e.target.value) : '' }))} placeholder="e.g. 5000" />
              </div>
              </div>
          ) : (
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
              {lead.company_name && (
                <div className="flex items-center gap-2 text-gray-600 col-span-2">
                  <Briefcase className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{lead.company_name}</span>
                </div>
              )}
              {lead.decision_maker && (
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-xs text-gray-400 w-24 shrink-0">Decision Maker</span>
                  <span>{lead.decision_maker}</span>
                </div>
              )}
              {lead.gatekeeper && (
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-xs text-gray-400 w-24 shrink-0">Gatekeeper</span>
                  <span>{lead.gatekeeper}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600 col-span-2">
                <Briefcase className="w-4 h-4 text-gray-400" />
                <span>{lead.company}</span>
                <span className="text-gray-300">·</span>
                <span>{lead.relationship_type}</span>
                <span className="text-gray-300 ml-auto">Added {moment(lead.created_date).format('MMM D, YYYY')}</span>
              </div>
              {lead.relationship_type === 'Client' && (
                <div>
                  <Button variant="outline" size="sm" onClick={handleClientStatusToggle} className="text-xs h-7">
                    {lead.client_status || 'New'} → {lead.client_status === 'New' ? 'Established' : 'New'}
                  </Button>
                </div>
              )}
              {lead.phones && lead.phones.length > 0 && lead.phones.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 w-16 shrink-0">{p.label || 'Phone'}</span>
                  <a href={`tel:${p.value}`} className="hover:text-gray-900">{p.value}</a>
                </div>
              ))}
              {lead.emails && lead.emails.length > 0 && lead.emails.map((e, idx) => (
                <div key={idx} className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 w-16 shrink-0">{e.label || 'Email'}</span>
                  <a href={`mailto:${e.value}`} className="hover:text-gray-900 truncate">{e.value}</a>
                </div>
              ))}
              {lead.linkedin_url && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Linkedin className="w-4 h-4 text-gray-400" />
                  <a href={lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 truncate flex items-center gap-1">
                    LinkedIn <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {lead.instagram && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Instagram className="w-4 h-4 text-gray-400" />
                  <span>{lead.instagram}</span>
                </div>
              )}
              {lead.job_industry && (
                <div className="flex items-center gap-2 text-gray-600 col-span-2">
                  <Briefcase className="w-4 h-4 text-gray-400" />
                  <span>{lead.job_industry}</span>
                </div>
              )}
              {lead.count && (
                <div className="flex items-center gap-2 text-gray-600 col-span-2">
                  <Briefcase className="w-4 h-4 text-gray-400" />
                  <span>{lead.company === 'ADP' ? 'Employees' : 'Rooms'}: {lead.count}</span>
                </div>
              )}
              {lead.roll_call != null && lead.roll_call !== '' && (
                <div className="flex items-center gap-2 text-gray-600 col-span-2">
                  <Briefcase className="w-4 h-4 text-gray-400" />
                  <span>Roll Call: ${Number(lead.roll_call).toLocaleString()}</span>
                </div>
              )}
              {lead.address && (
                <div className="flex items-start gap-2 text-gray-600 col-span-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{lead.address}{lead.zipcode ? ` ${lead.zipcode}` : ''}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => navigator.clipboard.writeText(`${lead.address}${lead.zipcode ? ` ${lead.zipcode}` : ''}`)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                      {lead.maps_url && (
                        <a
                          href={lead.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Open in Maps
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stage */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Pipeline Stage</h3>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map(s => (
              <button
                key={s}
                onClick={() => handleStageChange(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  lead.stage === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Notes</h3>
          <div className="flex gap-2 mb-4">
            <Textarea
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Add a note…"
              className="min-h-[60px] resize-none"
            />
            <Button onClick={handleAddNote} disabled={!newNote.trim()} className="shrink-0 self-end">
              Add
            </Button>
          </div>
          {sortedNotes.length === 0 ? (
            <p className="text-sm text-gray-400">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {sortedNotes.map(note => {
                const paired = note.touch_id ? touchById[note.touch_id] : null;
                return (
                  <div key={note.id} className={`border-l-2 pl-3 ${note.pinned ? 'border-amber-300' : 'border-gray-200'}`}>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <span className="text-xs text-gray-400">{moment(note.created_date).format('MMM D, YYYY h:mm A')}</span>
                      {note.pinned && <span className="text-[11px] text-amber-600">📌 pinned</span>}
                      {paired ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          Touch #{paired.touch_index + 1} · {moment(paired.completed_date).format('MMM D')}
                          <button onClick={() => unpairNote(note.id)} className="hover:text-emerald-800" title="Unpair">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setPairingNoteId(pairingNoteId === note.id ? null : note.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700"
                        >
                          <Link2 className="w-3 h-3" /> Pair
                        </button>
                      )}
                    </div>
                    {pairingNoteId === note.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pairableTouches.length === 0 ? (
                          <span className="text-[11px] text-gray-400">No unpaired touches available.</span>
                        ) : pairableTouches.map(t => (
                          <button
                            key={t.id}
                            onClick={() => pairNote(note.id, t.id)}
                            className="inline-flex items-center gap-1 text-[11px] border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-50"
                          >
                            <ChannelIcon channel={t.channel} className="w-3 h-3 text-gray-400" />
                            Touch #{t.touch_index + 1} · {moment(t.completed_date).format('MMM D')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Meeting Notes */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Meeting Notes</h3>
          <div className="space-y-2 mb-4">
            <Input
              type="date"
              value={mtgForm.date}
              onChange={e => setMtgForm(p => ({ ...p, date: e.target.value }))}
              className="w-44"
            />
            <Textarea
              value={mtgForm.content}
              onChange={e => setMtgForm(p => ({ ...p, content: e.target.value }))}
              placeholder="Meeting notes — what was discussed, next steps…"
              className="min-h-[110px]"
            />
            <Button size="sm" onClick={addMeeting} disabled={!mtgForm.content.trim()} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add meeting
            </Button>
          </div>
          {meetings.length === 0 ? (
            <p className="text-sm text-gray-400">No meetings yet.</p>
          ) : (
            <div className="space-y-3">
              {meetings.map(m => (
                editMtg?.id === m.id ? (
                  <div key={m.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <Input type="date" value={editMtg.date} onChange={e => setEditMtg(p => ({ ...p, date: e.target.value }))} className="w-44" />
                    <Textarea value={editMtg.content} onChange={e => setEditMtg(p => ({ ...p, content: e.target.value }))} className="min-h-[110px]" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveMtgEdit}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditMtg(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="border-l-2 border-blue-200 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{m.date ? moment(m.date).format('MMM D, YYYY') : ''}</span>
                      <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setEditMtg({ id: m.id, date: (m.date || '').slice(0, 10), content: m.content })} className="text-gray-300 hover:text-gray-700" title="Edit meeting">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteMeeting(m)} className="text-gray-300 hover:text-red-500" title="Delete meeting">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.content}</p>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        {/* Touch History */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Touch History</h3>
            <button
              onClick={() => setAddingTouch(v => !v)}
              className="text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 text-xs"
              title="Add a touch"
            >
              <Plus className="w-4 h-4" /> Add touch
            </button>
          </div>

          {addingTouch && (
            <div className="mb-3 border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
              <select
                value={touchForm.channel}
                onChange={e => setTouchForm(p => ({ ...p, channel: e.target.value }))}
                className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
              >
                {CHANNEL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="datetime-local"
                value={touchForm.when}
                onChange={e => setTouchForm(p => ({ ...p, when: e.target.value }))}
                className="border border-gray-200 rounded-md px-2 py-1 text-xs"
              />
              <div className="flex items-center gap-1 text-xs text-gray-500">
                Touch #
                <Input type="number" min="1" value={touchForm.number} onChange={e => setTouchForm(p => ({ ...p, number: e.target.value }))} placeholder={`${touchLogs.length + 1}`} className="w-16 h-8" />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <Switch checked={touchForm.answered} onCheckedChange={v => setTouchForm(p => ({ ...p, answered: v }))} />
                Answered
              </label>
              <div className="ml-auto flex gap-2">
                <Button size="sm" onClick={submitNewTouch}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingTouch(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {touchLogs.length === 0 && !lead.next_touch_date ? (
            <p className="text-sm text-gray-400">No touches yet.</p>
          ) : (
            <div className="space-y-2">
              {/* Completed touches */}
              {touchLogs.map(t => (
                editTouch?.id === t.id ? (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm bg-gray-50 rounded-lg p-2">
                    <ChannelIcon channel={t.channel} className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{t.channel}</span>
                    <input
                      type="datetime-local"
                      value={editTouch.when}
                      onChange={e => setEditTouch(p => ({ ...p, when: e.target.value }))}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Switch checked={editTouch.answered} onCheckedChange={v => setEditTouch(p => ({ ...p, answered: v }))} />
                      Answered
                    </label>
                    <div className="ml-auto flex items-center gap-2">
                      <Button size="sm" onClick={saveTouchEdit}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditTouch(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div key={t.id} className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <ChannelIcon channel={t.channel} className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{t.channel}</span>
                    <span className="text-gray-400">· Touch #{t.touch_index + 1}</span>
                    {t.response_received && (
                      <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">replied</span>
                    )}
                    <span className="text-gray-400 ml-auto text-xs">
                      {moment(t.completed_date).format('MMM D, YYYY h:mm A')}
                    </span>
                    <button onClick={() => startEditTouch(t)} className="text-gray-300 hover:text-gray-700 transition-colors" title="Edit touch">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteTouch(t)} className="text-gray-300 hover:text-red-500 transition-colors" title="Delete touch">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              ))}
              {/* Upcoming next touch */}
              {lead.next_touch_channel && !lead.cadence_completed && (
                <div className="flex items-center gap-3 text-sm border-t border-dashed border-gray-100 pt-2 mt-2">
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-gray-400 text-xs font-bold">•</span>
                  </div>
                  <ChannelIcon channel={lead.next_touch_channel} className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-400">{lead.next_touch_channel}</span>
                  <span className="text-gray-300">· Touch #{(lead.current_touch_index || 0) + 1}</span>
                  <span className="text-gray-400 ml-auto text-xs italic">
                    Scheduled {moment(lead.next_touch_date).format('MMM D, YYYY')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
