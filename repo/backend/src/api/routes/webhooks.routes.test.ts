import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import webhookRoutes from './webhooks.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const ORG_2 = 'a0000000-0000-0000-0000-000000000002';
const WH_1 = 'e1000000-0000-0000-0000-000000000001';
const WH_OTHER_ORG = 'e1000000-0000-0000-0000-000000000099';

// Use raw IPs so the SSRF validator never issues DNS lookups in tests.
const SAFE_URL = 'http://10.0.0.1/webhook';
const SAFE_URL_2 = 'http://10.0.0.2/webhook';
const METADATA_HOST = 'http://metadata.google.internal/token';

describe('Webhooks routes — authorization, validation, secret masking', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let superAdminToken: string;
  let clientToken: string;
  let adminOtherOrgToken: string;

  const mockData: MockDbData = {
    webhook_configs: [
      {
        id: WH_1, org_id: ORG_1, url: 'http://10.0.0.100/existing',
        events: '["booking.created"]', secret: 'encrypted:blob:xxxx',
        is_active: true, created_at: new Date(),
      },
      {
        id: WH_OTHER_ORG, org_id: ORG_2, url: 'http://10.0.0.200/other',
        events: '["booking.completed"]', secret: 'encrypted:blob:yyyy',
        is_active: true, created_at: new Date(),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [webhookRoutes] });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
    clientToken = signTestToken(app, mockData, { userId: 'c-1', orgId: ORG_1, role: 'client' });
    adminOtherOrgToken = signTestToken(app, mockData, { userId: 'admin-2', orgId: ORG_2, role: 'admin' });
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/webhooks rejects unauthenticated (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/webhooks' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/webhooks rejects client (403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/webhooks',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/webhooks returns only own-org webhooks with masked secrets', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/webhooks',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(WH_1);
    // secret must be masked
    expect(body.data[0].secret).toBe('••••••••');
    expect(body.data[0].secret).not.toMatch(/encrypted/);
    // events must be a parsed array, not a JSON string
    expect(Array.isArray(body.data[0].events)).toBe(true);
  });

  it('POST /api/webhooks rejects a client (403)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { url: SAFE_URL, events: ['booking.created'], secret: 'longenoughSecret' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/webhooks rejects short secret (<8 chars) with 422', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { url: SAFE_URL, events: ['booking.created'], secret: 'short' },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('POST /api/webhooks rejects SSRF target (cloud metadata host) with 422', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { url: METADATA_HOST, events: ['booking.created'], secret: 'longenoughSecret' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /api/webhooks creates webhook (201) and returns masked secret', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { url: SAFE_URL, events: ['booking.created', 'booking.completed'], secret: 'longenoughSecret' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.webhook).toBeDefined();
    expect(body.webhook.id).toBeDefined();
    expect(body.webhook.url).toBe(SAFE_URL);
    expect(body.webhook.events).toEqual(['booking.created', 'booking.completed']);
    expect(body.webhook.secret).toBe('••••••••');
    expect(body.webhook.secret).not.toContain('longenoughSecret');
    expect(body.webhook.org_id).toBe(ORG_1);
  });

  it('PATCH /api/webhooks/:id cannot touch another org\'s webhook (404)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/webhooks/${WH_OTHER_ORG}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/webhooks/:id rejects unknown fields (strict schema, 422)', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/webhooks/${WH_1}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { secret: 'newsecret12345' } as any,
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH /api/webhooks/:id updates URL (200) and keeps secret masked in response', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/webhooks/${WH_1}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { url: SAFE_URL_2, isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.webhook.url).toBe(SAFE_URL_2);
    expect(body.webhook.secret).toBe('••••••••');
  });

  it('POST /api/webhooks/:id/rotate-secret (200) returns masked secret, never the raw value', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/webhooks/${WH_1}/rotate-secret`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { secret: 'aFreshSecret12345' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.webhook).toBeDefined();
    expect(body.webhook.secret).toBe('••••••••');
    expect(JSON.stringify(body)).not.toContain('aFreshSecret');
  });

  it('POST /api/webhooks/:id/rotate-secret rejects cross-org target (404)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/webhooks/${WH_OTHER_ORG}/rotate-secret`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { secret: 'aFreshSecret12345' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('super_admin can target another org via targetOrgId (scoped lookup)', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/webhooks?targetOrgId=${ORG_2}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(WH_OTHER_ORG);
  });
});
