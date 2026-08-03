import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockAssets } from '@/lib/mock-data';
import type { Asset } from '@/types/asset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney } from '@/lib/utils';

// ── Lifecycle stages (ordered left→right on the board) ───────────────────────
const STAGES = [
  'Procurement',
  'Commissioning',
  'In Service',
  'Maintenance',
  'EOL Planning',
  'Retired/Disposed',
] as const;
type Stage = (typeof STAGES)[number];

// Per-stage accent tokens (header tint + count pill + card rail).
const stageTheme: Record<Stage, { dot: string; bar: string; head: string; badge: 'slate' | 'primary' | 'emerald' | 'amber' | 'red'; emoji: string }> = {
  Procurement: { dot: 'bg-slate-400', bar: 'bg-slate-400', head: 'text-slate-600', badge: 'slate', emoji: '🛒' },
  Commissioning: { dot: 'bg-primary-500', bar: 'bg-primary-500', head: 'text-primary-700', badge: 'primary', emoji: '🔧' },
  'In Service': { dot: 'bg-health-good', bar: 'bg-health-good', head: 'text-emerald-700', badge: 'emerald', emoji: '✅' },
  Maintenance: { dot: 'bg-health-warning', bar: 'bg-health-warning', head: 'text-amber-700', badge: 'amber', emoji: '🛠️' },
  'EOL Planning': { dot: 'bg-orange-500', bar: 'bg-orange-500', head: 'text-orange-700', badge: 'amber', emoji: '📉' },
  'Retired/Disposed': { dot: 'bg-health-critical', bar: 'bg-health-critical', head: 'text-red-700', badge: 'red', emoji: '🗑️' },
};

const categoryEmoji = (c: Asset['category']) =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : c === 'Sensors' ? '📡' : c === 'Infrastructure' ? '⚡' : '⚙️';

const healthColor = (h: number) =>
  h > 80 ? 'bg-health-good' : h > 50 ? 'bg-health-warning' : 'bg-health-critical';

// Derive a board column for an asset — prefer its explicit lifecycleStage, else
// fall back to a sensible mapping off the operational status.
function deriveStage(a: Asset): Stage {
  const ls = a.lifecycleStage;
  if (ls && (STAGES as readonly string[]).includes(ls)) return ls as Stage;
  switch (a.status) {
    case 'Staging':
      return 'Commissioning';
    case 'Maintenance':
      return 'Maintenance';
    case 'End_Of_Life':
      return 'EOL Planning';
    default:
      return 'In Service';
  }
}

