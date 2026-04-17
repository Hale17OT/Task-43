import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import organizationRoutes from './organizations.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const ORG_2 = 'a0000000-0000-0000-0000-000000000002';

describe('Organizations routes — authorization', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;
  let clientToken: string;

  const mockData: MockDbData = {
    organizations: [
      { id: ORG_1, name: 'Justice Partners', settings: {}, created_at: new Date(), updated_at: new Date() },
      { id: ORG_2, name: 'Second Firm', settings: {}, created_at: new Date('2025-01-01'), updated_at: new Date() },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [organizationRoutes] });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    clientToken = signTestToken(app, mockData, { userId: 'c-1', orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/organizations rejects unauthenticated (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/organizations' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/organizations rejects non-super_admin (403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/organizations',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/organizations rejects client (403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/organizations',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('super_admin lists organizations with {data, total} pagination envelope', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/organizations?page=1&limit=20',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.data.length).toBeGreaterThan(0);
    const org = body.data[0];
    expect(org).toHaveProperty('id');
    expect(org).toHaveProperty('name');
  });

  it('POST /api/organizations rejects admin (403)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/organizations',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'New Firm' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/organizations validates name length (422)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/organizations',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('POST /api/organizations rejects duplicate name (409)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/organizations',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Justice Partners' },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('CONFLICT');
  });

  it('POST /api/organizations creates organization (201) with submitted name', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/organizations',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Brand New Firm', settings: { tier: 'premium' } },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.organization).toBeDefined();
    expect(body.organization.name).toBe('Brand New Firm');
    expect(body.organization.id).toBeDefined();
  });

  it('PATCH /api/organizations/:id rejects admin (403)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/organizations/${ORG_1}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Hacked Name' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH /api/organizations/:id rejects unknown fields (strict schema, 422)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/organizations/${ORG_1}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Valid', evilFlag: true } as any,
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH /api/organizations/:id updates name and returns patched org', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/organizations/${ORG_1}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Justice Partners Renamed' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.organization).toBeDefined();
    expect(body.organization.name).toBe('Justice Partners Renamed');
  });
});
