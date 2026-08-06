import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { riskBar, riskTone } from '@/components/dashboards/DashboardKit';
import { categoryEmoji } from '@/lib/asset-categories';
import { allAssets, categoryBreakdown, allInsights } from '@/lib/dataset';
import { cn, formatMoney } from '@/lib/utils';

type AnswerKey = 'risk' | 'value' | 'idle';
type Message = { role: 'user'; text: string } | { role: 'assistant'; answer: AnswerKey; text: string };

const SUGGESTIONS: { label: string; key: AnswerKey }[] = [
  { label: 'Which assets are most at risk right now?', key: 'risk' },
  { label: "What's our total portfolio value?", key: 'value' },
  { label: 'Show me idle or under-utilized assets', key: 'idle' },
  { label: 'What needs my attention today?', key: 'risk' },
];

const PROMPT: Record<AnswerKey, string> = {
  risk: 'Which assets are most at risk right now?',
  value: "What's our total portfolio value?",
  idle: 'Show me idle or under-utilized assets',
};

// Keyword → scripted answer routing for free-text input.
function route(text: string): AnswerKey {
  const q = text.toLowerCase();
  if (/value|worth|portfolio|tco|financ|depreciat/.test(q)) return 'value';
  if (/idle|under.?util|utiliz|rebalanc/.test(q)) return 'idle';
  return 'risk';
}

// ── Rich answer cards ─────────────────────────────────────────────────────────
function RiskAnswer() {
  const top = [...allAssets].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 4);
  const insight = allInsights.find((i) => i.type === 'Predictive Failure');

  // `risk` is the fallback intent for anything the router does not recognise, so
  // this renders on the very first unmatched question — including on an estate
  // with nothing registered yet, where there is no riskiest asset to name.
  if (top.length === 0) {
    return (
      <p className="text-sm text-slate-700 leading-relaxed">
        There are no assets registered yet, so there is nothing to score for risk. Once assets are
        registered and reporting, this answers with the ones above the risk-60 action threshold.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 leading-relaxed">
        <span className="font-semibold text-slate-900">{allAssets.filter((a) => (a.riskScore ?? 0) > 60).length} assets</span> are
        above the risk-60 action threshold. The most urgent is{' '}
        <span className="font-semibold text-slate-900">{top[0].name}</span> at a risk score of {top[0].riskScore}.
      </p>
      <div className="space-y-2">
        {top.map((a) => (
          <Link key={a.id} to={`/assets/${a.id}`} className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 hover:border-primary-300 transition-colors">
            <div className="flex items-center min-w-0">
              <span className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-base mr-3 shrink-0">{categoryEmoji(a.category)}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{a.name}</div>
                <div className="text-xs text-slate-500">{a.id} · {a.location.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden hidden sm:block">
                <div className={cn('h-full rounded-full', riskBar(a.riskScore ?? 0))} style={{ width: `${a.riskScore ?? 0}%` }} />
              </div>
              <span className={cn('text-sm font-semibold tabular-nums', riskTone(a.riskScore ?? 0))}>{a.riskScore}</span>
            </div>
          </Link>
        ))}
      </div>
      {insight && (
        <div className="rounded-lg bg-primary-50 border border-primary-100 p-3 text-sm text-slate-700">
          <span className="font-semibold text-primary-700">Recommended action: </span>{insight.recommendedAction}
        </div>
      )}
    </div>
  );
}

function ValueAnswer() {
  const total = categoryBreakdown.reduce((s, c) => s + c.value, 0);
  const book = allAssets.reduce((s, a) => s + (a.bookValue ?? 0), 0);
  const purchase = allAssets.reduce((s, a) => s + a.purchasePrice, 0);
  const max = Math.max(...categoryBreakdown.map((c) => c.value));
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 leading-relaxed">
        Total portfolio value (TCO) is <span className="font-semibold text-primary-600">{formatMoney(total)}</span> across{' '}
        {categoryBreakdown.reduce((s, c) => s + c.count, 0).toLocaleString()} assets. Compute endpoints lead the mix.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Portfolio TCO</div>
          <div className="text-lg font-bold font-heading text-slate-900">{formatMoney(total)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Net Book (sample)</div>
          <div className="text-lg font-bold font-heading text-slate-900">{formatMoney(book)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Depreciated (sample)</div>
          <div className="text-lg font-bold font-heading text-slate-900">{formatMoney(purchase - book)}</div>
        </div>
      </div>
      <ul className="space-y-2">
        {categoryBreakdown.map((c) => (
          <li key={c.category} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-slate-600">{categoryEmoji(c.category)} {c.category}</span>
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.round((c.value / max) * 100)}%` }} />
            </div>
            <span className="w-14 text-right text-sm font-semibold tabular-nums text-slate-800">{formatMoney(c.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdleAnswer() {
  const idle = allAssets.filter((a) => (a.utilization ?? 0) < 40 && a.status !== 'Missing')
    .sort((a, b) => (a.utilization ?? 0) - (b.utilization ?? 0));
  const insight = allInsights.find((i) => i.type === 'Utilization');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 leading-relaxed">
        <span className="font-semibold text-slate-900">{idle.length} assets</span> are running under 40% utilization.
        Rebalancing the lowest performers could recover meaningful capacity at zero transfer cost.
      </p>
      <div className="space-y-2">
        {idle.map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
            <div className="flex items-center min-w-0">
              <span className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-base mr-3 shrink-0">{categoryEmoji(a.category)}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{a.name}</div>
                <div className="text-xs text-slate-500">{a.id} · {a.location.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden hidden sm:block">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${a.utilization ?? 0}%` }} />
              </div>
              <span className="text-sm font-semibold tabular-nums text-amber-600">{a.utilization ?? 0}%</span>
            </div>
          </div>
        ))}
      </div>
      {insight && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm text-slate-700">
          <span className="font-semibold text-emerald-700">Opportunity: </span>{insight.summary}
        </div>
      )}
    </div>
  );
}

