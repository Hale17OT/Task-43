import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import userRoutes from './users.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const ORG_2 = 'a0000000-0000-0000-0000-000000000002';

describe('GET /api/users — real route handler', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientToken: string;

  const mockData: MockDbData = {
    users: [
      {
        id: 'u1', org_id: ORG_1, username: 'lawyer1', password_hash: '$2b$12$secret_hash',
        role: 'lawyer', credit_score: 50, is_active: true, is_session_exempt: false,
        failed_login_attempts: 3, locked_until: new Date(), daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: 'u2', org_id: ORG_1, username: 'client1', password_hash: '$2b$12$another_hash',
        role: 'client', credit_score: 80, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [userRoutes] });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    clientToken = signTestToken(app, mockData, { userId: 'u2', orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('returns users without passwordHash, failedLoginAttempts, or lockedUntil', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);

    for (const user of body.data) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('failedLoginAttempts');
      expect(user).not.toHaveProperty('failed_login_attempts');
      expect(user).not.toHaveProperty('lockedUntil');
      expect(user).not.toHaveProperty('locked_until');
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('creditScore');
    }
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects client role with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/users — privilege escalation prevention', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let superAdminToken: string;

  const mockData: MockDbData = { users: [] };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [userRoutes] });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
  });

  afterAll(async () => { await app.close(); });

  it('admin cannot create user in different org (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'cross_org_user',
        password: 'StrongP@ssw0rd!!',
        role: 'client',
        orgId: ORG_2,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('own organization');
  });

  it('super_admin can create user in any org (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        username: 'cross_org_by_sa',
        password: 'StrongP@ssw0rd!!',
        role: 'client',
        orgId: ORG_2,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('admin cannot create a super_admin user (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'escalated_user',
        password: 'StrongP@ssw0rd!!',
        role: 'super_admin',
        orgId: ORG_1,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('super');
  });

  it('admin can create a client user (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'new_client',
        password: 'StrongP@ssw0rd!!',
        role: 'client',
        orgId: ORG_1,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('admin can create an admin user (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'new_admin',
        password: 'StrongP@ssw0rd!!',
        role: 'admin',
        orgId: ORG_1,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('super_admin can create a super_admin user (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        username: 'new_superadmin',
        password: 'StrongP@ssw0rd!!',
        role: 'super_admin',
        orgId: ORG_1,
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('PATCH /api/users/:id — role transition guards', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let superAdminToken: string;
  let adminOtherOrgToken: string;

  const mockData: MockDbData = {
    users: [
      {
        id: 'target-client', org_id: ORG_1, username: 'target', password_hash: 'hash',
        role: 'client', credit_score: 50, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: 'target-sa', org_id: ORG_1, username: 'target_sa', password_hash: 'hash',
        role: 'super_admin', credit_score: 50, is_active: true, is_session_exempt: true,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: 'target-other-org', org_id: ORG_2, username: 'other_org_user', password_hash: 'hash',
        role: 'client', credit_score: 50, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [userRoutes] });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
    superAdminToken = signTestToken(app, mockData, { userId: 'sa-1', orgId: ORG_1, role: 'super_admin' });
    adminOtherOrgToken = signTestToken(app, mockData, { userId: 'admin-2', orgId: ORG_2, role: 'admin' });
  });

  afterAll(async () => { await app.close(); });

  it('admin cannot promote user to super_admin (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/target-client',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'super_admin' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('super');
  });

  it('admin cannot modify existing super_admin user (403)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/target-sa',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('super');
  });

  it('admin cannot modify user in different org (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/target-other-org',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it('super_admin can promote user to super_admin (200)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/target-client',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { role: 'super_admin' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('super_admin can modify existing super_admin user (200)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/target-sa',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
  });

  it('admin can change user role to lawyer (200)', async () => {
    // Reset target-client role first (it was changed to super_admin by previous test)
    mockData.users[0].role = 'client';
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/target-client',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'lawyer' },
    });
    expect(res.statusCode).toBe(200);
  });
});
