import { Knex } from 'knex';
import { createHmac } from 'crypto';
import { decrypt } from '../encryption/index.js';
import { logger } from '../logging/index.js';
import { assertWebhookUrlSafe } from './url-validator.js';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 1000;
const DELIVERY_TIMEOUT_MS = 10000;

interface WebhookConfig {
  id: string;
  org_id: string;
  url: string;
  events: string[] | string;
  secret: string;
  is_active: boolean;
}

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function deliverWithRetry(url: string, body: string, signature: string): Promise<{ status: number; ok: boolean }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    try {
      // Re-validate URL at delivery time to prevent DNS rebinding (TOCTOU)
      await assertWebhookUrlSafe(url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': new Date().toISOString(),
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok || response.status < 500) {
        return { status: response.status, ok: response.ok };
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('Webhook delivery failed');
}

export class WebhookDispatcher {
  constructor(private db: Knex) {}

  async dispatch(orgId: string, event: string, data: Record<string, unknown>): Promise<void> {
    const configs = await this.db('webhook_configs')
      .where({ org_id: orgId, is_active: true });

    const matchingWebhooks = configs.filter((cfg: WebhookConfig) => {
      const events = typeof cfg.events === 'string' ? JSON.parse(cfg.events) : cfg.events;
      return events.includes(event) || events.includes('*');
    });

    if (matchingWebhooks.length === 0) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    for (const webhook of matchingWebhooks) {
      let secret: string;
      try {
        secret = decrypt(webhook.secret);
      } catch {
        secret = webhook.secret;
      }

      const signature = signPayload(body, secret);

      try {
        const result = await deliverWithRetry(webhook.url, body, signature);
        logger.info({
          webhookId: webhook.id,
          event,
          url: webhook.url,
          status: result.status,
        }, 'Webhook delivered');
      } catch (err: any) {
        logger.error({
          webhookId: webhook.id,
          event,
          url: webhook.url,
          error: err.message,
        }, 'Webhook delivery failed after retries');

        // Record failure for monitoring
        try {
          await this.db('audit_log').insert({
            user_id: null,
            action: 'WEBHOOK_DELIVERY_FAILED',
            entity_type: 'webhook',
            entity_id: webhook.id,
            old_state: null,
            new_state: JSON.stringify({
              event,
              url: webhook.url,
              error: err.message,
              retriesExhausted: true,
            }),
            ip_address: null,
          });
        } catch (auditErr) {
          logger.error({ auditErr }, 'Failed to audit webhook failure');
        }
      }
    }
  }
}
