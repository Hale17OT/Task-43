/**
 * Test harness for Fastify route integration tests (mock-DB tier).
 *
 * Builds a real Fastify app with actual route handlers, a mock DB layer,
 * and an auth decorator that mirrors real behavior:
 *   - JWT signature + expiration verification (real @fastify/jwt)
 *   - Session nonce validation against mock user_sessions table
 *   - Org-isolation context setting (SET LOCAL calls on mock db.raw)
 *
 * WHAT THIS COVERS: route handler logic, authorization guards, input
 * validation, response sanitization, ownership checks, role transitions.
 *
 * WHAT THIS CANNOT COVER (requires real PostgreSQL):
 *   - Row-Level Security (RLS) policy enforcement at the database layer
 *   - Advisory lock contention under concurrent writes
 *   - Real transaction isolation and rollback behavior
 *
 * For those behaviors, see: src/api/routes/real-db-integration.test.ts
 * which runs against a live PostgreSQL instance when DATABASE_URL is set.
 */
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import { Knex } from 'knex';

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters!!';

/**
 * Creates a chainable mock that mimics Knex query builder behaviour.
 */
function createQueryChain(rows: any[]) {
  let filtered = [...rows];

  const chain: any = {
    where(arg: any, op?: any, val?: any) {
      if (typeof arg === 'function') {
        // where(function() { this.where(...).orWhere(...) }) — callback style
        arg.call(chain);
      } else if (typeof arg === 'object') {
        filtered = filtered.filter(r =>
          Object.entries(arg).every(([k, v]) => r[k] === v)
        );
      } else if (typeof arg === 'string' && val !== undefined) {
        // 3-arg: where(col, op, val)
        filtered = filtered.filter(r => {
          const rv = r[arg];
          if (op === '>') return rv > val;
          if (op === '>=') return rv >= val;
          if (op === '<') return rv < val;
          if (op === '<=') return rv <= val;
          if (op === '=') return rv === val;
          return rv === val;
        });
      } else if (typeof arg === 'string' && op !== undefined && val === undefined) {
        // 2-arg: where(col, val)
        filtered = filtered.filter(r => r[arg] === op);
      }
      return chain;
    },
    whereIn(col: string, values: any) {
      // values can be an array or a thenable (subquery chain)
      if (Array.isArray(values)) {
        filtered = filtered.filter(r => values.includes(r[col]));
      }
      // Subquery chains are not easily resolvable synchronously in mock;
      // skip filtering for subquery (rely on route-level tests, not DB behavior)
      return chain;
    },
    whereNull(col: string) {
      filtered = filtered.filter(r => r[col] == null);
      return chain;
    },
    orWhere(arg: any) {
      // Simplified mock — does not union results
      return chain;
    },
    whereNot(arg: any) {
      if (typeof arg === 'object') {
        filtered = filtered.filter(r =>
          !Object.entries(arg).every(([k, v]) => r[k] === v)
        );
      }
      return chain;
    },
    first() {
      return Promise.resolve(filtered[0] ?? null);
    },
    count(_col?: string) {
      return { first: () => Promise.resolve({ count: filtered.length }) };
    },
    orderBy() { return chain; },
    limit() { return chain; },
    offset() { return chain; },
    select() { return chain; },
    distinct() { return chain; },
    join() { return chain; },
    clone() { return createQueryChain([...filtered]); },
    insert(data: any) {
      const row = Array.isArray(data) ? data[0] : data;
      const newRow = { id: 'mock-id-' + Date.now(), ...row, created_at: new Date() };
      rows.push(newRow);
      return { returning: () => Promise.resolve([newRow]) };
    },
    update(data: any) {
      for (const row of filtered) {
        Object.assign(row, data);
      }
      return { returning: () => Promise.resolve(filtered) };
    },
    del() { return Promise.resolve(filtered.length); },
    increment() { return { returning: () => Promise.resolve(filtered) }; },
    then(resolve: any) { return Promise.resolve(filtered).then(resolve); },
  };

  return chain;
}

export interface MockDbData {
  [tableName: string]: any[];
}

/**
 * Creates a mock Knex-like transaction object backed by in-memory data.
 */
export function createMockDb(data: MockDbData = {}): Knex.Transaction {
  const db: any = (tableName: string) => {
    if (!data[tableName]) data[tableName] = [];
    return createQueryChain(data[tableName]);
  };
  db.raw = async (_sql: string, _params?: any[]) => ({ rows: [] });
  db.transaction = async (fn: (trx: any) => Promise<any>) => fn(db);
  return db as Knex.Transaction;
}

export interface TestUser {
  userId: string;
  orgId: string;
  role: string;
  nonce?: string;
}

/**
 * Builds a Fastify app with real route handlers and a mock DB layer.
 *
 * The auth decorator mirrors real production behavior:
 *   1. Verifies JWT signature and expiration
 *   2. Validates session nonce against mock user_sessions table
 *   3. Sets org-isolation RLS context variables (via mock db.raw)
 *
 * This means tests must seed user_sessions for authenticated requests
 * to succeed, or use the convenience `signTestToken` helper which
 * auto-seeds a matching session.
 */
export async function buildTestApp(options: {
  mockData?: MockDbData;
  routes: Array<(app: FastifyInstance) => Promise<void>>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const mockData = options.mockData ?? {};

  // Ensure session table exists in mock data
  if (!mockData['user_sessions']) mockData['user_sessions'] = [];

  await app.register(jwt, { secret: JWT_SECRET, sign: { expiresIn: '1h' } });

  // Auth decorator: mirrors real jwt-auth.plugin.ts behavior
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
      return;
    }

    // Validate session nonce against mock DB (same as real plugin)
    const { userId, orgId, role, nonce } = request.user;
    const session = await request.db('user_sessions')
      .where({ user_id: userId, session_nonce: nonce })
      .first();

    if (!session) {
      reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Session expired or revoked. Please log in again.',
      });
      return;
    }

    // Set org-isolation context (mirrors real jwt-auth.plugin.ts:60-67)
    if (role === 'super_admin') {
      await request.db.raw("SET LOCAL app.current_org_id = ''");
    } else {
      await request.db.raw('SET LOCAL app.current_org_id = ?', [orgId]);
    }
    await request.db.raw('SET LOCAL app.current_role = ?', [role]);
    await request.db.raw('SET LOCAL app.current_user_id = ?', [userId]);
    await request.db.raw("SET LOCAL app.bypass_rls = 'false'");
  });

  // Mock org-isolation: set request.db to mock transaction
  app.addHook('onRequest', async (request: any) => {
    request.db = createMockDb(mockData);
  });

  // Register real routes
  for (const route of options.routes) {
    await app.register(route);
  }

  await app.ready();
  return app;
}

/**
 * Sign a JWT for test use and auto-seed a matching session in mock data.
 */
export function signTestToken(app: FastifyInstance, mockData: MockDbData, user: TestUser): string {
  const nonce = user.nonce ?? `nonce-${user.userId}`;
  const token = app.jwt.sign({
    userId: user.userId,
    orgId: user.orgId,
    role: user.role,
    nonce,
    jti: `jti-${user.userId}`,
  });

  // Auto-seed a matching session so nonce validation passes
  if (mockData && mockData['user_sessions']) {
    // Avoid duplicates
    const exists = mockData['user_sessions'].some(
      (s: any) => s.user_id === user.userId && s.session_nonce === nonce
    );
    if (!exists) {
      mockData['user_sessions'].push({
        id: `session-${user.userId}`,
        user_id: user.userId,
        session_nonce: nonce,
        token_jti: `jti-${user.userId}`,
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date(),
      });
    }
  }

  return token;
}