function AnswerCard({ answer }: { answer: AnswerKey }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-primary-700 mb-3">
        <span className="text-base">🤖</span> Access Genie Copilot
      </div>
      {answer === 'risk' ? <RiskAnswer /> : answer === 'value' ? <ValueAnswer /> : <IdleAnswer />}
    </div>
  );
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  const ask = (text: string, key?: AnswerKey) => {
    const q = text.trim();
    if (!q) return;
    const answer = key ?? route(q);
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', answer, text: q }]);
    setInput('');
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="AI Copilot"
        subtitle="Ask about your asset portfolio in plain language."
        breadcrumb={[{ label: 'Workspace' }, { label: 'AI Copilot' }]}
        actions={
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400">
            Tip: press
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
            for the quick palette
          </span>
        }
      />

      <div className="glass-panel rounded-xl flex-1 flex flex-col overflow-hidden">
        {/* Conversation */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="text-4xl mb-3">🤖</div>
              <h3 className="text-lg font-heading font-semibold text-slate-900">How can I help?</h3>
              <p className="text-sm text-slate-500 mt-1">
                I can surface at-risk assets, portfolio value, idle equipment and more — grounded in your live asset graph.
              </p>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-lg rounded-2xl rounded-br-sm bg-primary-600 text-white px-4 py-2.5 text-sm shadow-sm">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="max-w-2xl"><AnswerCard answer={m.answer} /></div>
              ),
            )
          )}
        </div>

        {/* Suggested prompts */}
        <div className="px-6 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => ask(PROMPT[s.key], s.key)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-primary-300 hover:text-primary-700 transition-colors"
              >
                <span className="text-primary-500">✨</span> {s.label}
              </button>
            ))}
          </div>

          {/* Prompt input */}
          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="flex items-center gap-2 py-4"
          >
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🤖</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Copilot about your assets…"
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <Button type="submit" disabled={!input.trim()}>Ask</Button>
            {messages.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setMessages([])}>Clear</Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
