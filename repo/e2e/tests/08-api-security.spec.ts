import { test, expect } from '@playwright/test';
import { getAuthToken } from './helpers';

test.describe('API Security & Authorization', () => {
  test('unauthenticated request returns 401', async ({ page }) => {
    const res = await page.request.get('/api/bookings');
    expect(res.status()).toBe(401);
  });

  test('invalid JWT returns 401', async ({ page }) => {
    const res = await page.request.get('/api/bookings', {
      headers: { Authorization: 'Bearer invalidtoken123' },
    });
    expect(res.status()).toBe(401);
  });

  test('client cannot access admin endpoints', async ({ page }) => {
    const token = await getAuthToken(page, 'client1');

    const usersRes = await page.request.get('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(usersRes.status()).toBe(403);

    const jobsRes = await page.request.get('/api/jobs', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(jobsRes.status()).toBe(403);
  });

  test('lawyer cannot create bookings', async ({ page }) => {
    const lawyerToken = await getAuthToken(page, 'lawyer1');
    const res = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
      data: {
        lawyerId: 'some-uuid',
        type: 'consultation',
        scheduledAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(res.status()).toBe(403);
  });

  test('client cannot confirm bookings', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const res = await page.request.patch('/api/bookings/nonexistent-uuid/confirm', {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    // Should be 403 (not authorized as lawyer) rather than 404
    expect(res.status()).toBe(403);
  });

  test('lawyer cannot access user management', async ({ page }) => {
    const token = await getAuthToken(page, 'lawyer1');
    const res = await page.request.get('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('admin cannot access super_admin org management', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');
    const res = await page.request.get('/api/organizations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('super_admin can access org management', async ({ page }) => {
    const token = await getAuthToken(page, 'superadmin');
    const res = await page.request.get('/api/organizations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('health endpoint is publicly accessible', async ({ page }) => {
    const res = await page.request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
  });

  test('time sync endpoint is publicly accessible', async ({ page }) => {
    const res = await page.request.get('/api/time');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('serverTime');
    // Server time should be a valid ISO date
    expect(new Date(body.serverTime).getTime()).toBeGreaterThan(0);
  });

  test('client cannot read reviews for another user via userId param', async ({ page }) => {
    const client1Token = await getAuthToken(page, 'client1');
    const client2Token = await getAuthToken(page, 'client2');

    // Get client2's user ID
    const client2Me = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${client2Token}` },
    })).json();

    // client1 tries to read client2's reviews
    const res = await page.request.get(`/api/reviews?userId=${client2Me.user.id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('client cannot read reviews for a booking they did not participate in', async ({ page }) => {
    const client1Token = await getAuthToken(page, 'client1');
    const client2Token = await getAuthToken(page, 'client2');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    // client2 creates a booking with lawyer1
    const futureDate = new Date(Date.now() + 60 * 86400000);
    futureDate.setHours(11, Math.floor(Math.random() * 60), 0, 0);
    const bookingRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${client2Token}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(bookingRes.status()).toBe(201);
    const { booking } = await bookingRes.json();

    // client1 tries to read reviews for client2's booking
    const reviewsRes = await page.request.get(`/api/reviews?bookingId=${booking.id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    expect(reviewsRes.status()).toBe(403);
  });

  test('lawyer cannot read reviews for a booking they did not participate in', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyer2Token = await getAuthToken(page, 'lawyer2');
    const lawyer1Token = await getAuthToken(page, 'lawyer1');

    const lawyer1Me = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyer1Token}` },
    })).json();

    // client1 creates a booking with lawyer1
    const futureDate = new Date(Date.now() + 61 * 86400000);
    futureDate.setHours(14, Math.floor(Math.random() * 60), 0, 0);
    const bookingRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyer1Me.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(bookingRes.status()).toBe(201);
    const { booking } = await bookingRes.json();

    // lawyer2 tries to read reviews for lawyer1's booking
    const reviewsRes = await page.request.get(`/api/reviews?bookingId=${booking.id}`, {
      headers: { Authorization: `Bearer ${lawyer2Token}` },
    });
    expect(reviewsRes.status()).toBe(403);
  });

  test('admin can read reviews for any user', async ({ page }) => {
    const adminToken = await getAuthToken(page, 'admin1');
    const clientToken = await getAuthToken(page, 'client1');

    const clientMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${clientToken}` },
    })).json();

    // admin reads client1's reviews - should be allowed
    const res = await page.request.get(`/api/reviews?userId=${clientMe.user.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
  });

  test('session revocation: new login invalidates old session', async ({ page }) => {
    // Login once
    const firstRes = await page.request.post('/api/auth/login', {
      data: { username: 'client2', password: 'SecurePass1!' },
    });
    const firstBody = await firstRes.json();
    const firstToken = firstBody.token;

    // Login again (should revoke first session)
    const secondRes = await page.request.post('/api/auth/login', {
      data: { username: 'client2', password: 'SecurePass1!' },
    });
    expect(secondRes.ok()).toBe(true);

    // First token should now be invalid (session nonce revoked)
    const meRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    expect(meRes.status()).toBe(401);
  });
});
