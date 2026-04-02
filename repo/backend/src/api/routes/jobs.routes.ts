import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authorize } from '../plugins/authorize.plugin.js';
import { KnexJobRepository } from '../../infrastructure/database/repositories/job-repository.js';
import { safePagination } from '../schemas/pagination.js';

function withLatency(job: any) {
  const latencyMs = job.startedAt && job.createdAt
    ? new Date(job.startedAt).getTime() - new Date(job.createdAt).getTime()
    : null;
  return { ...job, latencyMs };
}

export default async function jobRoutes(app: FastifyInstance) {
  // GET /api/jobs
  app.get('/api/jobs', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const repo = new KnexJobRepository(db);
    const query = request.query as Record<string, string>;
    const { role, orgId } = request.user;

    const result = await repo.findAll({
      status: query.status,
      type: query.type,
      orgId: role === 'super_admin' ? undefined : orgId,
      ...safePagination(query),
    });
    return { data: result.data.map(withLatency), total: result.total };
  });

  // GET /api/jobs/:id
  app.get('/api/jobs/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;
    const { role, orgId } = request.user;

    const repo = new KnexJobRepository(db);

    const job = await repo.findById(id);
    if (!job) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Job not found' });
    }

    // Org-scoped admins can only view jobs belonging to their org
    if (role !== 'super_admin' && job.orgId !== orgId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Job not found' });
    }

    return { job: withLatency(job) };
  });
}
