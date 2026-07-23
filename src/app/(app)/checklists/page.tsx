'use client';

import { useMemo } from 'react';
import { mockInspections } from '@/lib/mock-data';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

interface Template {
  name: string;
  category: string;
  itemCount: number;
  usageCount: number;
  icon: string;
}

/** Standard library templates seeded alongside those derived from inspections. */
const STANDARD: Record<string, { category: string; itemCount: number; icon: string }> = {
  'OSHA Forklift Daily': { category: 'Safety', itemCount: 4, icon: '🚜' },
  'HVAC Mechanical': { category: 'Facilities', itemCount: 4, icon: '❄️' },
  'Joint Commission Biomed': { category: 'Medical', itemCount: 3, icon: '⚕️' },
  'Backup Power': { category: 'Facilities', itemCount: 4, icon: '⚡' },
  'Cold Chain Compliance': { category: 'Compliance', itemCount: 3, icon: '🧊' },
};

export default function ChecklistsPage() {
  const { toast } = useToast();

  const templates = useMemo<Template[]>(() => {
    const usage = new Map<string, number>();
    const derivedItems = new Map<string, number>();
    for (const insp of mockInspections) {
      usage.set(insp.template, (usage.get(insp.template) ?? 0) + 1);
      derivedItems.set(insp.template, insp.items.length);
    }
    const names = new Set<string>([...Object.keys(STANDARD), ...usage.keys()]);
    return [...names]
      .map((name) => {
        const std = STANDARD[name];
        return {
          name,
          category: std?.category ?? 'General',
          itemCount: std?.itemCount ?? derivedItems.get(name) ?? 0,
          usageCount: usage.get(name) ?? 0,
          icon: std?.icon ?? '📋',
        };
      })
      .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
  }, []);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Checklists"
        subtitle="Reusable inspection templates for scheduling recurring checks."
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: 'Checklists' }]}
        actions={
          <Button
            onClick={() =>
              toast({ title: 'New template', description: 'Template builder opened (demo).', tone: 'info' })
            }
          >
            + New Template
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => (
          <div
            key={t.name}
            className="glass-panel rounded-xl p-5 flex flex-col gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl leading-none">{t.icon}</span>
                <h3 className="font-heading font-semibold text-slate-900 leading-snug">{t.name}</h3>
              </div>
              <Badge tone="slate">{t.category}</Badge>
            </div>

            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span>
                <span className="font-semibold text-slate-800">{t.itemCount}</span> items
              </span>
              <span>
                <span className="font-semibold text-slate-800">{t.usageCount}</span> uses
              </span>
            </div>

            <div className="mt-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast({ title: 'Edit template', description: `Editing “${t.name}” (demo).`, tone: 'info' })
                }
              >
                Edit
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  toast({
                    title: 'Template applied',
                    description: `New inspection started from “${t.name}”.`,
                    tone: 'success',
                  })
                }
              >
                Use
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
