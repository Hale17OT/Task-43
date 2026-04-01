import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../plugins/authorize.plugin.js';

export default async function adminRoutes(app: FastifyInstance) {
  // GET /api/admin/system-status
  app.get('/api/admin/system-status', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const config = await db('system_config').where({ key: 'encryption_key_backup_confirmed' }).first();
    return {
      keyBackupConfirmed: config?.value?.confirmed ?? false,
    };
  });

  // POST /api/admin/confirm-key-backup
  app.post('/api/admin/confirm-key-backup', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const db = request.db;


    await db('system_config').where({ key: 'encryption_key_backup_confirmed' }).update({
      value: JSON.stringify({
        confirmed: true,
        confirmed_by: request.user.userId,
        confirmed_at: new Date().toISOString(),
      }),
      updated_at: new Date(),
    });

    return { success: true, message: 'Encryption key backup confirmed' };
  });

  // GET /api/admin/audit-log (super_admin only)
  app.get('/api/admin/audit-log', {
    preHandler: [app.authenticate, authorize('super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const query = request.query as Record<string, string>;
    const page = parseInt(query.page ?? '1');
    const limit = parseInt(query.limit ?? '50');

    let q = db('audit_log');
    if (query.entityType) q = q.where({ entity_type: query.entityType });
    if (query.userId) q = q.where({ user_id: query.userId });

    const countResult = await q.clone().count('id as count').first();
    const rows = await q.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);
    return { data: rows, total: Number(countResult?.count ?? 0) };
  });
}
