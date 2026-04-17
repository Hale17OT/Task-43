import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import availabilityRoutes from './availability.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const ORG_2 = 'a0000000-0000-0000-0000-000000000002';
const CLIENT_1 = '10000000-0000-0000-0000-000000000001';
const LAWYER_1 = '20000000-0000-0000-0000-000000000001';
const LAWYER_2 = '20000000-0000-0000-0000-000000000002';
const LAWYER_OTHER_ORG = '20000000-0000-0000-0000-000000000099';
const LAWYER_INACTIVE = '20000000-0000-0000-0000-000000000077';
const ADMIN_OTHER_ORG = 'a9000000-0000-0000-0000-000000000002';
const SLOT_1 = 's0000000-0000-0000-0000-000000000001';

describe('GET /api/lawyers — client-safe lawyer directory', () => {
  let app: FastifyInstance;
  let clientToken: string;
  let clientOtherOrgToken: string;
  let lawyerToken: string;
  let adminToken: string;

  const mockData: MockDbData = {
    users: [
      {
        id: LAWYER_1, org_id: ORG_1, username: 'lawyer1', password_hash: 'hash',
        role: 'lawyer', credit_score: 90, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_2, org_id: ORG_1, username: 'lawyer2', password_hash: 'hash',
        role: 'lawyer', credit_score: 85, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 8,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_INACTIVE, org_id: ORG_1, username: 'retired_lawyer', password_hash: 'hash',
        role: 'lawyer', credit_score: 50, is_active: false, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 5,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: LAWYER_OTHER_ORG, org_id: ORG_2, username: 'cross_org_lawyer', password_hash: 'hash',
        role: 'lawyer', credit_score: 80, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 12,
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: CLIENT_1, org_id: ORG_1, username: 'client1', password_hash: 'hash',
        role: 'client', credit_score: 80, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: null,
        created_at: new Date(), updated_at: new Date(),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [availabilityRoutes] });
    clientToken = signTestToken(app, mockData, { userId: CLIENT_1, orgId: ORG_1, role: 'client' });
    clientOtherOrgToken = signTestToken(app, mockData, { userId: 'client-other', orgId: ORG_2, role: 'client' });
    lawyerToken = signTestToken(app, mockData, { userId: LAWYER_1, orgId: ORG_1, role: 'lawyer' });
    adminToken = signTestToken(app, mockData, { userId: 'admin-1', orgId: ORG_1, role: 'admin' });
  });

  afterAll(async () => { await app.close(); });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/lawyers' });
    expect(res.statusCode).toBe(401);
  });

  it('returns JSON with a `data` array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lawyers',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns only active lawyers from the caller\'s org (org-scoping + active filter)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lawyers',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const ids = body.data.map((l: any) => l.id).sort();
    expect(ids).toEqual([LAWYER_1, LAWYER_2].sort());
    // must not leak cross-org lawyer or inactive lawyer
    expect(ids).not.toContain(LAWYER_OTHER_ORG);
    expect(ids).not.toContain(LAWYER_INACTIVE);
  });

  it('returned objects expose only public fields (id, username, dailyCapacity)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lawyers',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
    for (const lawyer of body.data) {
      // public fields present
      expect(lawyer).toHaveProperty('id');
      expect(lawyer).toHaveProperty('username');
      expect(lawyer).toHaveProperty('dailyCapacity');
      expect(typeof lawyer.id).toBe('string');
      expect(typeof lawyer.username).toBe('string');
      // sensitive / internal fields must NOT leak
      expect(lawyer).not.toHaveProperty('passwordHash');
      expect(lawyer).not.toHaveProperty('password_hash');
      expect(lawyer).not.toHaveProperty('failedLoginAttempts');
      expect(lawyer).not.toHaveProperty('failed_login_attempts');
      expect(lawyer).not.toHaveProperty('lockedUntil');
      expect(lawyer).not.toHaveProperty('locked_until');
      expect(lawyer).not.toHaveProperty('creditScore');
      expect(lawyer).not.toHaveProperty('credit_score');
      expect(lawyer).not.toHaveProperty('isActive');
      expect(lawyer).not.toHaveProperty('is_active');
      expect(lawyer).not.toHaveProperty('orgId');
      expect(lawyer).not.toHaveProperty('org_id');
      expect(lawyer).not.toHaveProperty('role');
    }
  });

  it('lawyer role can also list lawyers in own org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lawyers',
      headers: { authorization: `Bearer ${lawyerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.map((l: any) => l.id)).toContain(LAWYER_1);
  });

  it('admin role also sees only own-org lawyers (no privileged cross-org leak)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lawyers',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    for (const lawyer of body.data) {
      expect(lawyer.id).not.toBe(LAWYER_OTHER_ORG);
    }
  });

  it('client from a different org sees a completely different lawyer set', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lawyers',
      headers: { authorization: `Bearer ${clientOtherOrgToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const ids = body.data.map((l: any) => l.id);
    expect(ids).toContain(LAWYER_OTHER_ORG);
    expect(ids).not.toContain(LAWYER_1);
    expect(ids).not.toContain(LAWYER_2);
  });
});

