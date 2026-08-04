import type { InsightSeverity, InsightType } from '@access-genie/shared';
import { Asset, Insight, nextId, type AssetDoc } from '../models/index.js';
import { computeMetrics, loadMetricsContext, type MetricsContext } from './metrics.service.js';
import { presenceStateFor } from './observation.service.js';

/**
 * The insight engine — findings derived from the estate, not stored as fixtures.
 *
 * Insights used to be seeded rows: the same six "AI predictions" regardless of
 * what the assets were doing, which is the least defensible kind of demo data
 * because the whole point of the screen is that a machine noticed something a
 * person had not.
 *
 * These are rules, not a model, and the naming says so. Each one encodes a
 * question an asset owner actually asks — where is it, is it wearing out, is it
 * being paid for and not used, is the warranty about to lapse — and each states
 * the evidence that triggered it. A rule that fires with its reasons attached is
 * more useful to a fleet owner than a score with none, and it is honest about
 * what it is.
 *
 * Regeneration is idempotent by `(type, assetId)`: re-running replaces the open
 * finding rather than stacking duplicates, and anything a person actioned or
 * dismissed is left alone — a dismissed insight that reappears every sweep
 * trains people to ignore the whole screen.
 */

/** How long an asset can go unseen before it is a finding rather than a gap. */
const UNSEEN_DAYS = 3;
/** Below this, a 30-day window of near-zero activity is worth flagging. */
const IDLE_UTILIZATION = 15;
/** Warranty lapse becomes actionable this far out. */
const WARRANTY_HORIZON_DAYS = 45;

interface Finding {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  summary: string;
  drivers: string[];
  recommendedAction: string;
  actionLabel: string;
  confidence: number;
  impactInr?: number;
  impactLabel?: string;
}

/** Every rule, applied to one asset. Returns the findings that fired. */
function evaluate(asset: AssetDoc, ctx: MetricsContext): Finding[] {
  const id = String(asset._id);
  const metrics = computeMetrics(asset, ctx);
  const out: Finding[] = [];

  // ── Where is it? ──────────────────────────────────────────────────────────
  const lastSeen = ctx.lastSeenByAsset.get(id);
  if (lastSeen) {
    const days = Math.floor((ctx.now - lastSeen.getTime()) / 86_400_000);
    if (presenceStateFor(lastSeen, ctx.now) === 'Offline' && days >= UNSEEN_DAYS) {
      out.push({
        type: 'Theft/Security',
        severity: days >= UNSEEN_DAYS * 3 ? 'Critical' : 'Warning',
        title: `${asset.name} has not been seen for ${days} days`,
        summary: `No reader or scan has reported this asset since ${lastSeen.toISOString().slice(0, 10)}. It was last in ${ctx.currentZoneByAsset.get(id) ?? 'an unknown zone'}.`,
        drivers: [`last sighting ${days} days ago`, `last known zone ${ctx.currentZoneByAsset.get(id) ?? 'unknown'}`],
        recommendedAction: 'Search the last known zone, then raise a missing-asset investigation if it is not found.',
        actionLabel: 'Start search',
        // Confidence in the *observation*, not a guess: we know exactly how long
        // it has been, so the only uncertainty is whether the readers cover it.
        confidence: Math.min(95, 60 + days * 5),
      });
    }
  }

  const home = ctx.homeZoneByAsset.get(id);
  const current = ctx.currentZoneByAsset.get(id);
  if (home && current && home !== current) {
    out.push({
      type: 'Theft/Security',
      severity: 'Warning',
      title: `${asset.name} is outside its home zone`,
      summary: `Observed in ${current}; its assigned home is ${home}.`,
      drivers: [`observed in ${current}`, `home zone ${home}`],
      recommendedAction: `Return it to ${home}, or update its assigned location if it has moved permanently.`,
      actionLabel: 'Resolve placement',
      confidence: 90,
    });
  }

  // ── Is it wearing out? ────────────────────────────────────────────────────
  if (metrics.healthScore < 60) {
    out.push({
      type: 'Predictive Failure',
      severity: metrics.healthScore < 40 ? 'Critical' : 'Warning',
      title: `${asset.name} is degrading`,
      summary: `Health has fallen to ${metrics.healthScore}. ${metrics.drivers.slice(0, 2).join('; ') || 'Multiple factors.'}`,
      drivers: metrics.drivers,
      recommendedAction: 'Raise a corrective work order and inspect before the next scheduled service.',
      actionLabel: 'Raise work order',
      // The score is arithmetic over known facts; the *prediction* that it will
      // fail is the inference, so confidence tracks how much evidence there is.
      confidence: Math.min(92, 45 + metrics.drivers.length * 12),
    });
  }

  const pmOverdue = ctx.overduePmByAsset.get(id) ?? 0;
  if (pmOverdue > 0) {
    out.push({
      type: 'Lifecycle',
      severity: pmOverdue > 30 ? 'Critical' : 'Warning',
      title: `Maintenance overdue on ${asset.name}`,
      summary: `Its preventive schedule was due ${pmOverdue} day${pmOverdue === 1 ? '' : 's'} ago and has not been carried out.`,
      drivers: [`PM ${pmOverdue} days overdue`],
      recommendedAction: 'Schedule the PM now, or re-baseline the interval if it is no longer appropriate.',
      actionLabel: 'Schedule PM',
      confidence: 100,
    });
  }

  // ── Is it earning its keep? ───────────────────────────────────────────────
  if (metrics.utilization <= IDLE_UTILIZATION && asset.purchasePrice > 0) {
    out.push({
      type: 'Utilization',
      severity: 'Opportunity',
      title: `${asset.name} is barely used`,
      summary: `Activity on ${metrics.utilization}% of the last 30 days, against a purchase value of ₹${asset.purchasePrice.toLocaleString('en-IN')}.`,
      drivers: [`${metrics.utilization}% active days in 30`, `capital tied up: ₹${asset.purchasePrice.toLocaleString('en-IN')}`],
      recommendedAction: 'Redeploy it to a team that needs one, or retire it rather than renewing.',
      actionLabel: 'Review deployment',
      confidence: 70,
      impactInr: Math.round(asset.purchasePrice * 0.2),
      impactLabel: 'Capital recoverable by redeployment',
    });
  }

  // ── Is a deadline about to pass? ──────────────────────────────────────────
  if (asset.warrantyExpiry) {
    const days = Math.ceil((new Date(asset.warrantyExpiry).getTime() - ctx.now) / 86_400_000);
    if (days >= 0 && days <= WARRANTY_HORIZON_DAYS) {
      out.push({
        type: 'Cost Optimization',
        severity: 'Info',
        title: `Warranty on ${asset.name} expires in ${days} days`,
        summary: `Cover ends ${new Date(asset.warrantyExpiry).toISOString().slice(0, 10)}. Any work after that is billable.`,
        drivers: [`warranty ends in ${days} days`],
        recommendedAction: 'Raise any outstanding claims now, and decide whether to extend before cover lapses.',
        actionLabel: 'Review warranty',
        confidence: 100,
        impactInr: Math.round(asset.purchasePrice * 0.08),
        impactLabel: 'Typical out-of-warranty repair exposure',
      });
    }
  }

  return out;
}

