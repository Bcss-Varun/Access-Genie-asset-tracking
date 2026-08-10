import { Link } from 'react-router-dom';

/**
 * Where is this asset coming from?
 *
 * Four options, down from eight. The four that went — from a purchase order,
 * from a handheld scan, from an ERP sync, and adopting an unknown tag — were
 * each a route into a system that does not exist yet, so every one of them was
 * a card that led nowhere. A picker whose options mostly fail teaches people to
 * distrust the picker.
 *
 * What is left is the four ways an asset actually arrives: you type it, you
 * follow a pattern someone set up, you copy the one next to it, or you have a
 * spreadsheet of them.
 */

interface Source {
  key: string;
  to: string;
  icon: string;
  title: string;
  description: string;
  hint: string;
}

const SOURCES: Source[] = [
  {
    key: 'blank',
    to: '/assets/new?source=blank',
    icon: '✏️',
    title: 'Add an asset',
    description:
      'Type it in yourself. Nothing is assumed about what it is, so you are asked for everything — but only the name, category and site are required.',
    hint: 'Start from nothing',
  },
  {
    key: 'template',
    to: '/assets/new?source=template',
    icon: '📋',
    title: 'From a template',
    description:
      'Someone has already decided which fields this kind of asset needs and which are mandatory. You answer those and nothing else.',
    hint: 'Fastest for a known kind',
  },
  {
    key: 'clone',
    to: '/assets/new?source=clone',
    icon: '🧬',
    title: 'Clone an existing asset',
    description:
      'Copy everything from an asset you already have. Serial, asset tag, MAC and any other identifier are left blank for you to fill in.',
    hint: 'For the twelfth identical unit',
  },
  {
    key: 'import',
    to: '/assets/import',
    icon: '📥',
    title: 'Bulk import',
    description:
      'Map the columns of a CSV or spreadsheet, dry-run the validation, commit the good rows and get the bad ones back as a file.',
    hint: 'Many assets at once',
  },
];

export function SourcePicker() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-lg font-semibold text-slate-900">Where is this asset coming from?</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pick the one that matches how you got it. You can change any field afterwards.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {SOURCES.map((s) => (
          <Link
            key={s.key}
            to={s.to}
            className="group flex flex-col rounded-xl border border-slate-200 p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-2xl leading-none">
                {s.icon}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 group-hover:text-primary-700">{s.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{s.description}</p>
              </div>
            </div>
            <span className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