describe('GET /api/availability', () => {
  let app: FastifyInstance;
  let clientToken: string;

  const mockData: MockDbData = {
    users: [
      {
        id: LAWYER_1, org_id: ORG_1, username: 'lawyer1', password_hash: 'hash',
        role: 'lawyer', credit_score: 90, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
    ],
    availability: [
      {
        id: SLOT_1, lawyer_id: LAWYER_1, day_of_week: 1,
        start_time: '09:00', end_time: '12:00', slot_duration_min: 60,
        is_active: true, created_at: new Date(),
      },
      {
        id: 's0000000-0000-0000-0000-000000000002', lawyer_id: LAWYER_1, day_of_week: 3,
        start_time: '13:00', end_time: '17:00', slot_duration_min: 30,
        is_active: true, created_at: new Date(),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [availabilityRoutes] });
    clientToken = signTestToken(app, mockData, { userId: CLIENT_1, orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('returns empty slots when no lawyerId is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/availability',
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ slots: [] });
  });

  it('returns slots for requested lawyer with domain-shaped fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/availability?lawyerId=${LAWYER_1}`,
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.slots)).toBe(true);
    expect(body.slots.length).toBe(2);
    for (const slot of body.slots) {
      expect(slot).toHaveProperty('id');
      expect(slot).toHaveProperty('lawyerId');
      expect(slot).toHaveProperty('dayOfWeek');
      expect(slot).toHaveProperty('startTime');
      expect(slot).toHaveProperty('endTime');
      expect(slot.lawyerId).toBe(LAWYER_1);
    }
  });
});

describe('POST /api/availability — role + validation', () => {
  let app: FastifyInstance;
  let lawyerToken: string;
  let clientToken: string;

  const mockData: MockDbData = {
    users: [
      {
        id: LAWYER_1, org_id: ORG_1, username: 'lawyer1', password_hash: 'hash',
        role: 'lawyer', credit_score: 90, is_active: true, is_session_exempt: false,
        failed_login_attempts: 0, locked_until: null, daily_capacity: 10,
        created_at: new Date(), updated_at: new Date(),
      },
    ],
    availability: [],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [availabilityRoutes] });
    lawyerToken = signTestToken(app, mockData, { userId: LAWYER_1, orgId: ORG_1, role: 'lawyer' });
    clientToken = signTestToken(app, mockData, { userId: CLIENT_1, orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('client cannot create an availability slot (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('invalid time format returns 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability',
      headers: { authorization: `Bearer ${lawyerToken}` },
      payload: { dayOfWeek: 1, startTime: '9am', endTime: '5pm' },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('endTime must be after startTime (422)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability',
      headers: { authorization: `Bearer ${lawyerToken}` },
      payload: { dayOfWeek: 1, startTime: '12:00', endTime: '09:00' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('dayOfWeek out of range returns 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability',
      headers: { authorization: `Bearer ${lawyerToken}` },
      payload: { dayOfWeek: 9, startTime: '09:00', endTime: '10:00' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('lawyer creates a slot (201) with the submitted fields in response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/availability',
      headers: { authorization: `Bearer ${lawyerToken}` },
      payload: { dayOfWeek: 2, startTime: '10:00', endTime: '11:30', slotDurationMin: 30 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.slot).toBeDefined();
    expect(body.slot.lawyerId).toBe(LAWYER_1);
    expect(body.slot.dayOfWeek).toBe(2);
    expect(body.slot.startTime).toBe('10:00');
    expect(body.slot.endTime).toBe('11:30');
    expect(body.slot.slotDurationMin).toBe(30);
    expect(body.slot.id).toBeDefined();
  });
});
