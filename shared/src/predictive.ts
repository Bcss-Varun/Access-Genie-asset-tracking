// ─────────────────────────────────────────────────────────────────────────────
// Predictive Alerts.
//
// A predictive alert says "this asset is heading for a failure" and carries the
// evidence for the claim: the signals behind it, how confident the detector is,
// and what it thinks should be done. It is a *record*, not a rendering — every
// number the screen shows is stored here or derived from what is stored.
//
// **The module owns the lifecycle, not the prediction.** There is no predictive
// engine in this platform yet, and this file does not pretend otherwise: nothing
// here manufactures a score. What it does is give an alert somewhere to live and
// a life to lead — raised, acknowledged, turned into work, dismissed — so that
// when a model does arrive it has an API to write to and a screen to appear on,
// rather than a rebuild. Until then alerts arrive the one honest way they can:
// somebody raises one, through the same endpoint the engine will use.
//
// That is why `source` exists and why `detector` is optional. An alert raised by
// a reliability engineer who noticed a bearing running hot is a real predictive
// alert; an alert with a fabricated confidence score attached to nothing is not.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How bad it is if the prediction is right.
 *
 * Deliberately not the same vocabulary as the operational `AlertSeverity`
 * (Critical/Warning/Info). That one grades an event that has already happened;
 * this one grades a consequence that has not, and reads on the same scale as
 * work-order priority because that is the decision it feeds.
 */
export const PREDICTIVE_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type PredictiveSeverity = (typeof PREDICTIVE_SEVERITIES)[number];

/**
 * What kind of failure is being predicted.
 *
 * **Append-only**, for the same reason work-order sources are: these are stored
 * enum values, and removing one does not remove it from the database — it only
 * makes those records fail validation on their next save.
 */
export const PREDICTIVE_ALERT_TYPES = [
  'Impending Failure',
  'Degradation Trend',
  'Anomalous Reading',
  'Thermal Stress',
  'Vibration',
  'Battery Health',
  'Capacity Exhaustion',
  'Usage Threshold',
  'End of Life',
] as const;
export type PredictiveAlertType = (typeof PREDICTIVE_ALERT_TYPES)[number];

/**
 * Where the alert came from.
 *
 * `Predictive Engine` and `Rule Engine` are the machine paths — unused today,
 * declared now so an engine integrating later changes no schema. `Manual` is a
 * person raising one. `Imported` covers a bulk load from an external CMMS or a
 * vendor's monitoring product.
 */
export const PREDICTIVE_ALERT_SOURCES = ['Manual', 'Predictive Engine', 'Rule Engine', 'Imported'] as const;
export type PredictiveAlertSource = (typeof PREDICTIVE_ALERT_SOURCES)[number];

/**
 * The lifecycle.
 *
 * `Work Order Created` is a status rather than a flag because it is the outcome
 * that matters: an alert that produced work has been dealt with, and a board
 * that showed it in the same column as one nobody has looked at would be
 * counting triage that already happened as triage still owed.
 *
 * `Resolved` closes the loop from the other end — the predicted failure did not
 * happen, or the work fixed it — and is the only status reachable from
 * `Work Order Created`.
 */
export const PREDICTIVE_ALERT_STATUSES = [
  'Open',
  'Acknowledged',
  'Work Order Created',
  'Dismissed',
  'Resolved',
] as const;
export type PredictiveAlertStatus = (typeof PREDICTIVE_ALERT_STATUSES)[number];

/** Statuses that still want somebody's attention. One definition, used everywhere. */
export const OPEN_PREDICTIVE_STATUSES: PredictiveAlertStatus[] = ['Open', 'Acknowledged'];

/**
 * Which statuses may follow which.
 *
 * Shared with the client so a screen offers exactly the moves the API accepts,
 * rather than showing a button that answers 400.
 *
 * A dismissed alert can be reopened: dismissal is a judgement call made from a
 * summary line, and the one thing worse than a false alert is a true one somebody
 * waved away with no way back. `Resolved` is terminal — re-predicting is a new
 * alert, which is what keeps the history a history.
 */
export const PREDICTIVE_ALERT_TRANSITIONS: Record<PredictiveAlertStatus, PredictiveAlertStatus[]> = {
  Open: ['Acknowledged', 'Work Order Created', 'Dismissed'],
  Acknowledged: ['Work Order Created', 'Dismissed', 'Resolved'],
  'Work Order Created': ['Resolved'],
  Dismissed: ['Open'],
  Resolved: [],
};

/**
 * One piece of evidence behind the prediction.
 *
 * Structured rather than a sentence, because the detail view shows them as a
 * table and the same fields are what a model would emit: the thing measured, the
 * reading, and the band it left. `weight` is the contribution to the score where
 * the detector can express one — explainability, not decoration.
 */
