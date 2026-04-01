import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import reportRoutes from './reports.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';

describe('Reports API — authorization', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientToken: string;

  const mockData: MockDbData = {
    users: [],
    bookings: [],
    availability: [],
    disputes: [],
    report_subscriptions: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [reportRoutes] });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    clientToken = signTestToken(app, mockData, { userId: 'client-1', orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('admin can access dashboard metrics (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/dashboard',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('availability');
    expect(body).toHaveProperty('faultRate');
  });

  it('client cannot access dashboard metrics (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/dashboard',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('client cannot access report export (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/export?format=csv',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('client cannot access report subscriptions (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/report-subscriptions',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin can create report subscription (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/report-subscriptions',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { reportType: 'utilization' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('subscription with invalid payload returns 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/report-subscriptions',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { reportType: '' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reports/dashboard' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Reports API — super_admin all-org aggregation', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;

  const ORG_2 = 'a0000000-0000-0000-0000-000000000002';

  const mockData: MockDbData = {
    users: [],
    bookings: [
      { id: 'b1', org_id: ORG_1, status: 'completed', client_id: 'c1', lawyer_id: 'l1', created_at: new Date() },
      { id: 'b2', org_id: ORG_2, status: 'completed', client_id: 'c2', lawyer_id: 'l2', created_at: new Date() },
      { id: 'b3', org_id: ORG_1, status: 'no_show', client_id: 'c1', lawyer_id: 'l1', created_at: new Date() },
    ],
    availability: [],
    disputes: [],
    report_subscriptions: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [reportRoutes] });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
  });

  afterAll(async () => { await app.close(); });

  it('super_admin without orgId aggregates across all orgs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/dashboard',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // throughput = completed count across ALL orgs = 2
    expect(body.throughput).toBe(2);
  });

  it('super_admin with specific orgId filters to that org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/dashboard?orgId=${ORG_1}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Only org-1 bookings: 1 completed + 1 no_show = throughput 1
    expect(body.throughput).toBe(1);
  });

  it('admin always sees only own org regardless of query param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/dashboard?orgId=${ORG_2}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Admin is org-1; orgId param is ignored for non-super_admin
    expect(body.throughput).toBe(1);
  });
});
