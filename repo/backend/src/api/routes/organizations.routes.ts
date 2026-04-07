import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../plugins/authorize.plugin.js';
import { safePagination } from '../schemas/pagination.js';

const createOrgSchema = z.object({
  name: z.string().min(2).max(200),
  settings: z.record(z.unknown()).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  settings: z.record(z.unknown()).optional(),
}).strict();

export default async function organizationRoutes(app: FastifyInstance) {
  // GET /api/organizations
  app.get('/api/organizations', {
    preHandler: [app.authenticate, authorize('super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const query = request.query as Record<string, string>;
    const { page, limit } = safePagination(query);

    const countResult = await db('organizations').count('id as count').first();
    const rows = await db('organizations').orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);

    return { data: rows, total: Number(countResult?.count ?? 0) };
  });

  // POST /api/organizations
  app.post('/api/organizations', {
    preHandler: [app.authenticate, authorize('super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;


    const existing = await db('organizations').where({ name: parsed.data.name }).first();
    if (existing) {
      return reply.status(409).send({ error: 'CONFLICT', message: 'Organization name already exists' });
    }

    const [org] = await db('organizations').insert({
      name: parsed.data.name,
      settings: JSON.stringify(parsed.data.settings ?? {}),
    }).returning('*');

    return reply.status(201).send({ organization: org });
  });

  // PATCH /api/organizations/:id
  app.patch('/api/organizations/:id', {
    preHandler: [app.authenticate, authorize('super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const body = parsed.data;
    const db = request.db;

    const [org] = await db('organizations').where({ id }).update({
      name: body.name,
      settings: body.settings ? JSON.stringify(body.settings) : undefined,
      updated_at: new Date(),
    }).returning('*');

    if (!org) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organization not found' });
    }
    return { organization: org };
  });
}
