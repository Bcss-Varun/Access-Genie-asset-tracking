import { Link } from 'react-router-dom';
import { allInsights } from '@/lib/dataset';
import { PageHeader, EmptyState } from '@/components/ui/primitives';

export default function FeedbackPage() {
  return <div className="space-y-6">
    <PageHeader title="Feedback" subtitle="Review the evidence behind asset insights."
      breadcrumb={[{ label: 'AI Intelligence', href: '/ai-insights' }, { label: 'Feedback' }]} />
    <div className="glass-panel rounded-xl p-6">
      <h2 className="text-lg font-semibold">Feedback submission is unavailable</h2>
      <p className="mt-2 text-sm text-slate-600">Feedback storage and model retraining are not connected. No review totals or training results are available.</p>
    </div>
    {allInsights.length ? <ul className="divide-y divide-slate-200 glass-panel rounded-xl">
      {allInsights.map(insight => <li key={insight.id} className="p-4">
        <p className="font-medium">{insight.title}</p><p className="text-sm text-slate-600">{insight.summary}</p>
        {insight.assetId && <Link className="text-primary-600 text-sm" to={`/assets/${insight.assetId}`}>Review asset</Link>}
      </li>)}
    </ul> : <EmptyState title="No insights to review" description="Insights appear when the estate provides evidence for them." />}
  </div>;
}
