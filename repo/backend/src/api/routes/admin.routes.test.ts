import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import adminRoutes from './admin.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';

describe('Admin routes — authorization, system status, audit log', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;
  let clientToken: string;
  let lawyerToken: string;

  const mockData: MockDbData = {
    system_config: [
      { key: 'encryption_key_backup_confirmed', value: { confirmed: false } },
    ],
    audit_log: [
      {
        id: 'au-1', entity_type: 'user', entity_id: 'u-1', user_id: 'admin-1',
        action: 'create', org_id: ORG_1, created_at: new Date('2026-01-01'),
      },
      {
        id: 'au-2', entity_type: 'booking', entity_id: 'b-1', user_id: 'admin-1',
        action: 'update', org_id: ORG_1, created_at: new Date('2026-01-02'),
      },
      {
        id: 'au-3', entity_type: 'user', entity_id: 'u-2', user_id: 'sa-1',
        action: 'delete', org_id: ORG_1, created_at: new Date('2026-01-03'),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [adminRoutes] });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    clientToken = signTestToken(app, mockData, { userId: 'c-1', orgId: ORG_1, role: 'client' });
    lawyerToken = signTestToken(app, mockData, { userId: 'l-1', orgId: ORG_1, role: 'lawyer' });
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/admin/system-status rejects unauthenticated (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/system-status' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/system-status rejects client (403) and lawyer (403)', async () => {
    const c = await app.inject({
      method: 'GET', url: '/api/admin/system-status',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(c.statusCode).toBe(403);
    const l = await app.inject({
      method: 'GET', url: '/api/admin/system-status',
      headers: { authorization: `Bearer ${lawyerToken}` },
    });
    expect(l.statusCode).toBe(403);
  });

  it('GET /api/admin/system-status returns keyBackupConfirmed boolean for admin', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/system-status',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('keyBackupConfirmed');
    expect(typeof body.keyBackupConfirmed).toBe('boolean');
    expect(body.keyBackupConfirmed).toBe(false);
  });

  it('POST /api/admin/confirm-key-backup rejects admin (super_admin only, 403)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/admin/confirm-key-backup',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/admin/confirm-key-backup succeeds for super_admin with success envelope', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/admin/confirm-key-backup',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(typeof body.message).toBe('string');
  });

  it('GET /api/admin/audit-log rejects admin (super_admin only, 403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/audit-log',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/admin/audit-log returns paginated data for super_admin', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/audit-log?page=1&limit=20',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThanOrEqual(3);
    for (const row of body.data) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('action');
      expect(row).toHaveProperty('entity_type');
    }
  });

  it('GET /api/admin/audit-log filters by entityType', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/admin/audit-log?entityType=user',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    for (const row of body.data) {
      expect(row.entity_type).toBe('user');
    }
  });
});