export interface PredictiveSignal {
  /** What was measured — "Bearing temperature", "SMART reallocated sectors". */
  label: string;
  /** The reading, as it should be displayed. Free text so units travel with it. */
  value: string;
  /** What normal looks like, for contrast. */
  baseline?: string;
  /** Why this reading matters. */
  detail?: string;
  /** 0-100. The share of the confidence score this signal accounts for. */
  weight?: number;
}

export interface PredictiveAlertEvent {
  from: PredictiveAlertStatus | null;
  to: PredictiveAlertStatus;
  at: string;
  actor: string;
  note?: string;
}

/** Where an alert sits in the organisation. Derived from the asset on read. */
export interface PredictiveAlertPlacement {
  facilityId: string | null;
  facilityName: string;
  organizationId: string | null;
  organizationName: string;
  locationId: string | null;
  locationName: string;
}

/**
 * What the detector thinks should be done, in a form a work order can be built
 * from without a human retyping it.
 *
 * Stored on the alert rather than decided at the moment somebody presses the
 * button, so the recommendation shown on the card and the order actually raised
 * are the same recommendation.
 */
export interface PredictiveRecommendation {
  /** The sentence shown on the card. */
  action: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  /** Days from raising to due date. */
  dueInDays: number;
  estimatedHours: number;
  requiredSkill?: string;
}

export interface PredictiveAlert {
  id: string;
  title: string;
  severity: PredictiveSeverity;
  type: PredictiveAlertType;
  status: PredictiveAlertStatus;
  source: PredictiveAlertSource;

  assetId: string;
  /** Denormalised so a list renders without a join, and survives the asset's retirement. */
  assetName: string;

  /** 0-100. How sure the detector is that the prediction is right. */
  confidence: number;
  /** When the condition was detected — not when the row was written. */
  detectedAt: string;
  /** When failure is expected, where the detector can say. */
  predictedFailureAt?: string;

  /** Why the alert exists, in prose. One or two sentences. */
  reason: string;
  /** Why the alert exists, in evidence. */
  signals: PredictiveSignal[];
  recommendation: PredictiveRecommendation;

  /**
   * Which model produced it. Absent on manually raised alerts — and that absence
   * is the point: it is how the screen tells a measured prediction from a
   * judgement call, instead of presenting both as machine output.
   */
  detector?: { name: string; version?: string; modelId?: string };

  /** Work orders raised from this alert. Real ids, not a counter. */
  workOrderIds: string[];

  acknowledgedBy?: string;
  acknowledgedAt?: string;
  dismissedBy?: string;
  dismissedAt?: string;
  dismissedReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;

  history: PredictiveAlertEvent[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  /** Resolved from the asset on read, never stored — see the service. */
  placement?: PredictiveAlertPlacement;
}

// ── Read contracts ───────────────────────────────────────────────────────────

/**
 * The four summary cards.
 *
 * `assetsAtRisk` is distinct assets, not alerts — three signals on one chiller
 * is one machine in trouble, and counting it as three overstates the estate's
 * exposure. `workOrdersCreated` counts orders actually raised from alerts, which
 * is why it cannot be inferred from the status counts alone: one alert may raise
 * more than one.
 */
export interface PredictiveAlertStats {
  open: number;
  highConfidence: number;
  assetsAtRisk: number;
  workOrdersCreated: number;
  /** The threshold `highConfidence` was counted at, so the card can label itself. */
  confidenceThreshold: number;
  total: number;
}

/** Filter-bar options, counted from the alerts that exist. */
export interface PredictiveAlertFacets {
  severities: { severity: PredictiveSeverity; count: number }[];
  types: { type: PredictiveAlertType; count: number }[];
  statuses: { status: PredictiveAlertStatus; count: number }[];
  facilities: { id: string; name: string; count: number }[];
  assets: { id: string; name: string; count: number }[];
  sources: { source: PredictiveAlertSource; count: number }[];
}

/**
 * An alert's neighbours on the same asset.
 *
 * The detail view shows these as "alert history": what else this machine has
 * been flagged for, and what came of it. Answered by the API rather than
 * refetched with a filter by the client, so the panel is one request.
 */
export interface PredictiveAlertHistoryEntry {
  id: string;
  title: string;
  type: PredictiveAlertType;
  severity: PredictiveSeverity;
  status: PredictiveAlertStatus;
  confidence: number;
  detectedAt: string;
  workOrderIds: string[];
}

/** The work orders an alert raised, resolved for the detail view. */
export interface PredictiveAlertWorkOrder {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo: string;
  dueDate: string;
}

/** Everything the detail view needs, in one request. */
export interface PredictiveAlertDetail {
  alert: PredictiveAlert;
  asset: {
    id: string;
    name: string;
    category: string;
    status: string;
    criticality?: string;
    healthScore?: number;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    location: string;
    lifecycleStage?: string;
  } | null;
  workOrders: PredictiveAlertWorkOrder[];
  /** Other alerts on the same asset, newest first, excluding this one. */
  assetHistory: PredictiveAlertHistoryEntry[];
}
