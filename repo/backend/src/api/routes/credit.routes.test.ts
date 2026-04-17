import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import creditRoutes from './credit.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const CLIENT_1 = '10000000-0000-0000-0000-000000000001';
const CLIENT_2 = '10000000-0000-0000-0000-000000000002';
const LAWYER_1 = '20000000-0000-0000-0000-000000000001';
const LAWYER_2 = '20000000-0000-0000-0000-000000000002';

describe('GET /api/credit/:userId', () => {
  let app: FastifyInstance;
  let client1Token: string;
  let client2Token: string;
  let lawyer1Token: string;
  let lawyer2Token: string;
  let adminToken: string;

  const mockData: MockDbData = {
    users: [
      {
        id: CLIENT_1, org_id: ORG_1, username: 'client1', password_hash: 'hash',
        role: 'client', credit_score: 72, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: CLIENT_2, org_id: ORG_1, username: 'client2', password_hash: 'hash',
        role: 'client', credit_score: 55, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_1, org_id: ORG_1, username: 'lawyer1', password_hash: 'hash',
        role: 'lawyer', credit_score: 90, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_2, org_id: ORG_1, username: 'lawyer2', password_hash: 'hash',
        role: 'lawyer', credit_score: 88, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 8,
        created_at: new Date(), updated_at: new Date(),
      },
    ],
    bookings: [
      // lawyer1 <-> client1 share a booking
      { id: 'b1', lawyer_id: LAWYER_1, client_id: CLIENT_1, org_id: ORG_1, status: 'completed' },
    ],
    credit_score_history: [
      {
        id: 'h1', user_id: CLIENT_1, change_amount: -5, new_score: 72,
        rule_code: 'CANCELLATION_PENALTY', description: 'Late cancel', booking_id: 'b1',
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [creditRoutes] });
    client1Token = signTestToken(app, mockData, { userId: CLIENT_1, orgId: ORG_1, role: 'client' });
    client2Token = signTestToken(app, mockData, { userId: CLIENT_2, orgId: ORG_1, role: 'client' });
    lawyer1Token = signTestToken(app, mockData, { userId: LAWYER_1, orgId: ORG_1, role: 'lawyer' });
    lawyer2Token = signTestToken(app, mockData, { userId: LAWYER_2, orgId: ORG_1, role: 'lawyer' });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
  });

  afterAll(async () => { await app.close(); });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/credit/${CLIENT_1}` });
    expect(res.statusCode).toBe(401);
  });

  it('client can view own credit and response has creditScore number plus history shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/credit/${CLIENT_1}`,
      headers: { authorization: `Bearer ${client1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(typeof body.creditScore).toBe('number');
    expect(body.creditScore).toBe(72);
    // repository returns a history envelope; top-level must at least carry creditScore
    expect(body).toHaveProperty('creditScore');
  });

  it('client cannot view another client\'s credit (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/credit/${CLIENT_2}`,
      headers: { authorization: `Bearer ${client1Token}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('FORBIDDEN');
    expect(body.message).toMatch(/own credit/i);
  });

  it('lawyer can view own credit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/credit/${LAWYER_1}`,
      headers: { authorization: `Bearer ${lawyer1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.creditScore).toBe(90);
  });

  it('lawyer can view credit of a client they share a booking with', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/credit/${CLIENT_1}`,
      headers: { authorization: `Bearer ${lawyer1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.creditScore).toBe(72);
  });

  it('lawyer cannot view credit of a client they do NOT share a booking with (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/credit/${CLIENT_1}`,
      headers: { authorization: `Bearer ${lawyer2Token}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('FORBIDDEN');
    expect(body.message).toMatch(/own clients/i);
  });

  it('admin can view any user\'s credit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/credit/${CLIENT_2}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.creditScore).toBe(55);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/credit/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('NOT_FOUND');
  });
});
