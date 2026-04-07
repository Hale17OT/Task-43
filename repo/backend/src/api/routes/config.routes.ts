import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../plugins/authorize.plugin.js';

const updateDictionarySchema = z.object({
  value: z.record(z.unknown()),
});

const createDictionarySchema = z.object({
  category: z.string().min(1),
  key: z.string().min(1),
  value: z.record(z.unknown()),
});

const createWorkflowStepSchema = z.object({
  workflowType: z.string().min(1),
  stepOrder: z.number().int().min(0),
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
});

const updateWorkflowStepSchema = z.object({
  stepOrder: z.number().int().min(0).optional(),
  name: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
});

export default async function configRoutes(app: FastifyInstance) {
  // ---- Config Dictionaries ----

  // GET /api/config/dictionaries
  app.get('/api/config/dictionaries', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;
    const { orgId, role } = request.user;
    const query = request.query as Record<string, string>;

    let q = db('config_dictionaries');
    if (role !== 'super_admin') {
      // Org-scoped admins see global (org_id IS NULL) + own org entries
      q = q.where(function () {
        this.whereNull('org_id').orWhere({ org_id: orgId });
      });
    }
    if (query.category) q = q.where({ category: query.category });

    const rows = await q.orderBy('category').orderBy('key');
    return { data: rows };
  });

  // POST /api/config/dictionaries
  app.post('/api/config/dictionaries', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createDictionarySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;
    const { orgId, role } = request.user;
    const targetOrgId = role === 'super_admin' ? null : orgId;

    const [entry] = await db('config_dictionaries').insert({
      org_id: targetOrgId,
      category: parsed.data.category,
      key: parsed.data.key,
      value: JSON.stringify(parsed.data.value),
    }).returning('*');

    return reply.status(201).send({ entry });
  });

  // PATCH /api/config/dictionaries/:id
  app.patch('/api/config/dictionaries/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateDictionarySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;
    const { orgId, role } = request.user;

    let q = db('config_dictionaries').where({ id });
    if (role !== 'super_admin') {
      // Org-scoped admins can only update their own org's entries, not globals
      q = q.where({ org_id: orgId });
    }

    const [entry] = await q.update({ value: JSON.stringify(parsed.data.value) }).returning('*');
    if (!entry) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Dictionary entry not found' });
    }
    return { entry };
  });

  // DELETE /api/config/dictionaries/:id
  app.delete('/api/config/dictionaries/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;
    const { orgId, role } = request.user;

    let q = db('config_dictionaries').where({ id });
    if (role !== 'super_admin') {
      q = q.where({ org_id: orgId });
    }

    const count = await q.del();
    if (count === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Dictionary entry not found' });
    }
    return reply.status(204).send();
  });

  // ---- Workflow Steps ----

  // GET /api/config/workflow-steps
  app.get('/api/config/workflow-steps', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;
    const { orgId, role } = request.user;
    const query = request.query as Record<string, string>;

    let q = db('workflow_steps');
    if (role !== 'super_admin') {
      q = q.where(function () {
        this.whereNull('org_id').orWhere({ org_id: orgId });
      });
    }
    if (query.workflowType) q = q.where({ workflow_type: query.workflowType });

    const rows = await q.orderBy('workflow_type').orderBy('step_order');
    return { data: rows };
  });

  // POST /api/config/workflow-steps
  app.post('/api/config/workflow-steps', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createWorkflowStepSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;
    const { orgId, role } = request.user;

    const [step] = await db('workflow_steps').insert({
      org_id: role === 'super_admin' ? null : orgId,
      workflow_type: parsed.data.workflowType,
      step_order: parsed.data.stepOrder,
      name: parsed.data.name,
      config: JSON.stringify(parsed.data.config ?? {}),
    }).returning('*');

    return reply.status(201).send({ step });
  });

  // PATCH /api/config/workflow-steps/:id
  app.patch('/api/config/workflow-steps/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateWorkflowStepSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;
    const { orgId, role } = request.user;

    const updates: Record<string, any> = {};
    if (parsed.data.stepOrder !== undefined) updates.step_order = parsed.data.stepOrder;
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.config !== undefined) updates.config = JSON.stringify(parsed.data.config);

    let q = db('workflow_steps').where({ id });
    if (role !== 'super_admin') {
      q = q.where({ org_id: orgId });
    }

    const [step] = await q.update(updates).returning('*');
    if (!step) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Workflow step not found' });
    }
    return { step };
  });

  // DELETE /api/config/workflow-steps/:id
  app.delete('/api/config/workflow-steps/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;
    const { orgId, role } = request.user;

    let q = db('workflow_steps').where({ id });
    if (role !== 'super_admin') {
      q = q.where({ org_id: orgId });
    }

    const count = await q.del();
    if (count === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Workflow step not found' });
    }
    return reply.status(204).send();
  });
}
