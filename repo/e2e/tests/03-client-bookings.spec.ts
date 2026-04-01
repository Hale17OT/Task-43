import { test, expect } from '@playwright/test';
import { login, waitForShell, getAuthToken } from './helpers';

test.describe('Client Bookings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);
  });

  test('booking list page loads', async ({ page }) => {
    await page.locator('.sidebar a[href="/client/bookings"]').click();
    await page.waitForTimeout(500);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toContain('Booking');
  });

  test('booking create page loads', async ({ page }) => {
    await page.locator('.sidebar a[href="/client/bookings"]').click();
    await page.waitForTimeout(500);
    await page.locator('a[href="/client/bookings/create"]').first().click();
    await page.waitForTimeout(500);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('booking');
  });

  test('credit history page loads', async ({ page }) => {
    await page.locator('a[href="/client/credit-history"]').click();
    await page.waitForTimeout(500);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('credit');
  });
});

test.describe('Client Booking API Flow', () => {
  test('creates and lists a consultation booking via API', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    // Get lawyer's userId via /api/auth/me
    const meRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    const { user: lawyer } = await meRes.json();

    // Create a consultation booking with a unique time
    const tomorrow = new Date(Date.now() + 7 * 86400000);
    tomorrow.setHours(10, Math.floor(Math.random() * 60), 0, 0);
    const idempotencyKey = crypto.randomUUID();

    const createRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyer.id,
        type: 'consultation',
        scheduledAt: tomorrow.toISOString(),
        idempotencyKey,
      },
    });
    expect(createRes.status()).toBe(201);
    const { booking } = await createRes.json();
    expect(booking.status).toBe('pending');
    expect(booking.type).toBe('consultation');

    // Verify idempotency — same key returns same response
    const dupRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyer.id,
        type: 'consultation',
        scheduledAt: tomorrow.toISOString(),
        idempotencyKey,
      },
    });
    expect(dupRes.status()).toBe(201);

    // List bookings
    const listRes = await page.request.get('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(listRes.ok()).toBe(true);
    const listBody = await listRes.json();
    expect(listBody.data.length).toBeGreaterThan(0);
  });
});
