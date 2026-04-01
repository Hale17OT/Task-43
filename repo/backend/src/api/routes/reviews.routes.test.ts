import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import reviewRoutes from './reviews.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const CLIENT_1 = '10000000-0000-0000-0000-000000000001';
const LAWYER_1 = '20000000-0000-0000-0000-000000000001';
const CLIENT_2 = '10000000-0000-0000-0000-000000000002';
const BOOKING_1 = 'b0000000-0000-0000-0000-000000000001';
const REVIEW_1 = 'r0000000-0000-0000-0000-000000000001';

describe('GET /api/reviews — authorization', () => {
  let app: FastifyInstance;
  let client1Token: string;
  let client2Token: string;
  let adminToken: string;

  const mockData: MockDbData = {
    users: [],
    bookings: [
      { id: BOOKING_1, client_id: CLIENT_1, lawyer_id: LAWYER_1, org_id: ORG_1, status: 'completed' },
    ],
    reviews: [
      {
        id: REVIEW_1, booking_id: BOOKING_1, reviewer_id: CLIENT_1, reviewee_id: LAWYER_1,
        timeliness: 5, professionalism: 4, communication: 5, comment: null,
        created_at: new Date(),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [reviewRoutes] });
    client1Token = signTestToken(app, mockData, { userId: CLIENT_1, orgId: ORG_1, role: 'client' });
    client2Token = signTestToken(app, mockData, { userId: CLIENT_2, orgId: ORG_1, role: 'client' });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
  });

  afterAll(async () => { await app.close(); });

  it('client can query own reviews via reviewerId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reviews?reviewerId=${CLIENT_1}`,
      headers: { authorization: `Bearer ${client1Token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('client cannot query another user reviews via reviewerId (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reviews?reviewerId=${CLIENT_1}`,
      headers: { authorization: `Bearer ${client2Token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('client cannot query reviews for foreign booking (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reviews?bookingId=${BOOKING_1}`,
      headers: { authorization: `Bearer ${client2Token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin can query any user reviews', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reviews?userId=${CLIENT_1}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reviews' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/reviews — validation', () => {
  let app: FastifyInstance;
  let clientToken: string;

  const mockData: MockDbData = {
    users: [],
    bookings: [
      { id: BOOKING_1, client_id: CLIENT_1, lawyer_id: LAWYER_1, org_id: ORG_1, status: 'pending' },
    ],
    reviews: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [reviewRoutes] });
    clientToken = signTestToken(app, mockData, { userId: CLIENT_1, orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('rejects review for non-completed booking (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        bookingId: BOOKING_1,
        timeliness: 5,
        professionalism: 5,
        communication: 5,
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects invalid rating values (422)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        bookingId: BOOKING_1,
        timeliness: 6,
        professionalism: 0,
        communication: 5,
      },
    });
    expect(res.statusCode).toBe(422);
  });
});
