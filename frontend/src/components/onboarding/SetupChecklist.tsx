// ─────────────────────────────────────────────────────────────────────────────
// SetupChecklist — what's left, not what's missing.
//
// One component, two homes: it heads the Configure stage during registration,
// and it heads Asset 360 for as long as the asset is a Draft.
//
// Design rule: a person who has just successfully created an asset must not be
// shown a wall of empty checkboxes. So this shows ONLY the things still to do —
// completed items collapse to a single line, and items this class doesn't
// require are folded away entirely. Two open rows read as "nearly done"; eight
// rows of grey boxes read as "you failed an audit".
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateGates, readiness, approvalReason } from '@/lib/onboarding';
import { getClassTemplate } from '@/lib/asset-classes';
import { cn } from '@/lib/utils';
import type { GateKey, GateResult, RegisteredAsset } from '@access-genie/shared';

/**
 * Which Configure card resolves each gate. `null` means no card can — monitoring
 * and the maintenance plan are inherited from the asset class, so an open gate
 * there is a gap in the class library, not something this registrant can fix.
 */
export const GATE_TO_CARD: Record<GateKey, string | null> = {
  identified: 'identify',
  located: 'place',
  accountable: 'place',
  tracked: 'track',
  financial: 'commercial',
  documented: 'commercial',
  maintainable: null,
  monitored: null,
};

/**
 * Plain-language face of each gate. The engine's vocabulary ("Accountable",
 * "Documented") is precise but reads like an auditor; a person filling this in
 * wants a question they can answer.
 */
const GATE_UI: Record<GateKey, { icon: string; label: string; ask: string }> = {
  identified: { icon: '🏷️', label: 'Identity', ask: 'Name, class and serial number' },
  located: { icon: '📍', label: 'Location', ask: 'Where is it?' },
  accountable: { icon: '👤', label: 'Owner', ask: "Who's responsible for it?" },
  tracked: { icon: '🔖', label: 'Tracking tag', ask: 'Attach a tag — or say it isn’t tracked' },
  financial: { icon: '💰', label: 'Purchase details', ask: 'What did it cost, and who from?' },
  maintainable: { icon: '🔧', label: 'Maintenance', ask: 'Set a PM plan on the asset class' },
  documented: { icon: '📎', label: 'Documents', ask: 'Invoice, warranty, manual' },
  monitored: { icon: '🔔', label: 'Monitoring', ask: 'Set a monitoring profile on the asset class' },
};

/** Fraction, not a percentage — "1/6" is a position, "17%" is a grade. */
function Ring({ met, total }: { met: number; total: number }) {
  const pct = total === 0 ? 100 : (met / total) * 100;
  const r = 24;
  const circ = 2 * Math.PI * r;
  const done = met === total;
  return (
    <svg
      width="62" height="62" viewBox="0 0 62 62" className="shrink-0"
      role="img" aria-label={`${met} of ${total} steps complete`}
    >
      <circle cx="31" cy="31" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-200" />
      <circle
        cx="31" cy="31" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
        stroke={done ? 'var(--color-health-good)' : 'var(--color-primary-600)'}
        strokeDasharray={`${(circ * pct) / 100} ${circ}`}
        transform="rotate(-90 31 31)"
      />
      {done ? (
        <text x="31" y="32" textAnchor="middle" dominantBaseline="central" className="fill-emerald-600 text-[19px] font-bold">✓</text>
      ) : (
        <text x="31" y="32" textAnchor="middle" dominantBaseline="central" className="fill-slate-800 text-[15px] font-bold tabular-nums">
          {met}<tspan className="fill-slate-400">/{total}</tspan>
        </text>
      )}
    </svg>
  );
}

/** An open item — a question with a way to answer it. */
function TodoRow({ gate, onJump }: { gate: GateResult; onJump?: (card: string) => void }) {
  const ui = GATE_UI[gate.key];
  const card = GATE_TO_CARD[gate.key];
  const pending = gate.state === 'pending';

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-6 shrink-0 text-center text-base leading-none" aria-hidden>{ui.icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-slate-900">{ui.label}</span>
        <p className={cn('text-xs', pending ? 'text-amber-600' : 'text-slate-500')}>
          {pending ? gate.detail : ui.ask}
        </p>
      </div>
      {onJump && card ? (
        <button
          type="button"
          onClick={() => onJump(card)}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
        >
          {pending ? 'Verify' : 'Add'}
        </button>
      ) : (
        <span className="shrink-0 text-[11px] text-slate-400">on the asset class</span>
      )}
    </li>
  );
}

export function SetupChecklist({
  asset, onJump, footer, title,
}: {
  asset: RegisteredAsset;
  onJump?: (card: string) => void;
  footer?: React.ReactNode;
  title?: string;
}) {
  const tpl = getClassTemplate(asset.onboarding.classId);
  const gates = evaluateGates(asset, tpl);
  const { met, total, ready } = readiness(gates);
  const approval = approvalReason(asset, tpl);

  const required = gates.filter((g) => g.required);
  const todo = required.filter((g) => g.state !== 'met');
  const done = required.filter((g) => g.state === 'met');
  // Things this class doesn't ask for. Folded away — showing an unticked box for
  // something that was never required is how a short list looks like a long one.
  const optional = gates.filter((g) => !g.required && g.state !== 'met');

  const headline = ready ? 'Ready to go live'
    : todo.length === 1 ? 'One thing left'
      : todo.length <= 3 ? 'Nearly there'
        : `${todo.length} things left`;

  const sub = ready
    ? 'Nothing else is needed before this asset goes into service.'
    : `${met} of ${total} done — and you can finish the rest whenever you like.`;

  return (
    <section className="glass-panel rounded-xl p-6">
      {/* Header — progress and the one primary action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Ring met={met} total={total} />
          <div className="min-w-0">
            <h2 className="font-heading text-base font-bold text-slate-900">{title ?? headline}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{sub}</p>
          </div>
        </div>
        {footer}
      </div>

      {ready && approval && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">Needs a sign-off first.</span> {approval}
        </div>
      )}

      {/* What's left */}
      {todo.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {todo.map((g) => <TodoRow key={g.key} gate={g} onJump={onJump} />)}
        </ul>
      )}

      {/* What's already handled — one quiet line, not eight rows */}
      {done.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span className="font-semibold text-emerald-600">✓ Done</span>
          {done.map((g, i) => (
            <span key={g.key}>
              {GATE_UI[g.key].label}{i < done.length - 1 && <span className="ml-1.5 text-slate-300">·</span>}
            </span>
          ))}
        </p>
      )}

      {/* Not asked for by this class — available, never nagging */}
      {optional.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs text-slate-400 transition-colors hover:text-slate-600">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span>{' '}
            {optional.length} optional {optional.length === 1 ? 'item' : 'items'} for this asset class
          </summary>
          <ul className="mt-1 divide-y divide-slate-100 border-t border-slate-100">
            {optional.map((g) => <TodoRow key={g.key} gate={g} onJump={onJump} />)}
          </ul>
        </details>
      )}
    </section>
  );
}
