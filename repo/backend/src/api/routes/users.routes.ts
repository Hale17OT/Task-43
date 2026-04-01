import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { authorize } from '../plugins/authorize.plugin.js';
import { createUserSchema } from '../schemas/auth.js';
import { KnexUserRepository } from '../../infrastructure/database/repositories/user-repository.js';
import { Password } from '../../domain/value-objects/password.js';

function sanitizeUser(user: any) {
  return {
    id: user.id,
    orgId: user.orgId,
    username: user.username,
    role: user.role,
    creditScore: user.creditScore,
    isActive: user.isActive,
    isSessionExempt: user.isSessionExempt,
    dailyCapacity: user.dailyCapacity,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export default async function userRoutes(app: FastifyInstance) {
  // GET /api/users
  app.get('/api/users', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const db = request.db;

    const userRepo = new KnexUserRepository(db);
    const { orgId, role } = request.user;

    const query = request.query as Record<string, string>;
    const targetOrgId = role === 'super_admin' && query.orgId ? query.orgId : orgId;

    const result = await userRepo.findByOrgId(targetOrgId, {
      role: query.role,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    });

    return { data: result.data.map(sanitizeUser), total: result.total };
  });

  // POST /api/users
  app.post('/api/users', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    // Only super_admin can create super_admin users
    if (parsed.data.role === 'super_admin' && request.user.role !== 'super_admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Only super administrators can create super_admin users',
      });
    }

    // Org-scoped admins can only create users in their own org
    if (request.user.role === 'admin' && parsed.data.orgId !== request.user.orgId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Administrators can only create users within their own organization',
      });
    }

    const { valid, errors } = Password.validate(parsed.data.password);
    if (!valid) {
      return reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Password does not meet requirements',
        details: errors,
      });
    }

    const db = request.db;

    const userRepo = new KnexUserRepository(db);

    const existing = await userRepo.findByUsername(parsed.data.username);
    if (existing) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: 'Username already exists',
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await userRepo.create({
      orgId: parsed.data.orgId,
      username: parsed.data.username,
      passwordHash,
      role: parsed.data.role,
      dailyCapacity: parsed.data.dailyCapacity,
      isSessionExempt: parsed.data.isSessionExempt,
    });

    return reply.status(201).send({
      user: {
        id: user.id,
        orgId: user.orgId,
        username: user.username,
        role: user.role,
        creditScore: user.creditScore,
        isActive: user.isActive,
      },
    });
  });

  // PATCH /api/users/:id
  app.patch('/api/users/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const db = request.db;

    const userRepo = new KnexUserRepository(db);

    const user = await userRepo.findById(id);
    if (!user) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    }

    // Org-scoped admins can only modify users in their org
    if (request.user.role === 'admin' && user.orgId !== request.user.orgId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    }

    // Only super_admin can promote/assign super_admin role
    if (body.role === 'super_admin' && request.user.role !== 'super_admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Only super administrators can assign super_admin role',
      });
    }

    // Admin cannot modify existing super_admin users
    if (user.role === 'super_admin' && request.user.role !== 'super_admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Only super administrators can modify super_admin users',
      });
    }

    const updated = await userRepo.update(id, {
      isActive: body.isActive,
      isSessionExempt: body.isSessionExempt,
      role: body.role,
      dailyCapacity: body.dailyCapacity,
    });

    return { user: updated ? sanitizeUser(updated) : null };
  });

  // DELETE /api/users/:id
  app.delete('/api/users/:id', {
    preHandler: [app.authenticate, authorize('super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const userRepo = new KnexUserRepository(db);

    const deleted = await userRepo.delete(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    }
    return reply.status(204).send();
  });
}
