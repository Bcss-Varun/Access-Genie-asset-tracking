import type { ModuleKey } from '@access-genie/shared';
import { FieldGroup, CheckField } from '@/components/ui/FormDialog';
import { MODULE_CATALOG } from '@/lib/module-catalog';

/**
 * Grant a user modules beyond what their role already gives them.
 *
 * Additive only, and the modules the role already grants are shown as fixed
 * rows rather than offered as checkboxes — checking one would do nothing (the
 * role already grants it) and unchecking it would look like a revocation this
 * field cannot perform. What is actually offered is only the modules *outside*
 * the current role, which is the one thing a per-user grant can change.
 */
export function ExtraModulesPicker({
  roleModules,
  value,
  onChange,
}: {
  roleModules: ModuleKey[];
  value: ModuleKey[];
  onChange: (next: ModuleKey[]) => void;
}) {
  const toggle = (key: ModuleKey) => onChange(value.includes(key) ? value.filter((m) => m !== key) : [...value, key]);
  const extra = MODULE_CATALOG.filter((m) => !roleModules.includes(m.key));

  return (
    <FieldGroup
      label="Extra permissions"
      hint="Beyond what the role above already grants — for the one person who needs Analytics without moving their whole role."
    >
      {extra.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">This role already grants every module.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {extra.map((m) => (
            <CheckField key={m.key} label={m.label} hint={m.blurb} checked={value.includes(m.key)} onChange={() => toggle(m.key)} />
          ))}
        </div>
      )}
    </FieldGroup>
  );
}
