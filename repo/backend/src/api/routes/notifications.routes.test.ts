import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, signTestToken, MockDbData } from '../test-helpers.js';
import notificationRoutes from './notifications.routes.js';

const ORG_1 = 'a0000000-0000-0000-0000-000000000001';
const USER_1 = '10000000-0000-0000-0000-000000000001';
const USER_2 = '10000000-0000-0000-0000-000000000002';

describe('Notifications API — real route handlers', () => {
  let app: FastifyInstance;
  let user1Token: string;
  let user2Token: string;

  const mockData: MockDbData = {
    notifications: [
      {
        id: 'notif-1', user_id: USER_1, title: 'Booking Completed',
        body: 'Please review', type: 'review_prompt', reference_id: null,
        is_read: false, created_at: new Date(),
      },
      {
        id: 'notif-2', user_id: USER_1, title: 'Report Ready',
        body: null, type: 'report_ready', reference_id: null,
        is_read: true, created_at: new Date(),
      },
      {
        id: 'notif-3', user_id: USER_2, title: 'Other user notif',
        body: null, type: 'system', reference_id: null,
        is_read: false, created_at: new Date(),
      },
    ],
  };

  beforeAll(async () => {
    app = await buildTestApp({ mockData, routes: [notificationRoutes] });
    user1Token = signTestToken(app, mockData, { userId: USER_1, orgId: ORG_1, role: 'client' });
    user2Token = signTestToken(app, mockData, { userId: USER_2, orgId: ORG_1, role: 'client' });
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/notifications returns user-scoped notifications', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);
    for (const n of body.data) {
      expect(n.userId).toBe(USER_1);
    }
  });

  it('GET /api/notifications with unread=true filters correctly', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications?unread=true',
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].isRead).toBe(false);
  });

  it('user2 sees only their own notifications', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${user2Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].userId).toBe(USER_2);
  });

  it('PATCH /api/notifications/:id/read marks notification as read', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/notif-1/read',
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PATCH /api/notifications/:id/read returns 404 for wrong user', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/notif-1/read',
      headers: { authorization: `Bearer ${user2Token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/notifications/read-all returns 204', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/read-all',
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications' });
    expect(res.statusCode).toBe(401);
  });
});
