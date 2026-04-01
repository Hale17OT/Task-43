import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getKnex } from '../../infrastructure/database/connection.js';
import { logger } from '../../infrastructure/logging/index.js';

export default fp(async (app: FastifyInstance) => {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

    try {
      const db = getKnex();

      // Audit writes run after the per-request transaction is committed,
      // so we use an independent transaction with RLS bypass to insert
      // into the audit_log table (which has super_admin-only RLS policy).
      await db.transaction(async (trx) => {
        await trx.raw("SET LOCAL app.bypass_rls = 'true'");

        const userId = (request as any).user?.userId ?? null;
        const urlParts = request.url.split('/').filter(Boolean);
        const entityType = urlParts[1] ?? 'unknown';
        const entityId = urlParts[2] ?? null;

        await trx('audit_log').insert({
          user_id: userId,
          action: `${method} ${request.url}`,
          entity_type: entityType,
          entity_id: entityId && entityId.match(/^[0-9a-f-]{36}$/) ? entityId : null,
          old_state: (request as any)._auditOldState ?? null,
          new_state: (request as any)._auditNewState ?? null,
          ip_address: request.ip,
        });
      });
    } catch (err) {
      logger.error({ err }, 'Failed to write audit log');
    }
  });
}, { name: 'audit' });
