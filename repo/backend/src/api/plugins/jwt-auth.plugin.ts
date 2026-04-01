import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { KnexSessionRepository } from '../../infrastructure/database/repositories/session-repository.js';
import { logger } from '../../infrastructure/logging/index.js';
import { loadConfig } from '../../config/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      orgId: string;
      role: string;
      nonce: string;
      jti: string;
    };
    user: {
      userId: string;
      orgId: string;
      role: string;
      nonce: string;
      jti: string;
    };
  }
}

export default fp(async (app: FastifyInstance) => {
  const config = loadConfig();
  const secret = config.jwt.secret;

  const jwt = await import('@fastify/jwt');
  await app.register(jwt.default, {
    secret,
    sign: { expiresIn: '24h' },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      // Throw a proper Fastify error so onSend/onError hooks work correctly.
      const err = new Error('Invalid or expired token');
      (err as any).statusCode = 401;
      throw err;
    }

    const { userId, orgId, role, nonce } = request.user;

    // Temporarily enable bypass for session nonce lookup only.
    await request.db.raw("SET LOCAL app.bypass_rls = 'true'");
    const sessionRepo = new KnexSessionRepository(request.db);
    const session = await sessionRepo.findByUserIdAndNonce(userId, nonce);
    // Immediately re-disable bypass after auth query
    await request.db.raw("SET LOCAL app.bypass_rls = 'false'");

    if (!session) {
      logger.warn({ userId }, 'Session nonce invalid — session revoked by new login');
      const err = new Error('Session expired or revoked. Please log in again.');
      (err as any).statusCode = 401;
      throw err;
    }

    // Set RLS org-isolation context on the per-request transaction.
    // Values come from the verified JWT payload (server-signed), not user input.
    // SET LOCAL does not support parameterized queries, so we use set_config().
    if (role === 'super_admin') {
      await request.db.raw("SELECT set_config('app.current_org_id', '', true)");
    } else {
      await request.db.raw("SELECT set_config('app.current_org_id', ?, true)", [orgId]);
    }
    await request.db.raw("SELECT set_config('app.current_role', ?, true)", [role]);
    await request.db.raw("SELECT set_config('app.current_user_id', ?, true)", [userId]);
  });
}, { name: 'jwt-auth' });
