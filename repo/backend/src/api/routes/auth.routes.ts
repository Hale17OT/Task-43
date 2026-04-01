import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loginSchema } from '../schemas/auth.js';
import { LoginUseCase, AuthError } from '../../application/auth/login-use-case.js';
import { LogoutUseCase } from '../../application/auth/logout-use-case.js';
import { KnexUserRepository } from '../../infrastructure/database/repositories/user-repository.js';
import { KnexSessionRepository } from '../../infrastructure/database/repositories/session-repository.js';
import { logger } from '../../infrastructure/logging/index.js';

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const db = request.db;
    // Explicitly enable bypass for auth operations (login is unauthenticated,
    // so the default bypass=false from org-isolation must be overridden here).
    await db.raw("SET LOCAL app.bypass_rls = 'true'");


    const userRepo = new KnexUserRepository(db);
    const sessionRepo = new KnexSessionRepository(db);
    const loginUseCase = new LoginUseCase(userRepo, sessionRepo);

    try {
      const result = await loginUseCase.execute({
        username: parsed.data.username,
        password: parsed.data.password,
        ipAddress: request.ip,
        workstationId: request.headers['x-workstation-id'] as string | undefined,
      });

      // Sign JWT
      const token = app.jwt.sign({
        userId: result.user.id,
        orgId: result.user.orgId,
        role: result.user.role,
        nonce: result.sessionNonce,
        jti: result.jti,
      });

      logger.info({ userId: result.user.id, role: result.user.role }, 'Login successful');

      // Commit the transaction eagerly so the session is visible to
      // subsequent requests before the HTTP response reaches the client.
      try { await db.commit(); request._dbCommitted = true; } catch { /* already committed */ }

      return reply.status(200).send({
        token,
        user: result.user,
        menuPermissions: result.menuPermissions,
        serverTime: result.serverTime,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        logger.warn({ username: '[REDACTED]', statusCode: err.statusCode }, 'Login failed');
        const response: Record<string, unknown> = {
          error: err.statusCode === 423 ? 'LOCKED' : 'UNAUTHORIZED',
          message: err.message,
        };
        if ((err as any).retryAfterSeconds) {
          response.retryAfterSeconds = (err as any).retryAfterSeconds;
        }
        return reply.status(err.statusCode).send(response);
      }
      throw err;
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const db = request.db;

    const sessionRepo = new KnexSessionRepository(db);
    const logoutUseCase = new LogoutUseCase(sessionRepo);

    await logoutUseCase.execute(request.user.userId);
    logger.info({ userId: request.user.userId }, 'Logout');

    return reply.status(204).send();
  });

  // GET /api/auth/me
  app.get('/api/auth/me', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const db = request.db;

    const userRepo = new KnexUserRepository(db);
    const user = await userRepo.findById(request.user.userId);

    if (!user) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    }

    return {
      user: {
        id: user.id,
        orgId: user.orgId,
        username: user.username,
        role: user.role,
        creditScore: user.creditScore,
        isActive: user.isActive,
        dailyCapacity: user.dailyCapacity,
      },
      permissions: getPermissionsForRole(user.role),
    };
  });
}

function getPermissionsForRole(role: string): string[] {
  const perms: Record<string, string[]> = {
    client: ['client.dashboard', 'client.bookings', 'client.credit', 'reviews', 'notifications'],
    lawyer: ['lawyer.dashboard', 'lawyer.availability', 'lawyer.bookings', 'reviews', 'notifications'],
    admin: ['admin.dashboard', 'admin.jobs', 'admin.arbitration', 'admin.users', 'admin.config', 'reports', 'reports.subscriptions', 'notifications'],
    super_admin: ['admin.dashboard', 'admin.jobs', 'admin.arbitration', 'admin.users', 'admin.organizations', 'admin.config', 'reports', 'reports.subscriptions', 'notifications'],
  };
  return perms[role] ?? [];
}
