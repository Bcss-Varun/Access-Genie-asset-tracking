import { useCallback, useState } from 'react';
import type { PredictiveAlert } from '@access-genie/shared';
import {
  EMPTY_PREDICTIVE_FILTERS,
  activePredictiveFilterCount,
  predictiveAlertsApi,
  usePredictiveAlertDetail,
  usePredictiveAlerts,
  usePredictiveFacets,
  usePredictiveStats,
  useRefreshPredictiveAlerts,
  type PredictiveFilters,
  type RaiseAlertBody,
  type RaiseWorkOrderBody,
} from '@/api/predictive-alerts';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { useToast } from '@/components/providers/ToastProvider';
import { ErrorState, MetricCard, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { AlertTable } from '@/components/maintenance/predictive/AlertTable';
import { AlertDetailDrawer } from '@/components/maintenance/predictive/AlertDetailDrawer';
import { PredictiveFilterBar } from '@/components/maintenance/predictive/PredictiveFilterBar';
import { CreateWorkOrderDialog, DismissAlertDialog } from '@/components/maintenance/predictive/AlertActionDialogs';
import { RaiseAlertDialog } from '@/components/maintenance/predictive/RaiseAlertDialog';

/**
 * Predictive Alerts.
 *
 * Every number, row, filter option and timestamp on this screen comes from
 * `/predictive-alerts`. Nothing is hardcoded and nothing is counted in the
 * browser — the previous version of this page kept its "auto work orders"
 * figure in React state, so pressing the button moved a number that meant
 * nothing and vanished on reload.
 *
 * There is no predictive model behind this yet, and the screen does not pretend
 * there is. It shows the alerts the database holds, says of each whether a
 * detector or a person produced it, and gives them a lifecycle — acknowledge,
 * raise work, dismiss, resolve — that a real engine can drive through the same
 * API the moment one is connected. An empty board here means no alerts exist,
 * not that a model found nothing.
 *
 * The four summary cards run the same filters as the table beneath them, so the
 * counters describe the cut in view rather than the whole estate.
 */

export default function PredictivePage() {
  const [filters, setFilters] = useState<PredictiveFilters>(EMPTY_PREDICTIVE_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-detectedAt');

  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [workOrderFor, setWorkOrderFor] = useState<PredictiveAlert | null>(null);
  const [dismissing, setDismissing] = useState<PredictiveAlert | null>(null);
  /** The row with a request in flight — so one busy alert does not freeze the table. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const { run, isPending } = useMutate();
  const refresh = useRefreshPredictiveAlerts();
  const { toast } = useToast();

  const listFilters: PredictiveFilters = { ...filters, page, limit: 25, sort };
  const list = usePredictiveAlerts(listFilters);
  const stats = usePredictiveStats(filters);
  const facets = usePredictiveFacets();
  const detail = usePredictiveAlertDetail(openId ?? undefined);

  const activeCount = activePredictiveFilterCount(filters);
  const now = Date.now();

  const update = useCallback((next: Partial<PredictiveFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    // Any filter change invalidates the page number: staying on page 3 of a
    // one-page result shows an empty table and reads as a bug.
    setPage(1);
  }, []);

  const clear = useCallback(() => {
    setFilters(EMPTY_PREDICTIVE_FILTERS);
    setPage(1);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  // Each goes through `run`, which refreshes this module's queries first and the
  // shared dataset behind it, then reports success or the server's own reason
  // for refusing. That is what makes the cards and the table move together
  // without either being updated by hand.

  const acknowledge = useCallback(
    async (alert: PredictiveAlert) => {
      setBusyId(alert.id);
      await run(predictiveAlertsApi.acknowledge(alert.id), {
        success: 'Alert acknowledged',
        successDetail: `${alert.id} — ${alert.assetName}`,
        describe: 'acknowledge that alert',
        refresh,
      });
      setBusyId(null);
    },
    [run, refresh],
  );

  const resolve = useCallback(
    async (alert: PredictiveAlert) => {
      setBusyId(alert.id);
      await run(predictiveAlertsApi.resolve(alert.id), {
        success: 'Alert resolved',
        successDetail: `${alert.id} closed — the predicted failure no longer stands.`,
        describe: 'resolve that alert',
        refresh,
      });
      setBusyId(null);
    },
    [run, refresh],
  );

  const reopen = useCallback(
    async (alert: PredictiveAlert) => {
      setBusyId(alert.id);
      await run(predictiveAlertsApi.reopen(alert.id), {
        success: 'Alert reopened',
        successDetail: `${alert.id} is back in the triage queue.`,
        describe: 'reopen that alert',
        refresh,
      });
      setBusyId(null);
    },
    [run, refresh],
  );

  const confirmDismiss = useCallback(
    async (reason: string) => {
      if (!dismissing) return;
      const result = await run(predictiveAlertsApi.dismiss(dismissing.id, reason), {
        success: 'Alert dismissed',
        successDetail: `${dismissing.id} — it can be reopened from the detail view.`,
        describe: 'dismiss that alert',
        refresh,
      });
      if (result) setDismissing(null);
    },
    [dismissing, run, refresh],
  );

  const confirmWorkOrder = useCallback(
    async (body: RaiseWorkOrderBody) => {
      if (!workOrderFor) return;
      const result = await run(predictiveAlertsApi.raiseWorkOrder(workOrderFor.id, body), {
        describe: 'create a work order for that alert',
        refresh,
      });

      if (result) {
        // The server says whether it created one or handed back an order that
        // already existed. Reporting both as "created" would tell somebody they
        // had raised a second ticket when they had not.
        toast({
          title: result.reused ? 'Work order already open' : `Work order ${result.workOrderId} created`,
          description: result.reused
            ? `${result.workOrderId} is already open against this alert — no second order was raised.`
            : `Raised against ${workOrderFor.assetName} and linked to ${workOrderFor.id}.`,
          tone: result.reused ? 'default' : 'success',
        });
        setWorkOrderFor(null);
      }
    },
    [workOrderFor, run, refresh, toast],
  );

  const confirmRaise = useCallback(
    async (body: RaiseAlertBody) => {
      const result = await run(predictiveAlertsApi.raise(body), {
        describe: 'raise that alert',
        refresh,
      });

      if (result) {
        toast({
          title: `Alert ${result.id} raised`,
          description: `${result.assetName} — ${result.confidence}% confidence, awaiting triage.`,
          tone: 'success',
        });
        setRaising(false);
      }
    },
    [run, refresh, toast],
  );

  // ── Summary cards ──────────────────────────────────────────────────────────

  const data = stats.data;
  const metrics = [
    {
      label: 'Open Alerts',
      value: data?.open ?? 0,
      sub: 'Awaiting triage',
      tone: (data?.open ?? 0) > 0 ? ('primary' as const) : ('slate' as const),
      icon: '⚡',
    },
    {
      label: 'High-Confidence',
      value: data?.highConfidence ?? 0,
      // The card states the threshold it was counted at, taken from the same
      // response — a number whose cut-off the reader has to guess is a number
      // nobody can check.
      sub: `Open, ≥ ${data?.confidenceThreshold ?? 80}% confidence`,
      tone: (data?.highConfidence ?? 0) > 0 ? ('amber' as const) : ('slate' as const),
      icon: '🎯',
    },
    {
      label: 'Assets at Risk',
      value: data?.assetsAtRisk ?? 0,
      sub: 'Distinct assets, not alerts',
      tone: (data?.assetsAtRisk ?? 0) > 0 ? ('red' as const) : ('slate' as const),
      icon: '🏭',
    },
    {
      label: 'Work Orders Created',
      value: data?.workOrdersCreated ?? 0,
      sub: 'Raised from these alerts',
      tone: 'emerald' as const,
      icon: '🔧',
    },
  ];

  return (
    <div className="flex h-full flex-col space-y-5">
      <PageHeader
        title="Predictive Alerts"
        subtitle="Predicted failures with the evidence behind them — triaged, and turned into work orders."
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: 'Predictive Alerts' }]}
        actions={<Button onClick={() => setRaising(true)}>+ Raise Alert</Button>}
      />

      {/* The four summary cards. Same filters as the table below them. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            sub={metric.sub}
            tone={metric.tone}
            icon={metric.icon}
          />
        ))}
      </div>

      <PredictiveFilterBar
        filters={filters}
        facets={facets.data}
        onChange={update}
        onClear={clear}
        activeCount={activeCount}
      />

      {list.error ? (
        <div className="glass-panel">
          <ErrorState
            title="Could not load predictive alerts"
            description={list.error instanceof ApiRequestError ? list.error.message : 'The request failed.'}
            requestId={list.error instanceof ApiRequestError ? list.error.requestId : undefined}
            onRetry={() => void list.refetch()}
          />
        </div>
      ) : (
        <AlertTable
          items={list.data?.items ?? []}
          meta={list.data?.meta}
          loading={list.isLoading}
          sort={sort}
          now={now}
          filtersActive={activeCount > 0}
          busyId={busyId}
          onSort={(next) => {
            setSort(next);
            setPage(1);
          }}
          onPage={setPage}
          onOpen={(alert) => setOpenId(alert.id)}
          onAcknowledge={(alert) => void acknowledge(alert)}
          onCreateWorkOrder={setWorkOrderFor}
          onDismiss={setDismissing}
          onRaise={() => setRaising(true)}
        />
      )}

      {openId && (
        <AlertDetailDrawer
          detail={detail.data}
          loading={detail.isLoading}
          error={detail.error}
          busy={isPending}
          onClose={() => setOpenId(null)}
          onRetry={() => void detail.refetch()}
          onAcknowledge={(alert) => void acknowledge(alert)}
          onCreateWorkOrder={setWorkOrderFor}
          onDismiss={setDismissing}
          onReopen={(alert) => void reopen(alert)}
          onResolve={(alert) => void resolve(alert)}
        />
      )}

      {workOrderFor && (
        <CreateWorkOrderDialog
          alert={workOrderFor}
          busy={isPending}
          onCancel={() => setWorkOrderFor(null)}
          onSubmit={(body) => void confirmWorkOrder(body)}
        />
      )}

      {dismissing && (
        <DismissAlertDialog
          alert={dismissing}
          busy={isPending}
          onCancel={() => setDismissing(null)}
          onSubmit={(reason) => void confirmDismiss(reason)}
        />
      )}

      {raising && (
        <RaiseAlertDialog busy={isPending} onCancel={() => setRaising(false)} onSubmit={(body) => void confirmRaise(body)} />
      )}
    </div>
  );
}
