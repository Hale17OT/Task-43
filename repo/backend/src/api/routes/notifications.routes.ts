import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { KnexNotificationRepository } from '../../infrastructure/database/repositories/notification-repository.js';
import { safePagination } from '../schemas/pagination.js';

export default async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications
  app.get('/api/notifications', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const repo = new KnexNotificationRepository(db);
    const query = request.query as Record<string, string>;

    return repo.findByUserId(request.user.userId, {
      unread: query.unread === 'true',
      ...safePagination(query),
    });
  });

  // PATCH /api/notifications/:id/read
  app.patch('/api/notifications/:id/read', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const repo = new KnexNotificationRepository(db);

    const notification = await repo.markRead(id, request.user.userId);
    if (!notification) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Notification not found' });
    }
    return { notification };
  });

  // PATCH /api/notifications/read-all
  app.patch('/api/notifications/read-all', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const db = request.db;

    const repo = new KnexNotificationRepository(db);
    await repo.markAllRead(request.user.userId);
    return reply.status(204).send();
  });
}
