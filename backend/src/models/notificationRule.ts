import { model, Schema } from 'mongoose';
import {
  CONDITION_OPERATORS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  RECIPIENT_KINDS,
  ROLE_IDS,
  type NotificationChannel,
  type NotificationCondition,
  type NotificationEvent,
  type NotificationRecipient,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * When the platform tells somebody something.
 *
 * The rule is configuration; the log below it is what actually happened. Keeping
 * both is what makes "did this rule fire?" answerable — a rules screen with no
 * log can only show intent, which is indistinguishable from a rule that has
 * never worked.
 */

export interface NotificationRuleDoc {
  _id: string; // NR-1
  name: string;
  event: NotificationEvent;
  conditions: NotificationCondition[];
  channels: NotificationChannel[];
  recipients: NotificationRecipient[];
  throttleMinutes: number;
  quietHours: { enabled: boolean; start: string; end: string };
  escalation: { enabled: boolean; afterHours: number; toRole?: string };
  scopeId?: string;
  status: 'active' | 'inactive';
  createdBy: string;
  sentCount: number;
  lastFiredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conditionSchema = new Schema<NotificationCondition>(
  {
    field: { type: String, required: true },
    op: { type: String, required: true, enum: CONDITION_OPERATORS },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const recipientSchema = new Schema<NotificationRecipient>(
  { kind: { type: String, required: true, enum: RECIPIENT_KINDS }, value: { type: String } },
  { _id: false },
);

const notificationRuleSchema = new Schema<NotificationRuleDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    event: { type: String, required: true, enum: NOTIFICATION_EVENTS, index: true },
    conditions: { type: [conditionSchema], default: [] },
    channels: { type: [String], enum: NOTIFICATION_CHANNELS, default: ['in_app'] },
    recipients: { type: [recipientSchema], default: [] },
    throttleMinutes: { type: Number, default: 0, min: 0, max: 10_080 },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' },
      end: { type: String, default: '07:00' },
    },
    escalation: {
      enabled: { type: Boolean, default: false },
      afterHours: { type: Number, default: 24, min: 1, max: 720 },
      toRole: { type: String, enum: ROLE_IDS },
    },
    scopeId: { type: String, index: true },
    status: { type: String, required: true, enum: ['active', 'inactive'], default: 'inactive', index: true },
    createdBy: { type: String, default: '' },
    // Counters, incremented only when a send actually happens.
    sentCount: { type: Number, default: 0, min: 0 },
    lastFiredAt: { type: Date },
  },
  { versionKey: false, timestamps: true },
);

notificationRuleSchema.plugin(baseSchemaPlugin);
notificationRuleSchema.index({ event: 1, status: 1 });

export const NotificationRule = model<NotificationRuleDoc>('NotificationRule', notificationRuleSchema);

// ── Log ──────────────────────────────────────────────────────────────────────

export interface NotificationRuleLogDoc {
  _id: string; // NRL-1
  ruleId: string;
  ruleName: string;
  event: NotificationEvent;
  at: Date;
  subjectId?: string;
  recipients: string[];
  channels: NotificationChannel[];
  /** Why nothing was sent is as important as a send — throttling is not a failure. */
  outcome: 'sent' | 'throttled' | 'quiet_hours' | 'no_recipients' | 'test';
  detail?: string;
}

const logSchema = new Schema<NotificationRuleLogDoc>(
  {
    _id: { type: String, required: true },
    ruleId: { type: String, required: true, index: true },
    ruleName: { type: String, default: '' },
    event: { type: String, required: true, enum: NOTIFICATION_EVENTS },
    at: { type: Date, required: true, index: true },
    subjectId: { type: String },
    recipients: { type: [String], default: [] },
    channels: { type: [String], default: [] },
    outcome: {
      type: String,
      required: true,
      enum: ['sent', 'throttled', 'quiet_hours', 'no_recipients', 'test'],
      index: true,
    },
    detail: { type: String, default: '' },
  },
  { versionKey: false },
);

logSchema.plugin(baseSchemaPlugin);
// The throttle asks "when did this rule last reach this person" on every event.
logSchema.index({ ruleId: 1, at: -1 });

export const NotificationRuleLog = model<NotificationRuleLogDoc>('NotificationRuleLog', logSchema);
