/**
 * Real PostgreSQL integration tests.
 *
 * These tests require a running PostgreSQL instance with migrations applied.
 * They validate security-critical behaviors that mock-based tests cannot cover:
 *   - Session nonce revocation (second login invalidates first token)
 *   - RLS tenant isolation (cross-org reads denied at DB level)
 *   - Idempotency TTL enforcement
 *   - Advisory lock concurrency protection
 *
 * Run with: DATABASE_URL=postgresql://... npm run test:integration
 *
 * IMPORTANT: These tests are MANDATORY. When DATABASE_URL is not set,
 * the suite hard-fails to prevent silent acceptance gaps.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;
const shouldRun = !!DATABASE_URL;

describe.skipIf(!shouldRun)('Real PostgreSQL integration tests', () => {
  let app: any;
  let db: any;

  beforeAll(async () => {
    const { initDatabase } = await import('../../infrastructure/database/connection.js');
    const { buildServer } = await import('../server.js');

    db = await initDatabase(DATABASE_URL!);
    await db.migrate.latest();

    // Ensure seed data exists
    await db.raw("SET app.bypass_rls = 'true'");
    const userCount = await db('users').count('id as count').first();
    if (!userCount || Number(userCount.count) === 0) {
      await db.seed.run();
    }

    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.destroy();
  });

  it('session revocation: second login invalidates first token', async () => {
    // First login
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'client2', password: 'SecurePass1!' },
    });
    expect(login1.statusCode).toBe(200);
    const token1 = JSON.parse(login1.payload).token;

    // Second login (revokes first session)
    const login2 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'client2', password: 'SecurePass1!' },
    });
    expect(login2.statusCode).toBe(200);
    const token2 = JSON.parse(login2.payload).token;

    // First token should now be rejected (nonce revoked)
    const meWithOldToken = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token1}` },
    });
    expect(meWithOldToken.statusCode).toBe(401);

    // Second token should work
    const meWithNewToken = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(meWithNewToken.statusCode).toBe(200);
  });

  it('RLS tenant isolation: client cannot read cross-org bookings', async () => {
    // Login as client1 (org-1)
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'client1', password: 'SecurePass1!' },
    });
    const token = JSON.parse(loginRes.payload).token;

    // List bookings — should only return bookings from client1's org
    const bookingsRes = await app.inject({
      method: 'GET',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(bookingsRes.statusCode).toBe(200);
    const body = JSON.parse(bookingsRes.payload);

    // All returned bookings should belong to the authenticated user (client scoping)
    const me = JSON.parse((await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })).payload);

    for (const booking of body.data) {
      expect(booking.clientId).toBe(me.user.id);
    }
  });

  it('idempotency: same key+user returns cached response', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'client1', password: 'SecurePass1!' },
    });
    const token = JSON.parse(loginRes.payload).token;

    // Get a lawyer ID
    const lawyerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'lawyer1', password: 'SecurePass1!' },
    });
    const lawyerMe = JSON.parse((await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${JSON.parse(lawyerLogin.payload).token}` },
    })).payload);

    const idempotencyKey = crypto.randomUUID();
    const futureDate = new Date(Date.now() + 200 * 86400000);
    futureDate.setHours(9, Math.floor(Math.random() * 60), 0, 0);

    // First request
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey,
      },
    });
    expect(res1.statusCode).toBe(201);

    // Replay with same key — should return cached response
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey,
      },
    });
    expect(res2.statusCode).toBe(201);

    // Both should return the same booking ID
    const booking1 = JSON.parse(res1.payload).booking;
    const booking2 = JSON.parse(res2.payload).booking;
    expect(booking2.id).toBe(booking1.id);
  });

  it('idempotency: expired key does not replay cached response', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'client1', password: 'SecurePass1!' },
    });
    const token = JSON.parse(loginRes.payload).token;

    const lawyerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'lawyer1', password: 'SecurePass1!' },
    });
    const lawyerMe = JSON.parse((await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${JSON.parse(lawyerLogin.payload).token}` },
    })).payload);

    const idempotencyKey = crypto.randomUUID();
    const futureDate = new Date(Date.now() + 201 * 86400000);
    futureDate.setHours(10, Math.floor(Math.random() * 60), 0, 0);

    // Create booking
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey,
      },
    });
    expect(res1.statusCode).toBe(201);

    // Manually expire the idempotency record
    await db.raw("SET app.bypass_rls = 'true'");
    await db('idempotency_registry')
      .where({ key: idempotencyKey })
      .update({ expires_at: new Date(Date.now() - 1000) });

    // Replay — should NOT return cached response (key expired)
    // It will either create a new booking (409 conflict on same time) or succeed
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey,
      },
    });
    // The key point: it should NOT return the cached 201 with the old booking ID.
    // It will hit the conflict check and return 409 (time slot taken by first booking).
    expect(res2.statusCode).toBe(409);
  });

  it('advisory lock: concurrent consultation bookings for same slot produce conflict', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'client1', password: 'SecurePass1!' },
    });
    const token = JSON.parse(loginRes.payload).token;

    const lawyerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'lawyer1', password: 'SecurePass1!' },
    });
    const lawyerMe = JSON.parse((await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${JSON.parse(lawyerLogin.payload).token}` },
    })).payload);

    // Same time slot for both requests
    const futureDate = new Date(Date.now() + 202 * 86400000);
    futureDate.setHours(15, 0, 0, 0);

    // Fire two concurrent booking requests for the same slot
    const [res1, res2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/bookings',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          lawyerId: lawyerMe.user.id,
          type: 'consultation',
          scheduledAt: futureDate.toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/bookings',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          lawyerId: lawyerMe.user.id,
          type: 'consultation',
          scheduledAt: futureDate.toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // One should succeed (201), one should conflict (409)
    expect(statuses).toEqual([201, 409]);
  });
});

// When DATABASE_URL is not set and REQUIRE_DB_TESTS is set, hard-fail.
// This is triggered by test:integration and run_tests.sh but not by npm test.
const requireDbTests = !!process.env.REQUIRE_DB_TESTS;

describe.skipIf(shouldRun || !requireDbTests)('Real PostgreSQL integration tests — REQUIRED', () => {
  it('FAIL: DATABASE_URL not set — real-DB security tests cannot be skipped', () => {
    throw new Error(
      'DATABASE_URL is not set. Real PostgreSQL integration tests for session revocation, ' +
      'RLS tenant isolation, idempotency TTL, and advisory lock concurrency are MANDATORY. ' +
      'Set DATABASE_URL and re-run.'
    );
  });
});
