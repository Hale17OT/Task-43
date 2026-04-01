import { test, expect } from '@playwright/test';
import { getAuthToken } from './helpers';

test.describe('User API: Response Sanitization', () => {
  test('GET /api/users never returns passwordHash or lockout fields', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');
    const res = await page.request.get('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);

    for (const user of body.data) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('failedLoginAttempts');
      expect(user).not.toHaveProperty('failed_login_attempts');
      expect(user).not.toHaveProperty('lockedUntil');
      expect(user).not.toHaveProperty('locked_until');
      // Verify expected fields exist
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('role');
    }
  });
});

test.describe('Booking API: Lawyer Validation', () => {
  test('booking with non-existent lawyerId returns 404', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const res = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: '00000000-0000-0000-0000-000000000000',
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 100 * 86400000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.message).toContain('Lawyer not found');
  });

  test('booking with non-lawyer user ID returns 404', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    // Get client2's ID (a client, not a lawyer)
    const client2Token = await getAuthToken(page, 'client2');
    const client2Me = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${client2Token}` },
    })).json();

    const res = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: client2Me.user.id,
        type: 'consultation',
        scheduledAt: new Date(Date.now() + 101 * 86400000).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Booking API: Idempotency', () => {
  test('create booking idempotency is scoped by user', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    const idempotencyKey = crypto.randomUUID();
    const futureDate = new Date(Date.now() + 102 * 86400000);
    futureDate.setHours(9, Math.floor(Math.random() * 60), 0, 0);

    // First request creates booking
    const res1 = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey,
      },
    });
    expect(res1.status()).toBe(201);

    // Same key + same user = returns cached response
    const res2 = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey,
      },
    });
    expect(res2.status()).toBe(201);
  });

  test('reschedule uses idempotency registry', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    // Create a booking to reschedule
    const futureDate = new Date(Date.now() + 103 * 86400000);
    futureDate.setHours(14, Math.floor(Math.random() * 60), 0, 0);
    const createRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyerMe.user.id,
        type: 'consultation',
        scheduledAt: futureDate.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(createRes.status()).toBe(201);
    const { booking } = await createRes.json();

    // Confirm it so it can be rescheduled
    await page.request.patch(`/api/bookings/${booking.id}/confirm`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });

    // Reschedule with idempotency key
    const rescheduleKey = crypto.randomUUID();
    const newDate = new Date(Date.now() + 104 * 86400000);
    newDate.setHours(10, Math.floor(Math.random() * 60), 0, 0);

    const res1 = await page.request.patch(`/api/bookings/${booking.id}/reschedule`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        newScheduledAt: newDate.toISOString(),
        idempotencyKey: rescheduleKey,
      },
    });
    expect(res1.status()).toBe(201);

    // Replay with same key returns cached response
    const res2 = await page.request.patch(`/api/bookings/${booking.id}/reschedule`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        newScheduledAt: newDate.toISOString(),
        idempotencyKey: rescheduleKey,
      },
    });
    expect(res2.status()).toBe(201);
  });
});
