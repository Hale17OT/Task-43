import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import bookingRoutes from './bookings.routes.js';

describe('POST /api/bookings — real route handler', () => {
  let app: FastifyInstance;
  let clientToken: string;
  let lawyerToken: string;

  // Use UUID-format IDs so Zod schema validation passes
  const CLIENT_1 =    '10000000-0000-0000-0000-000000000001';
  const LAWYER_1 =    '20000000-0000-0000-0000-000000000001';
  const CLIENT_2 =    '10000000-0000-0000-0000-000000000002';
  const LAWYER_OTHER = '20000000-0000-0000-0000-000000000002';
  const LAWYER_INACTIVE = '20000000-0000-0000-0000-000000000003';
  const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
  const ORG_2 = 'a0000000-0000-0000-0000-000000000002';

  const mockData: MockDbData = {
    users: [
      {
        id: CLIENT_1, org_id: ORG_1, username: 'client1', password_hash: 'hash',
        role: 'client', credit_score: 80, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_1, org_id: ORG_1, username: 'lawyer1', password_hash: 'hash',
        role: 'lawyer', credit_score: 50, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: CLIENT_2, org_id: ORG_1, username: 'client2', password_hash: 'hash',
        role: 'client', credit_score: 60, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_OTHER, org_id: ORG_2, username: 'lawyer_other', password_hash: 'hash',
        role: 'lawyer', credit_score: 50, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_INACTIVE, org_id: ORG_1, username: 'inactive_lawyer', password_hash: 'hash',
        role: 'lawyer', credit_score: 50, is_active: false, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
    ],
    idempotency_registry: [],
    bookings: [],
    rate_limit_buckets: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [bookingRoutes] });
    clientToken = signTestToken(app, mockData, { userId: CLIENT_1, orgId: ORG_1, role: 'client' });
    lawyerToken = signTestToken(app, mockData, { userId: LAWYER_1, orgId: ORG_1, role: 'lawyer' });
  });

  afterAll(async () => { await app.close(); });

  it('rejects booking with non-existent lawyerId (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        lawyerId: '00000000-0000-0000-0000-000000000000',
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        idempotencyKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('Lawyer not found');
  });

  it('rejects booking with non-lawyer user (role=client) as lawyerId (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        lawyerId: CLIENT_2,
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        idempotencyKey: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('Lawyer not found');
  });

  it('rejects booking with cross-org lawyer (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        lawyerId: LAWYER_OTHER,
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        idempotencyKey: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('Lawyer not found');
  });

  it('rejects booking with inactive lawyer (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        lawyerId: LAWYER_INACTIVE,
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 4 * 86400000).toISOString(),
        idempotencyKey: 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('Lawyer not found');
  });

  it('rejects lawyer role from creating bookings (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${lawyerToken}` },
      payload: {
        lawyerId: LAWYER_1,
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        idempotencyKey: 'eeeeeeee-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects unauthenticated booking creation (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        lawyerId: LAWYER_1,
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 6 * 86400000).toISOString(),
        idempotencyKey: 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/bookings — status filtering', () => {
  let app: FastifyInstance;
  let clientToken: string;

  const CLIENT_ID = '10000000-0000-0000-0000-000000000001';
  const FILTER_ORG = 'a0000000-0000-0000-0000-000000000001';

  const mockData: MockDbData = {
    users: [],
    bookings: [
      { id: 'b1', client_id: CLIENT_ID, lawyer_id: 'l1', org_id: FILTER_ORG, status: 'pending', type: 'consultation', created_at: new Date() },
      { id: 'b2', client_id: CLIENT_ID, lawyer_id: 'l1', org_id: FILTER_ORG, status: 'confirmed', type: 'consultation', created_at: new Date() },
      { id: 'b3', client_id: CLIENT_ID, lawyer_id: 'l1', org_id: FILTER_ORG, status: 'completed', type: 'milestone', created_at: new Date() },
      { id: 'b4', client_id: CLIENT_ID, lawyer_id: 'l1', org_id: FILTER_ORG, status: 'cancelled', type: 'consultation', created_at: new Date() },
    ],
    idempotency_registry: [],
    rate_limit_buckets: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [bookingRoutes] });
    clientToken = signTestToken(app, mockData, { userId: CLIENT_ID, orgId: FILTER_ORG, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('single status filter returns matching bookings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bookings?status=pending',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe('pending');
  });

  it('comma-separated status filter returns multiple matching bookings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bookings?status=pending,confirmed',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);
    const statuses = body.data.map((b: any) => b.status);
    expect(statuses).toContain('pending');
    expect(statuses).toContain('confirmed');
  });

  it('no status filter returns all bookings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(4);
  });
});
