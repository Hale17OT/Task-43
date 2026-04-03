import { test, expect } from '@playwright/test';
import { login, waitForShell, getAuthToken } from './helpers';

test.describe('Lawyer Dashboard & Availability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'lawyer1');
    await waitForShell(page);
  });

  test('lawyer dashboard loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/lawyer\/dashboard/);
    // Should show something like "Today's Bookings" or dashboard content
    await expect(page.locator('h2').first()).toBeVisible();
  });

  test('availability manager page loads', async ({ page }) => {
    await page.locator('a[href="/lawyer/availability"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toContainText('Availability');
    // Should show existing availability slots (seeded Mon-Fri)
  });

  test('booking requests page loads', async ({ page }) => {
    await page.locator('a[href="/lawyer/bookings"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Booking');
  });

  test('sidebar shows correct nav items for lawyer role', async ({ page }) => {
    const labels = await page.locator('.nav-item').allTextContents();
    const trimmed = labels.map(l => l.trim());
    expect(trimmed).toContain('Dashboard');
    expect(trimmed).toContain('Availability');
    expect(trimmed).toContain('Bookings');
    expect(trimmed).toContain('Reviews');
    expect(trimmed).toContain('Notifications');
    expect(trimmed).not.toContain('Jobs');
    expect(trimmed).not.toContain('Users');
  });
});

test.describe('Lawyer Booking Lifecycle via API', () => {
  test('lawyer can confirm and complete a booking', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    // Get lawyer's userId
    const meRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    const { user: lawyer } = await meRes.json();

    // Client creates a consultation booking
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(14, 0, 0, 0);

    const createRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyer.id,
        type: 'consultation',
        scheduledAt: tomorrow.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(createRes.status()).toBe(201);
    const { booking } = await createRes.json();
    expect(booking.status).toBe('pending');

    // Lawyer confirms the booking
    const confirmRes = await page.request.patch(`/api/bookings/${booking.id}/confirm`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    expect(confirmRes.ok()).toBe(true);
    const confirmed = await confirmRes.json();
    expect(confirmed.booking.status).toBe('confirmed');

    // Lawyer completes the booking
    const completeRes = await page.request.patch(`/api/bookings/${booking.id}/complete`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    expect(completeRes.ok()).toBe(true);
    const completed = await completeRes.json();
    expect(completed.booking.status).toBe('completed');
  });

  test('lawyer can decline a booking', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    const meRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    const { user: lawyer } = await meRes.json();

    const day = new Date(Date.now() + 5 * 86400000);
    day.setHours(15, 0, 0, 0);

    const createRes = await page.request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        lawyerId: lawyer.id,
        type: 'consultation',
        scheduledAt: day.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    const { booking } = await createRes.json();

    const declineRes = await page.request.patch(`/api/bookings/${booking.id}/decline`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    expect(declineRes.ok()).toBe(true);
    const declined = await declineRes.json();
    expect(declined.booking.status).toBe('declined');
  });
});
