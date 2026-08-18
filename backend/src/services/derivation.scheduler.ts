import { logger } from '../config/logger.js';
import { recomputeAllMetrics } from './metrics.service.js';
import { regenerateInsights } from './insightEngine.service.js';
import { raiseDueMaintenance } from './maintenanceAutomation.service.js';
import { raiseLifecycleAlerts } from './lifecycle.service.js';
import { sweepCertificationExpiry } from './complianceSweep.service.js';

/**
 * Keeping the derived layer current.
 *
 * Health, utilization, risk and the insight set are functions of data that
 * changes constantly — sightings arrive, work orders close, schedules fall due
 * — and of the clock itself: an asset becomes "overdue" without anything
 * happening at all. So recomputation cannot be purely event-driven.
 *
 * It is debounced rather than run per event. A gateway sweep can deliver
 * hundreds of observations in a second, and recomputing the whole estate for
 * each one would spend the entire request budget on arithmetic nobody is
 * waiting for. Instead the first change schedules a pass shortly after, and
 * everything arriving in the meantime joins it.
 *
 * The periodic pass exists for the clock-driven half: nothing *happens* when a
 * PM becomes overdue, so without it that finding would never appear.
 */

const DEBOUNCE_MS = 5_000;
const PERIODIC_MS = 10 * 60_000;

let pending: NodeJS.Timeout | null = null;
let running = false;

async function runPass(trigger: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Order matters: metrics first, because the condition trigger below reads
    // the health scores this pass has just written, and the insight rules read
    // the work orders the automation raises.
    const metrics = await recomputeAllMetrics();
    const work = await raiseDueMaintenance();
    const insights = await regenerateInsights();

    if (metrics.updated || insights.raised || insights.cleared || work.pmRaised || work.conditionRaised) {
      logger.info('Derived layer refreshed', { trigger, ...metrics, ...work, ...insights });
    }
  } catch (err) {
    // Never let a derivation failure take down the request that triggered it —
    // the scores are important but they are not the write the caller asked for.
    logger.error('Derivation pass failed', { trigger, err: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
}

/** Note that something changed the inputs. Cheap, and safe to call per write. */
export function markEstateChanged(trigger = 'write'): void {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    void runPass(trigger);
  }, DEBOUNCE_MS);
  // Do not hold the process open for a recomputation on shutdown.
  pending.unref?.();
}

/** Start the clock-driven pass. Called once at boot. */
export function startDerivationScheduler(): void {
  const timer = setInterval(() => void runPass('periodic'), PERIODIC_MS);
  timer.unref?.();
  logger.info('Derivation scheduler started', { everyMinutes: PERIODIC_MS / 60_000 });
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * §9 Notifications — the daily digest sweep (warranty/maintenance/idle/
 * unassigned). A separate, slower clock from the metrics pass above: none of
 * those conditions change meaningfully inside a ten-minute window, and a
 * notification re-sent every ten minutes stops being one. Fires once shortly
 * after boot and then every 24h.
 */
export function startLifecycleNotificationScheduler(): void {
  const run = () =>
    void raiseLifecycleAlerts().catch((err: unknown) => {
      logger.error('Lifecycle notification sweep failed', { err: err instanceof Error ? err.message : String(err) });
    });

  const initial = setTimeout(run, 30_000);
  initial.unref?.();
  const timer = setInterval(run, DAY_MS);
  timer.unref?.();
  logger.info('Lifecycle notification scheduler started', { everyHours: DAY_MS / 3_600_000 });
}


/**
 * §Compliance — the certificate expiry sweep.
 *
 * On the same daily clock as the lifecycle digest, and for the same reason: a
 * certificate lapsing is a change in the *date*, not an event anything emits,
 * so no request will ever notice it. Without this pass a lapsed certificate
 * reads "Valid" indefinitely — which is the one thing a compliance register
 * must never do.
 *
 * Runs shortly after boot so a deployment that has been down over a weekend
 * catches up immediately rather than at the next midnight.
 */
export function startComplianceScheduler(): void {
  const run = () =>
    void sweepCertificationExpiry()
      .then((result) => {
        if (result.expired || result.expiring) logger.info('Certificate expiry swept', { ...result });
      })
      .catch((err: unknown) => {
        logger.error('Certificate expiry sweep failed', { err: err instanceof Error ? err.message : String(err) });
      });

  const initial = setTimeout(run, 20_000);
  initial.unref?.();
  const timer = setInterval(run, DAY_MS);
  timer.unref?.();
  logger.info('Compliance scheduler started', { everyHours: DAY_MS / 3_600_000 });
}
