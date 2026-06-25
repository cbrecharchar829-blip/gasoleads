import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import BusinessLocationSearch from '@/components/leads/BusinessLocationSearch';
import { base44 } from '@/api/localClient';
import moment from 'moment';

const EMPTY_SCHEDULE = { mid: false, firstDate: '', firstTime: '', touchesDone: 2, lastDate: '' };

const EMPTY_FORM = {
  company_name: '', decision_maker: '', gatekeeper: '',
  name: '', company: 'ADP', phones: [], emails: [],
  linkedin_url: '', instagram: '', job_industry: '',
  relationship_type: 'Prospect', client_status: 'New',
  address: '', zipcode: '', maps_url: '', count: '', roll_call: '',
};

const BUILT_IN_RELATIONSHIPS = ['Prospect', 'Partner', 'Client'];

export default function AddLeadDialog({ open, onOpenChange, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [sched, setSched] = useState({ ...EMPTY_SCHEDULE });
  const [firstNote, setFirstNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [partnershipTypes, setPartnershipTypes] = useState([]);

  // Load any custom partnership types so they appear as relationship options.
  useEffect(() => {
    if (!open) return;
    base44.entities.PartnershipType.list('-created_date', 100)
      .then(setPartnershipTypes)
      .catch(() => setPartnershipTypes([]));
  }, [open]);

  // Custom types for the currently-selected company.
  const customForCompany = partnershipTypes
    .filter(pt => pt.company === form.company)
    .map(pt => pt.label)
    .filter(label => !BUILT_IN_RELATIONSHIPS.includes(label));
  const relationshipOptions = [...BUILT_IN_RELATIONSHIPS, ...customForCompany];

  // Turn the optional scheduling panel into options for addLead().
  const buildScheduleOptions = () => {
    if (sched.mid) {
      const lastAt = sched.lastDate
        ? new Date(`${sched.lastDate}T12:00`).toISOString()
        : new Date().toISOString();
      return { touchesDone: Math.max(1, parseInt(sched.touchesDone) || 1), lastTouchAt: lastAt };
    }
    if (sched.firstDate || sched.firstTime) {
      const datePart = sched.firstDate || moment().format('YYYY-MM-DD');
      const timePart = sched.firstTime || '09:00';
      return { firstTouchAt: new Date(`${datePart}T${timePart}`).toISOString() };
    }
    return {}; // blank => first touch due today
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form, { ...buildScheduleOptions(), firstNote });
    } finally {
      setSaving(false);
    }
    setForm({ ...EMPTY_FORM });
    setSched({ ...EMPTY_SCHEDULE });
    setFirstNote('');
    onOpenChange(false);
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
         <DialogHeader>
           <DialogTitle>Add New Lead</DialogTitle>
         </DialogHeader>
         <div className="grid gap-4 py-2">
           <div>
             <Label>Company Name</Label>
             <Input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="e.g. Acme Corp" className="h-10" />
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             <div>
               <Label>Decision Maker</Label>
               <Input value={form.decision_maker} onChange={e => set('decision_maker', e.target.value)} placeholder="Full name" className="h-10" />
             </div>
             <div>
               <Label>Gatekeeper</Label>
               <Input value={form.gatekeeper} onChange={e => set('gatekeeper', e.target.value)} placeholder="Full name" className="h-10" />
             </div>
           </div>
           <div className="border-t border-gray-100 pt-2" />
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             <div>
               <Label>Primary Contact Name *</Label>
               <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" className="h-10" />
             </div>
             <div>
               <Label>Company</Label>
               <Select value={form.company} onValueChange={v => set('company', v)}>
                 <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="ADP">ADP</SelectItem>
                   <SelectItem value="CaneyCloud/VAV">CaneyCloud/VAV</SelectItem>
                 </SelectContent>
               </Select>
             </div>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             <div>
               <Label>Relationship</Label>
               <Select value={form.relationship_type} onValueChange={v => set('relationship_type', v)}>
                 <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   {relationshipOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                 </SelectContent>
               </Select>
             </div>
             {form.relationship_type === 'Client' && (
               <div>
                 <Label>Client Status</Label>
                 <Select value={form.client_status} onValueChange={v => set('client_status', v)}>
                   <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="New">New</SelectItem>
                     <SelectItem value="Established">Established</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
             )}
           </div>
          <div>
            <Label className="mb-2 block">Phone Numbers</Label>
            <div className="space-y-2">
              {form.phones.map((p, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="e.g. Mobile" value={p.label} onChange={e => set('phones', form.phones.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} className="h-10" />
                  <div className="flex gap-2">
                    <Input placeholder="+1 555-0123" value={p.value} onChange={e => set('phones', form.phones.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))} className="flex-1 h-10" />
                    <Button variant="outline" size="icon" onClick={() => set('phones', form.phones.filter((_, i) => i !== idx))} className="text-red-500 h-10 w-10">×</Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-10 w-full" onClick={() => set('phones', [...form.phones, { label: '', value: '' }])}>+ Add Phone</Button>
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Email Addresses</Label>
            <div className="space-y-2">
              {form.emails.map((e, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="e.g. Work" value={e.label} onChange={ev => set('emails', form.emails.map((x, i) => i === idx ? { ...x, label: ev.target.value } : x))} className="h-10" />
                  <div className="flex gap-2">
                    <Input placeholder="email@example.com" value={e.value} onChange={ev => set('emails', form.emails.map((x, i) => i === idx ? { ...x, value: ev.target.value } : x))} className="flex-1 h-10" />
                    <Button variant="outline" size="icon" onClick={() => set('emails', form.emails.filter((_, i) => i !== idx))} className="text-red-500 h-10 w-10">×</Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-10 w-full" onClick={() => set('emails', [...form.emails, { label: '', value: '' }])}>+ Add Email</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>LinkedIn URL</Label>
              <Input value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="linkedin.com/in/..." className="h-10" />
            </div>
            <div>
              <Label>Instagram</Label>
              <Input value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@handle" className="h-10" />
            </div>
          </div>
          <div>
            <Label>Job / Industry</Label>
            <Input value={form.job_industry} onChange={e => set('job_industry', e.target.value)} placeholder="Sales Manager, SaaS, etc." className="h-10" />
          </div>
          <div>
            <Label>{form.company === 'ADP' ? 'Number of Employees' : 'Number of Rooms'}</Label>
            <Input type="number" value={form.count} onChange={e => set('count', e.target.value ? parseInt(e.target.value) : '')} placeholder="e.g. 50" className="h-10" />
          </div>
          <div>
            <Label>Roll Call (Contract Value)</Label>
            <Input type="number" value={form.roll_call} onChange={e => set('roll_call', e.target.value ? parseFloat(e.target.value) : '')} placeholder="e.g. 5000" className="h-10" />
          </div>
          <div>
            <Label>Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Textarea value={firstNote} onChange={e => setFirstNote(e.target.value)} placeholder="First quick note — stays pinned to the top of this lead's notes." className="min-h-[70px]" />
          </div>
          <div className="border-t border-gray-100 pt-2" />
          <div>
            <Label className="mb-1 block">Scheduling <span className="text-gray-400 font-normal">(optional)</span></Label>
            <div className="flex items-center gap-2 mb-2">
              <Switch checked={sched.mid} onCheckedChange={v => setSched(s => ({ ...s, mid: v }))} />
              <span className="text-sm text-gray-600">I've already been working this lead</span>
            </div>
            {!sched.mid ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">First touch date <span className="text-gray-400">(blank = today)</span></p>
                  <Input type="date" value={sched.firstDate} onChange={e => setSched(s => ({ ...s, firstDate: e.target.value }))} className="h-10" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Time <span className="text-gray-400">(optional)</span></p>
                  <Input type="time" value={sched.firstTime} onChange={e => setSched(s => ({ ...s, firstTime: e.target.value }))} className="h-10" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Touches already done</p>
                  <Input type="number" min="1" value={sched.touchesDone} onChange={e => setSched(s => ({ ...s, touchesDone: e.target.value }))} className="h-10" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Last touch was on</p>
                  <Input type="date" value={sched.lastDate} onChange={e => setSched(s => ({ ...s, lastDate: e.target.value }))} className="h-10" />
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 pt-2" />
          <div>
            <Label className="mb-1 block">Location <span className="text-gray-400 font-normal">(optional)</span></Label>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Search & verify location</p>
                <BusinessLocationSearch onSelect={({ address, zipcode, maps_url }) => {
                  set('address', address);
                  set('zipcode', zipcode);
                  set('maps_url', maps_url);
                }} />
              </div>
              <div className="relative">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-100" />
                <div className="relative flex justify-center">
                  <span className="px-2 bg-white text-xs text-gray-400">or</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Manually enter address</p>
                <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="e.g., 123 Main St, City, State" className="text-xs h-10" />
              </div>
              {form.address && (
                <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  📍 {form.address}{form.zipcode ? ` ${form.zipcode}` : ''} <span className="text-gray-400 ml-1 text-xs">{form.maps_url ? '(verified)' : '(not verified)'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="h-10">
            {saving ? 'Adding…' : 'Add Lead'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