export default function LifecyclePage() {
  const { toast } = useToast();
  const [view, setView] = useState<'board' | 'list'>('board');

  // Seed a stage map keyed by asset id so cards can move (in-session mock CRUD).
  const [stageMap, setStageMap] = useState<Record<string, Stage>>(() =>
    Object.fromEntries(mockAssets.map((a) => [a.id, deriveStage(a)])),
  );

  const assetsById = useMemo(() => new Map(mockAssets.map((a) => [a.id, a])), []);

  const move = (asset: Asset, to: Stage) => {
    setStageMap((prev) => ({ ...prev, [asset.id]: to }));
    toast({ title: 'Stage updated', description: `${asset.name} → ${to}`, tone: 'success' });
  };

  // Group asset ids per stage (order preserved from mockAssets).
  const columns = useMemo(() => {
    const map: Record<Stage, Asset[]> = {
      Procurement: [], Commissioning: [], 'In Service': [], Maintenance: [], 'EOL Planning': [], 'Retired/Disposed': [],
    };
    for (const a of mockAssets) map[stageMap[a.id] ?? deriveStage(a)].push(a);
    return map;
  }, [stageMap]);

  const totalBookValue = useMemo(
    () => mockAssets.reduce((sum, a) => sum + (a.bookValue ?? 0), 0),
    [],
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Lifecycle"
        subtitle="Stage board across the full asset lifecycle — from procurement to disposal."
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Lifecycle' }]}
        actions={
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors',
                  view === v ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      {/* KPI row — counts per key stage + portfolio book value */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="In Service" value={columns['In Service'].length} tone="emerald" sub="Operational" accent />
        <KpiCard label="Maintenance" value={columns.Maintenance.length} tone="amber" sub="Servicing" />
        <KpiCard label="EOL Planning" value={columns['EOL Planning'].length} tone="amber" sub="End of life" />
        <KpiCard label="Portfolio Book Value" value={formatMoney(totalBookValue)} tone="slate" sub={`${mockAssets.length} assets tracked`} />
      </div>

      {view === 'board' ? (
        <BoardView columns={columns} onMove={move} />
      ) : (
        <ListView stageMap={stageMap} assetsById={assetsById} onMove={move} />
      )}
    </div>
  );
}

// ── Board view ───────────────────────────────────────────────────────────────
function BoardView({
  columns, onMove,
}: {
  columns: Record<Stage, Asset[]>;
  onMove: (asset: Asset, to: Stage) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2">
      {STAGES.map((stage) => {
        const theme = stageTheme[stage];
        const items = columns[stage];
        return (
          <div key={stage} className="glass-panel flex w-72 shrink-0 flex-col rounded-xl">
            {/* Column header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', theme.dot)} />
                <h2 className={cn('font-heading text-sm font-bold truncate', theme.head)}>{stage}</h2>
              </div>
              <Badge tone={theme.badge}>{items.length}</Badge>
            </div>

            {/* Column body — vertical scroll */}
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {items.length === 0 ? (
                <EmptyState icon={theme.emoji} title="No assets" description={`Nothing in ${stage}.`} />
              ) : (
                items.map((a) => <AssetCard key={a.id} asset={a} stage={stage} onMove={onMove} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssetCard({
  asset, stage, onMove,
}: {
  asset: Asset; stage: Stage; onMove: (asset: Asset, to: Stage) => void;
}) {
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base">
          {categoryEmoji(asset.category)}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/assets/${asset.id}`}
            className="block truncate text-sm font-semibold text-slate-800 hover:text-primary-600"
          >
            {asset.name}
          </Link>
          <div className="mt-0.5 text-xs text-slate-400">{asset.category}</div>
        </div>
      </div>

      {/* Health bar */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
          <span>Health</span>
          <span className="tabular-nums text-slate-600">{asset.healthScore}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={cn('h-full rounded-full', healthColor(asset.healthScore))} style={{ width: `${asset.healthScore}%` }} />
        </div>
      </div>

      {/* Footer — book value + move control */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-bold font-heading tabular-nums text-slate-900">
          {formatMoney(asset.bookValue ?? 0)}
        </span>
        <Dropdown
          ariaLabel="Move to stage"
          trigger={({ toggle }) => (
            <Button variant="outline" size="sm" onClick={toggle}>
              Move →
            </Button>
          )}
        >
          {({ close }) => (
            <>
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Move to
              </div>
              {STAGES.filter((s) => s !== stage).map((s) => (
                <MenuItem
                  key={s}
                  icon={stageTheme[s].emoji}
                  onClick={() => {
                    onMove(asset, s);
                    close();
                  }}
                >
                  {s}
                </MenuItem>
              ))}
            </>
          )}
        </Dropdown>
      </div>
    </div>
  );
}

// ── List view ────────────────────────────────────────────────────────────────
function ListView({
  stageMap, assetsById, onMove,
}: {
  stageMap: Record<string, Stage>;
  assetsById: Map<string, Asset>;
  onMove: (asset: Asset, to: Stage) => void;
}) {
  const rows = mockAssets;
  if (rows.length === 0) {
    return (
      <div className="glass-panel rounded-xl">
        <EmptyState title="No assets" description="There are no assets to display." />
      </div>
    );
  }
  return (
    <div className="glass-panel flex-1 min-h-0 overflow-auto rounded-xl">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Health</th>
            <th className="px-4 py-3 text-right">Book Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((a) => {
            const stage = stageMap[a.id] ?? deriveStage(a);
            return (
              <tr key={a.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base">
                      {categoryEmoji(a.category)}
                    </div>
                    <div className="min-w-0">
                      <Link to={`/assets/${a.id}`} className="block truncate font-semibold text-slate-800 hover:text-primary-600">
                        {a.name}
                      </Link>
                      <div className="text-xs text-slate-400">{a.category}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="inline-flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', stageTheme[stage].dot)} />
                    <select
                      value={stage}
                      onChange={(e) => onMove(a, e.target.value as Stage)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn('h-full rounded-full', healthColor(a.healthScore))} style={{ width: `${a.healthScore}%` }} />
                    </div>
                    <span className="w-7 tabular-nums text-xs font-medium text-slate-600">{a.healthScore}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                  {formatMoney(a.bookValue ?? 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
