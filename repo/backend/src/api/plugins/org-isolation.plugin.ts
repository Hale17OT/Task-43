import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Knex } from 'knex';
import { getKnex } from '../../infrastructure/database/connection.js';

declare module 'fastify' {
  interface FastifyRequest {
    db: Knex.Transaction;
    _dbCommitted?: boolean;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const knex = getKnex();
    request.db = await knex.transaction();
    request._dbCommitted = false;
    await request.db.raw("SET LOCAL app.bypass_rls = 'false'");
  });

  // Use onSend to commit — fires AFTER serialization but BEFORE the response
  // is transmitted to the client. This ensures committed data is visible to
  // subsequent requests from the same client (no race window).
  app.addHook('onSend', async (request: FastifyRequest) => {
    if (request.db && !request._dbCommitted) {
      try {
        await request.db.commit();
        request._dbCommitted = true;
      } catch {
        // Transaction already completed
      }
    }
  });

  app.addHook('onError', async (request: FastifyRequest) => {
    if (request.db && !request._dbCommitted) {
      try {
        await request.db.rollback();
        request._dbCommitted = true;
      } catch {
        // Transaction already completed
      }
    }
  });
}, { name: 'org-isolation' });
