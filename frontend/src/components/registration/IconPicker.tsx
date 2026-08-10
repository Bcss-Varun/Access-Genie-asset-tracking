import { cn } from '@/lib/utils';

/**
 * Pick a template's icon from a fixed set.
 *
 * A free-text emoji box asks people to know how to type an emoji, and accepts
 * anything — including a letter, or four emoji, or nothing. A grid of the ones
 * that actually suit IT assets is one click, always renders, and keeps the
 * template list visually consistent.
 *
 * The set is IT-first on purpose: the generic box leads because it is the
 * default, and everything after it is a kind of hardware someone registers.
 */
const ICONS = [
  '📦',
  '💻', '🖥️', '🗄️', '💾', '🌐', '📡', '🛰️',
  '📱', '⌨️', '🖱️', '🖨️', '📟', '📷', '📺', '🎧',
  '🔌', '🔋', '⚡', '🛡️', '💿', '🧰', '🔬',
];

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">Icon</span>
      <div role="radiogroup" aria-label="Template icon" className="flex flex-wrap gap-1.5">
        {ICONS.map((icon) => {
          const selected = value === icon;
          return (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Icon ${icon}`}
              onClick={() => onChange(icon)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                selected
                  ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-200'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span aria-hidden>{icon}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
