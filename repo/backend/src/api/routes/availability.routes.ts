import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../plugins/authorize.plugin.js';
import { createAvailabilitySchema, updateAvailabilitySchema } from '../schemas/availability.js';
import { KnexAvailabilityRepository } from '../../infrastructure/database/repositories/availability-repository.js';

export default async function availabilityRoutes(app: FastifyInstance) {
  // GET /api/lawyers — client-safe lawyer directory (org-scoped, minimal fields)
  app.get('/api/lawyers', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest) => {
    const db = request.db;
    const { orgId } = request.user;

    const lawyers = await db('users')
      .where({ org_id: orgId, role: 'lawyer', is_active: true })
      .select('id', 'username', 'daily_capacity')
      .orderBy('username');

    return {
      data: lawyers.map((l: any) => ({
        id: l.id,
        username: l.username,
        dailyCapacity: l.daily_capacity,
      })),
    };
  });

  // GET /api/availability
  app.get('/api/availability', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const repo = new KnexAvailabilityRepository(db);
    const query = request.query as Record<string, string>;
    const lawyerId = query.lawyerId;

    if (!lawyerId) {
      return { slots: [] };
    }

    const slots = await repo.findByLawyerId(lawyerId);
    return { slots };
  });

  // POST /api/availability
  app.post('/api/availability', {
    preHandler: [app.authenticate, authorize('lawyer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createAvailabilitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const repo = new KnexAvailabilityRepository(db);

    const overlap = await repo.checkOverlap(
      request.user.userId,
      parsed.data.dayOfWeek,
      parsed.data.startTime,
      parsed.data.endTime,
    );

    if (overlap) {
      return reply.status(409).send({ error: 'CONFLICT', message: 'Time slot overlaps with existing availability' });
    }

    const slot = await repo.create({
      lawyerId: request.user.userId,
      ...parsed.data,
    });

    return reply.status(201).send({ slot });
  });

  // PATCH /api/availability/:id
  app.patch('/api/availability/:id', {
    preHandler: [app.authenticate, authorize('lawyer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateAvailabilitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const repo = new KnexAvailabilityRepository(db);

    const existing = await repo.findById(id);
    if (!existing || existing.lawyerId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Availability slot not found' });
    }

    const slot = await repo.update(id, parsed.data);
    return { slot };
  });

  // DELETE /api/availability/:id
  app.delete('/api/availability/:id', {
    preHandler: [app.authenticate, authorize('lawyer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const repo = new KnexAvailabilityRepository(db);

    const existing = await repo.findById(id);
    if (!existing || existing.lawyerId !== request.user.userId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Availability slot not found' });
    }

    await repo.delete(id);
    return reply.status(204).send();
  });
}
