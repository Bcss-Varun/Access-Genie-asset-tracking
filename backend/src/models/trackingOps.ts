import { model, Schema } from 'mongoose';
import {
  ALERT_LIFECYCLES,
  ALERT_PRIORITIES,
  INCIDENT_STATES,
  TRACKING_ALERT_CATEGORIES,
  type AlertLifecycle,
  type AlertPriority,
  type AlertTimelineEntry,
  type IncidentState,
  type TrackingAlertCategory,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// What needs a human right now: the alerts the estate raised, the incidents
// several alerts add up to, and the rules that decide which of the two you get.
//
// Alert.ts holds the platform-wide alert (health, maintenance, custody). These
// are specifically the tracking workspace's operational alerts, which carry an
// SLA clock, an owning team and a recommended action.

// ── Tracking alerts ──────────────────────────────────────────────────────────
export interface TrackingAlertDoc {
  _id: string; // TAL-01
  category: TrackingAlertCategory;
  priority: AlertPriority;
  state: AlertLifecycle;
  title: string;
  summary: string;
  assetId?: string;
  assetName?: string;
  deviceId?: string;
  facility: string;
  location: string;
  raisedAt: Date;
  ackAt?: Date;
  resolvedAt?: Date;
  /** When the response clock runs out; `slaBreached` is derived from it. */
  slaDueAt: Date;
  slaBreached: boolean;
  assignee: string;
  team: string;
  /** Set when this alert has been rolled into an incident. */
  incidentId?: string;
  source: string;
  recommendation: string;
  recommendationAction: string;
  valueAtRiskInr: number;
  timeline: AlertTimelineEntry[];
}

const alertTimelineSchema = new Schema(
  {
    at: { type: Date, required: true },
    actor: { type: String, required: true },
    action: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const trackingAlertSchema = new Schema<TrackingAlertDoc>(
  {
    _id: { type: String, required: true },
    category: { type: String, required: true, enum: TRACKING_ALERT_CATEGORIES, index: true },
    priority: { type: String, required: true, enum: ALERT_PRIORITIES, index: true },
    state: { type: String, required: true, enum: ALERT_LIFECYCLES, default: 'New', index: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    assetId: { type: String, ref: 'Asset', index: true, sparse: true },
    assetName: String,
    deviceId: { type: String, ref: 'TrackingDevice', sparse: true },
    facility: { type: String, required: true, index: true },
    location: { type: String, default: '' },
    raisedAt: { type: Date, required: true, index: true },
    ackAt: Date,
    resolvedAt: Date,
    slaDueAt: { type: Date, required: true },
    slaBreached: { type: Boolean, default: false },
    assignee: { type: String, default: '' },
    team: { type: String, default: '' },
    incidentId: { type: String, ref: 'Incident', sparse: true },
    source: { type: String, default: '' },
    recommendation: { type: String, default: '' },
    recommendationAction: { type: String, default: '' },
    valueAtRiskInr: { type: Number, default: 0, min: 0 },
    // Append-only: the trail has to survive every hand-off.
    timeline: { type: [alertTimelineSchema], default: [] },
  },
  { versionKey: false },
);

trackingAlertSchema.plugin(baseSchemaPlugin);
// The action queue's ordering: open alerts for one site, most urgent first.
trackingAlertSchema.index({ facility: 1, state: 1, priority: 1, raisedAt: -1 });
trackingAlertSchema.index({ title: 'text', assetName: 'text' }, { name: 'tracking_alert_search' });

/** The states in which an alert is still someone's problem. */
export const OPEN_TRACKING_ALERT_STATES: AlertLifecycle[] = [
  'New',
  'Acknowledged',
  'Assigned',
  'In Progress',
  'Escalated',
];

export const TrackingAlert = model<TrackingAlertDoc>('TrackingAlert', trackingAlertSchema);

// ── Incidents ────────────────────────────────────────────────────────────────
/** Several related alerts under one commander, with one running narrative. */
export interface IncidentDoc {
  _id: string; // INC-01
  title: string;
  severity: 'Sev1' | 'Sev2' | 'Sev3';
  state: IncidentState;
  alertIds: string[];
  openedAt: Date;
  resolvedAt?: Date;
  commander: string;
  facility: string;
  summary: string;
  assetsAffected: number;
  valueAtRiskInr: number;
  nextAction: string;
}

const incidentSchema = new Schema<IncidentDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    severity: { type: String, required: true, enum: ['Sev1', 'Sev2', 'Sev3'], index: true },
    state: { type: String, required: true, enum: INCIDENT_STATES, default: 'Open', index: true },
    alertIds: { type: [String], default: [], index: true },
    openedAt: { type: Date, required: true, index: true },
    resolvedAt: Date,
    commander: { type: String, required: true },
    facility: { type: String, required: true, index: true },
    summary: { type: String, default: '' },
    assetsAffected: { type: Number, default: 0, min: 0 },
    valueAtRiskInr: { type: Number, default: 0, min: 0 },
    nextAction: { type: String, default: '' },
  },
  { versionKey: false },
);

incidentSchema.plugin(baseSchemaPlugin);
export const Incident = model<IncidentDoc>('Incident', incidentSchema);

// ── Automation rules ─────────────────────────────────────────────────────────
export interface AutomationRuleDoc {
  _id: string; // AR-01
  name: string;
  category: TrackingAlertCategory;
  /** Plain-language trigger — the rule reads as a sentence in the table. */
  when: string;
  then: string[];
  priority: AlertPriority;
  assignTeam: string;
  escalateAfterMin: number;
  enabled: boolean;
  firedToday: number;
  /** Duplicates the rule swallowed — the number that keeps alert fatigue down. */
  suppressedToday: number;
}

const automationRuleSchema = new Schema<AutomationRuleDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: TRACKING_ALERT_CATEGORIES, index: true },
    when: { type: String, required: true },
    then: { type: [String], default: [] },
    priority: { type: String, required: true, enum: ALERT_PRIORITIES },
    assignTeam: { type: String, default: '' },
    escalateAfterMin: { type: Number, default: 0, min: 0 },
    enabled: { type: Boolean, default: true, index: true },
    firedToday: { type: Number, default: 0, min: 0 },
    suppressedToday: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);

automationRuleSchema.plugin(baseSchemaPlugin);
export const AutomationRule = model<AutomationRuleDoc>('AutomationRule', automationRuleSchema);
