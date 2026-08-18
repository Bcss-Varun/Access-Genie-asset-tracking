import { Notification, Webhook, type NotificationDeliveryDoc, type NotificationDoc } from '../models/index.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

/**
 * Getting a notification *out of* the application.
 *
 * The notification service wrote a row and stopped. That row is an inbox entry,
 * and an inbox entry is not a delivery — but every caller treated it as one,
 * so the product's answer to "was the on-call engineer told?" was "we inserted
 * a document", which is not the same thing and fails in exactly the situation
 * it matters.
 *
 * The shape here is the one the brief asks for and the one that survives
 * contact with a real provider:
 *
 *   event → notify() → provider.send() → DeliveryResult → persisted status
 *
 * Every attempt is recorded against the notification with its channel, its
 * target, an attempt count and the provider's own error text. Nothing infers
 * success from the absence of an exception.
 *
 * ── On the two channels ─────────────────────────────────────────────────────
 *
 * **Webhook** is fully implemented, because the dependency already exists: the
 * `Webhook` collection holds URLs an administrator has registered, and posting
 * to a URL needs no credential this deployment lacks. Its `ok` and
 * `lastDelivery` fields were declared and never written; they are written here.
 *
 * **Email** is deliberately *not* faked. There is no SMTP host, no API key and
 * no sender identity configured anywhere in this deployment, and inventing a
 * transport that logs "sent" would reintroduce the exact defect this file
 * exists to remove. The channel is declared, reports `skipped` with the reason,
 * and has one clearly-marked place to add a transport. See `emailProvider`.
 */

/** What a provider returns. Never a bare boolean — a failure needs its reason. */
export interface DeliveryResult {
  status: 'sent' | 'failed' | 'skipped';
  target?: string;
  error?: string;
}

export interface DeliveryProvider {
  channel: NotificationDeliveryDoc['channel'];
  /** One notification, possibly several destinations. */
  send(notification: NotificationDoc): Promise<DeliveryResult[]>;
}

/** A delivery that hangs forever is a delivery that blocks the sweep behind it. */
const TIMEOUT_MS = 8_000;

// ─────────────────────────────────────────────────────────────────────────────
// Webhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST the notification to every enabled webhook subscribed to its category.
 *
 * `events` on a webhook is a list of category names, with `*` meaning
 * everything. A webhook that matches nothing is not an error and produces no
 * delivery row — it simply was not addressed by this event.
 */
export const webhookProvider: DeliveryProvider = {
  channel: 'webhook',

  async send(notification) {
    const hooks = await Webhook.find({ enabled: true }).lean();
    const matching = hooks.filter(
      (hook) =>
        hook.events.length === 0 ||
        hook.events.includes('*') ||
        hook.events.some((event) => event.toLowerCase() === notification.category.toLowerCase()),
    );

    if (matching.length === 0) return [];

    return Promise.all(
      matching.map(async (hook): Promise<DeliveryResult> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(hook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: notification._id,
              title: notification.title,
              body: notification.body,
              category: notification.category,
              at: notification.at,
            }),
            signal: controller.signal,
          });

          // A 2xx is the only thing that counts as delivered. A 500 from the
          // receiver is a failed delivery even though the request itself
          // "worked" — which is the distinction the old code had no way to make.
          const ok = response.ok;
          await Webhook.updateOne({ _id: hook._id }, { $set: { lastDelivery: new Date(), ok } });

          return ok
            ? { status: 'sent', target: hook.url }
            : { status: 'failed', target: hook.url, error: `HTTP ${response.status}` };
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : String(err);
          await Webhook.updateOne({ _id: hook._id }, { $set: { lastDelivery: new Date(), ok: false } });
          return { status: 'failed', target: hook.url, error: reason };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Email delivery.
 *
 * **Unimplemented on purpose.** Adding a transport needs three things this
 * deployment does not have: a host or API key, a verified sender identity, and
 * a decision about who owns bounces. Writing a `logger.info('email sent')` in
 * their place would make every caller believe mail was going out.
 *
 * To enable: add the credentials to `config/env.ts`, install a transport, and
 * replace the body of `deliver` below. Everything around it — the status
 * record, the retry count, the failure text, the caller contract — already
 * works and needs no change.
 */
export const emailProvider: DeliveryProvider = {
  channel: 'email',

  async send(notification) {
    const configured = Boolean(env.SMTP_URL);
    if (!configured) {
      return [
        {
          status: 'skipped',
          error: 'No mail transport is configured (set SMTP_URL). The in-app notification was still recorded.',
        },
      ];
    }

    // Reached only once SMTP_URL is set, at which point a transport belongs
    // here. Left as an explicit failure rather than a silent success so an
    // operator who configures the variable and nothing else finds out at once.
    logger.error('SMTP_URL is set but no mail transport is installed', { notification: notification._id });
    return [{ status: 'failed', error: 'SMTP_URL is configured but no transport is installed' }];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS: DeliveryProvider[] = [webhookProvider, emailProvider];

/**
 * Deliver a stored notification and record what happened to it.
 *
 * Never throws. A delivery failure is a fact to be written down, not a reason
 * to fail the work order that raised the alert — but it *is* written down, so
 * "did it go out?" has an answer other than a guess.
 */
export async function deliverNotification(notification: NotificationDoc): Promise<NotificationDeliveryDoc[]> {
  const now = new Date();
  const rows: NotificationDeliveryDoc[] = [];

  for (const provider of PROVIDERS) {
    let results: DeliveryResult[];
    try {
      results = await provider.send(notification);
    } catch (err: unknown) {
      // A provider that throws is itself a failed delivery, not an outage of
      // the whole dispatch.
      results = [{ status: 'failed', error: err instanceof Error ? err.message : String(err) }];
    }

    for (const result of results) {
      rows.push({
        channel: provider.channel,
        status: result.status,
        target: result.target,
        attempts: 1,
        lastAttemptAt: now,
        error: result.error,
      });
    }
  }

  if (rows.length > 0) {
    await Notification.updateOne({ _id: notification._id }, { $set: { delivery: rows } });

    const failed = rows.filter((r) => r.status === 'failed');
    if (failed.length > 0) {
      logger.warn('Notification delivery failed', {
        notification: notification._id,
        failures: failed.map((f) => ({ channel: f.channel, target: f.target, error: f.error })),
      });
    }
  }

  return rows;
}
