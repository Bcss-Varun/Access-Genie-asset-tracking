import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/primitives';

const dashboards = [
  { key: 'executive', name: 'Executive', icon: '📈', desc: 'Portfolio value, risk index, utilization, AI-realized savings.', ready: true },
  { key: 'operations', name: 'Operations', icon: '⚙️', desc: 'Live facility map, asset states, WO backlog, throughput.', ready: false },
  { key: 'maintenance', name: 'Maintenance', icon: '🔧', desc: 'WO pipeline, PM compliance, MTTR/MTBF, predictive alerts.', ready: false },
  { key: 'asset', name: 'Asset', icon: '📦', desc: 'Lifecycle funnel, data-quality, utilization, upcoming EOL.', ready: false },
  { key: 'ai', name: 'AI Intelligence', icon: '✨', desc: 'Assets at risk, predicted failures, anomalies, savings.', ready: false },
  { key: 'security', name: 'Security', icon: '🛡️', desc: 'Geofence breaches, tamper events, custody, response time.', ready: false },
  { key: 'inventory', name: 'Inventory', icon: '🏬', desc: 'Stockouts, reorder alerts, ABC analysis, carrying cost.', ready: false },
  { key: 'financial', name: 'Financial', icon: '💰', desc: 'Book value, depreciation, TCO, capex forecast, ROA.', ready: false },
];

export default function DashboardsGalleryPage() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Dashboards"
        subtitle="Eight role dashboards — switch, customize, and share."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards' }]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboards.map((d) => (
          <Link
            key={d.key}
            to={`/dashboards/${d.key}`}
            className="glass-panel rounded-xl p-5 hover:border-primary-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="text-2xl">{d.icon}</div>
              {d.ready ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Ready</span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">Soon</span>
              )}
            </div>
            <h3 className="mt-3 text-base font-semibold font-heading text-slate-900 group-hover:text-primary-700">{d.name} Dashboard</h3>
            <p className="mt-1 text-sm text-slate-500">{d.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