export interface InsightSweepResult {
  scanned: number;
  raised: number;
  refreshed: number;
  cleared: number;
}

/**
 * Regenerate the open insight set for the whole estate.
 *
 * Findings that no longer hold are cleared rather than left to rot: an insight
 * saying an asset is missing, still sitting on the dashboard a week after it
 * was found, is worse than no insight at all.
 */
export async function regenerateInsights(): Promise<InsightSweepResult> {
  const [assets, ctx] = await Promise.all([Asset.find().lean<AssetDoc[]>(), loadMetricsContext()]);

  const existing = await Insight.find({ status: 'open' }).lean();
  const openByKey = new Map(existing.map((i) => [`${i.type}::${i.assetId ?? ''}`, i]));
  const stillValid = new Set<string>();

  let raised = 0;
  let refreshed = 0;

  for (const asset of assets) {
    for (const finding of evaluate(asset, ctx)) {
      const key = `${finding.type}::${asset._id}`;
      stillValid.add(key);
      const prior = openByKey.get(key);

      if (prior) {
        // Refresh the wording and evidence; keep the original id and raise time
        // so "open for 6 days" stays true across sweeps.
        await Insight.updateOne(
          { _id: prior._id },
          {
            $set: {
              severity: finding.severity,
              title: finding.title,
              summary: finding.summary,
              drivers: finding.drivers,
              recommendedAction: finding.recommendedAction,
              actionLabel: finding.actionLabel,
              confidence: finding.confidence,
              ...(finding.impactInr !== undefined ? { impactInr: finding.impactInr } : {}),
              ...(finding.impactLabel ? { impactLabel: finding.impactLabel } : {}),
            },
          },
        );
        refreshed++;
        continue;
      }

      await Insight.create({
        _id: await nextId('insight', 'INS'),
        ...finding,
        assetId: String(asset._id),
        assetName: asset.name,
        status: 'open',
        createdAt: new Date(ctx.now),
      });
      raised++;
    }
  }

  // Anything open that no rule still fires for has been resolved by events.
  const stale = existing.filter((i) => !stillValid.has(`${i.type}::${i.assetId ?? ''}`));
  if (stale.length > 0) {
    await Insight.deleteMany({ _id: { $in: stale.map((i) => i._id) } });
  }

  return { scanned: assets.length, raised, refreshed, cleared: stale.length };
}
