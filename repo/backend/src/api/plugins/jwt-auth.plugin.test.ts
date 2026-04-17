import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';

/**
 * Direct coverage of the JWT/auth decorator contract.
 *
 * The production plugin lives at src/api/plugins/jwt-auth.plugin.ts.
 * We can't register the real plugin in isolation because it depends on
 * a live Knex transaction, but the test harness mirrors the plugin
 * 1:1 (same decorator, same session-nonce validation, same RLS
 * context setup). The purpose of these tests is to lock down the
 * *contract surface* the plugin exposes so route tests can depend on
 * it safely.
 */

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const USER_1 = 'u0000000-0000-0000-0000-000000000001';

async function noopRoute(app: FastifyInstance) {
  app.get('/probe', { preHandler: [app.authenticate] }, async (request) => {
    // Echo the context the plugin put on request.user so tests can
    // assert on JWT payload decoding.
    return { ok: true, user: request.user };
  });
}

describe('jwt-auth plugin — contract of app.authenticate', () => {
  let app: FastifyInstance;
  const mockData: MockDbData = { user_sessions: [] };
  let validToken: string;

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [noopRoute] });
    validToken = signTestToken(app, mockData, { userId: USER_1, orgId: ORG_1, role: 'admin' });
  });

  afterAll(async () => { await app.close(); });

  it('exposes an `authenticate` decorator as a function', () => {
    expect(typeof app.authenticate).toBe('function');
  });

  it('rejects a request with no Authorization header with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed Bearer token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: 'Bearer definitely.not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unsigned / tampered JWT with 401', async () => {
    // Header.Payload.Signature with an empty signature
    const tampered = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1IiwiaWF0IjoxfQ.';
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: `Bearer ${tampered}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid token and places userId/orgId/role/nonce on request.user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user.userId).toBe(USER_1);
    expect(body.user.orgId).toBe(ORG_1);
    expect(body.user.role).toBe('admin');
    expect(typeof body.user.nonce).toBe('string');
  });

  it('rejects a token whose session has been revoked (nonce mismatch) with 401', async () => {
    // Sign a fresh token for an isolated user/nonce, then clear its session row
    // so the plugin\'s nonce check fails.
    const localData: MockDbData = { user_sessions: [] };
    const localApp = await buildTestApp({ mockData: localData, routes: [noopRoute] });
    const token = signTestToken(localApp, localData, {
      userId: 'u-revoked', orgId: ORG_1, role: 'admin',
    });

    // Drop the session row — simulating a subsequent login that revoked it.
    localData['user_sessions']!.length = 0;

    const res = await localApp.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    await localApp.close();
  });
});
