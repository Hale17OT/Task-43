import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../plugins/authorize.plugin.js';
import { encrypt } from '../../infrastructure/encryption/index.js';
import { assertWebhookUrlSafe } from '../../infrastructure/webhooks/url-validator.js';

const webhookUrlSchema = z.string().url().refine(
  async (url) => { try { await assertWebhookUrlSafe(url); return true; } catch { return false; } },
  { message: 'Webhook URL must use http(s). Cloud metadata endpoints and link-local range (169.254.0.0/16) are blocked.' },
);

const createWebhookSchema = z.object({
  url: webhookUrlSchema,
  events: z.array(z.string()),
  secret: z.string().min(8),
});

const updateWebhookSchema = z.object({
  url: webhookUrlSchema.optional(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  targetOrgId: z.string().uuid().optional(),
}).strict();

const rotateSecretSchema = z.object({
  secret: z.string().min(8),
});

function maskSecret(encrypted: string): string {
  return '••••••••';
}

function sanitizeWebhook(row: any) {
  return {
    id: row.id,
    org_id: row.org_id,
    url: row.url,
    events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events,
    secret: maskSecret(row.secret),
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

/**
 * Resolve the effective org ID for webhook operations.
 * Super-admins may pass a targetOrgId to manage webhooks for any org.
 * Regular admins are always scoped to their own org.
 */
function resolveOrgId(request: FastifyRequest): string {
  const { role, orgId } = request.user;
  if (role === 'super_admin') {
    const query = request.query as Record<string, string>;
    const body = request.body as Record<string, string> | undefined;
    return query?.targetOrgId ?? body?.targetOrgId ?? orgId;
  }
  return orgId;
}

export default async function webhookRoutes(app: FastifyInstance) {
  // GET /api/webhooks — returns masked secrets
  app.get('/api/webhooks', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;
    const effectiveOrgId = resolveOrgId(request);
    const rows = await db('webhook_configs').where({ org_id: effectiveOrgId });
    return { data: rows.map(sanitizeWebhook) };
  });

  // POST /api/webhooks
  app.post('/api/webhooks', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = await createWebhookSchema.safeParseAsync(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const effectiveOrgId = resolveOrgId(request);

    const [webhook] = await db('webhook_configs').insert({
      org_id: effectiveOrgId,
      url: parsed.data.url,
      events: JSON.stringify(parsed.data.events),
      secret: encrypt(parsed.data.secret),
    }).returning('*');

    return reply.status(201).send({ webhook: sanitizeWebhook(webhook) });
  });

  // PATCH /api/webhooks/:id
  app.patch('/api/webhooks/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = await updateWebhookSchema.safeParseAsync(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const body = parsed.data;
    const db = request.db;

    const effectiveOrgId = resolveOrgId(request);

    const [webhook] = await db('webhook_configs')
      .where({ id, org_id: effectiveOrgId })
      .update({
        url: body.url,
        events: body.events ? JSON.stringify(body.events) : undefined,
        is_active: body.isActive,
      })
      .returning('*');

    if (!webhook) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Webhook not found' });
    }
    return { webhook: sanitizeWebhook(webhook) };
  });

  // POST /api/webhooks/:id/rotate-secret — replace secret without exposing current value
  app.post('/api/webhooks/:id/rotate-secret', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = rotateSecretSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const effectiveOrgId = resolveOrgId(request);

    const [webhook] = await db('webhook_configs')
      .where({ id, org_id: effectiveOrgId })
      .update({ secret: encrypt(parsed.data.secret) })
      .returning('*');

    if (!webhook) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Webhook not found' });
    }
    return { webhook: sanitizeWebhook(webhook), message: 'Secret rotated successfully' };
  });
}
