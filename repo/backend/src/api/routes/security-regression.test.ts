/**
 * Security regression tests ensuring protected routes fail closed
 * when authentication context is absent or misconfigured.
 *
 * These tests verify that:
 * 1. Protected data routes return 401 without auth tokens
 * 2. bypass_rls defaults to false (routes without auth cannot access RLS-protected data)
 * 3. Invalid/expired tokens are properly rejected
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import bookingRoutes from './bookings.routes.js';
import userRoutes from './users.routes.js';
import reviewRoutes from './reviews.routes.js';
import jobRoutes from './jobs.routes.js';
import reportRoutes from './reports.routes.js';
import notificationRoutes from './notifications.routes.js';
import creditRoutes from './credit.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';

describe('Security regression: unauthenticated access is denied', () => {
  let app: FastifyInstance;
  const mockData: MockDbData = {
    users: [],
    bookings: [],
    reviews: [],
    jobs: [],
    notifications: [],
    report_subscriptions: [],
    availability: [],
    disputes: [],
    idempotency_registry: [],
    rate_limit_buckets: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({
      mockData,
      routes: [bookingRoutes, userRoutes, reviewRoutes, jobRoutes, reportRoutes, notificationRoutes, creditRoutes],
    });
  });

  afterAll(async () => { await app.close(); });

  const protectedEndpoints = [
    { method: 'GET' as const, url: '/api/bookings' },
    { method: 'GET' as const, url: '/api/users' },
    { method: 'GET' as const, url: '/api/reviews' },
    { method: 'GET' as const, url: '/api/jobs' },
    { method: 'GET' as const, url: '/api/reports/dashboard' },
    { method: 'GET' as const, url: '/api/notifications' },
    { method: 'GET' as const, url: '/api/credit/some-user-id' },
    { method: 'GET' as const, url: '/api/report-subscriptions' },
    { method: 'POST' as const, url: '/api/bookings' },
    { method: 'POST' as const, url: '/api/users' },
    { method: 'POST' as const, url: '/api/reviews' },
    { method: 'POST' as const, url: '/api/disputes' },
  ];

  for (const endpoint of protectedEndpoints) {
    it(`${endpoint.method} ${endpoint.url} returns 401 without auth`, async () => {
      const res = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
      });
      expect(res.statusCode).toBe(401);
    });
  }

  it('rejects requests with invalid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bookings',
      headers: { authorization: 'Bearer invalid.token.here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with valid JWT but no matching session (revoked)', async () => {
    // Sign a token but do NOT seed a session for it
    const token = app.jwt.sign({
      userId: 'orphan-user',
      orgId: ORG_1,
      role: 'client',
      nonce: 'no-matching-session',
      jti: 'test-jti',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('Session expired or revoked');
  });
});

describe('Security regression: role boundaries enforced', () => {
  let app: FastifyInstance;
  let clientToken: string;
  let lawyerToken: string;

  const mockData: MockDbData = {
    users: [],
    bookings: [],
    reviews: [],
    jobs: [],
    notifications: [],
    report_subscriptions: [],
    availability: [],
    disputes: [],
    idempotency_registry: [],
    rate_limit_buckets: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({
      mockData,
      routes: [bookingRoutes, userRoutes, reviewRoutes, jobRoutes, reportRoutes, notificationRoutes],
    });
    clientToken = signTestToken(app, mockData, { userId: 'client-1', orgId: ORG_1, role: 'client' });
    lawyerToken = signTestToken(app, mockData, { userId: 'lawyer-1', orgId: ORG_1, role: 'lawyer' });
  });

  afterAll(async () => { await app.close(); });

  it('client cannot access admin user management (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('client cannot access job monitor (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('client cannot access reports dashboard (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/dashboard',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lawyer cannot access user management (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${lawyerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lawyer cannot create bookings (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${lawyerToken}` },
      payload: {
        lawyerId: 'lawyer-1',
        type: 'consultation',
        scheduledAt: new Date().toISOString(),
        idempotencyKey: 'test-key',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
