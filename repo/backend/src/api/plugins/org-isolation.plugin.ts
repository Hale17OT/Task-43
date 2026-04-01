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

  // Use onResponse to commit — fires AFTER the reply is fully sent,
  // avoiding ERR_HTTP_HEADERS_SENT when preHandlers throw errors.
  // The tradeoff is a small window where committed data from this request
  // may not be visible to the next request from the same client.
  // For login, we handle this by having the frontend retry on 401.
  app.addHook('onResponse', async (request: FastifyRequest) => {
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
