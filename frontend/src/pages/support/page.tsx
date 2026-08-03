import { useState } from 'react';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

type TicketStatus = 'Open' | 'In Progress' | 'Waiting' | 'Resolved';

const statusTone = (s: TicketStatus): 'primary' | 'amber' | 'slate' | 'emerald' =>
  s === 'Open' ? 'primary' : s === 'In Progress' ? 'amber' : s === 'Waiting' ? 'slate' : 'emerald';

const CATEGORIES = ['Assets & Tracking', 'Maintenance', 'AI & Insights', 'Account & Security', 'Integrations & API', 'Billing'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

const TICKETS: { id: string; subject: string; category: string; status: TicketStatus; updated: string }[] = [
  { id: 'SUP-4821', subject: 'Gateway GW-14 shows offline after firmware update', category: 'Integrations & API', status: 'In Progress', updated: '2026-07-23T07:30:00.000Z' },
  { id: 'SUP-4798', subject: 'Bulk asset import rejects rows with valid SKUs', category: 'Assets & Tracking', status: 'Waiting', updated: '2026-07-22T15:10:00.000Z' },
  { id: 'SUP-4776', subject: 'Anomaly scores missing on the AI dashboard', category: 'AI & Insights', status: 'Open', updated: '2026-07-22T09:05:00.000Z' },
  { id: 'SUP-4712', subject: 'Add SSO via Okta for the org', category: 'Account & Security', status: 'Resolved', updated: '2026-07-19T18:40:00.000Z' },
  { id: 'SUP-4690', subject: 'PM schedule emails arriving twice', category: 'Maintenance', status: 'Resolved', updated: '2026-07-17T11:22:00.000Z' },
];

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';
const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
const td = 'px-4 py-3.5';

export default function SupportPage() {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState('Normal');
  const [description, setDescription] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast({ title: 'Subject required', description: 'Please add a short subject for your ticket.', tone: 'error' });
      return;
    }
    toast({ title: 'Ticket submitted', description: `“${subject}” was created at ${priority} priority.`, tone: 'success' });
    setSubject(''); setDescription(''); setPriority('Normal'); setCategory(CATEGORIES[0]);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Support"
        subtitle="Open a ticket and track your existing conversations with our team."
        breadcrumb={[{ label: 'Help', href: '/help' }, { label: 'Support' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* New ticket form */}
        <form onSubmit={onSubmit} className="glass-panel rounded-xl p-5 space-y-4 lg:col-span-2">
          <h3 className="font-heading font-semibold text-slate-800">New ticket</h3>
          <div>
            <label className={labelCls} htmlFor="sup-subject">Subject</label>
            <input id="sup-subject" className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of the issue" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="sup-cat">Category</label>
              <select id="sup-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="sup-pri">Priority</label>
              <select id="sup-pri" className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="sup-desc">Description</label>
            <textarea id="sup-desc" rows={5} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Steps to reproduce, expected vs. actual, and any relevant IDs…" />
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button type="submit" variant="primary">Submit ticket</Button>
          </div>
        </form>

        {/* Existing tickets */}
        <div className="glass-panel rounded-xl overflow-hidden lg:col-span-3">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-heading font-semibold text-slate-800">Your tickets</h3>
            <span className="text-xs text-slate-400">{TICKETS.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className={th}>ID</th>
                  <th className={th}>Subject</th>
                  <th className={th}>Status</th>
                  <th className={th}>Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TICKETS.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className={td + ' font-mono text-xs text-slate-500 whitespace-nowrap'}>{t.id}</td>
                    <td className={td}>
                      <div className="font-medium text-slate-800">{t.subject}</div>
                      <div className="text-xs text-slate-400">{t.category}</div>
                    </td>
                    <td className={td}><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                    <td className={td + ' text-slate-500 whitespace-nowrap'}>{relTime(t.updated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
