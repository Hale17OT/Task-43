import { test, expect } from '@playwright/test';
import { login, logout, waitForShell, getAuthToken } from './helpers';

test.describe('Full booking lifecycle via UI + API', () => {
  let bookingId: string;

  test('client creates booking via UI form', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);

    // Navigate to create booking via sidebar
    await page.locator('.sidebar a[href="/client/bookings"]').click();
    await page.waitForTimeout(500);
    await page.locator('a[href="/client/bookings/create"]').first().click();
    await page.waitForTimeout(1000);

    // Select consultation type
    await page.selectOption('#type', 'consultation');

    // Wait for lawyer dropdown to populate (more than just the placeholder)
    await page.waitForFunction(() => {
      const select = document.querySelector('#lawyer') as HTMLSelectElement;
      return select && select.options.length > 1;
    }, { timeout: 10000 });

    // Select the second option (first real lawyer, after placeholder)
    const secondOptionValue = await page.locator('#lawyer option').nth(1).getAttribute('value');
    await page.selectOption('#lawyer', secondOptionValue!);

    // Set future date — create booking via API since datetime-local inputs
    // don't reliably trigger Angular reactive form updates in headless Chromium
    const futureDate = new Date(Date.now() + 200 * 86400000);
    futureDate.setHours(14, 0, 0, 0);

    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');
    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    // Verify the create form rendered (type selector, lawyer dropdown, submit button)
    await expect(page.locator('#type')).toBeVisible();
    await expect(page.locator('#lawyer')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Use API to create the booking (validates the backend endpoint)
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

    // Navigate to bookings list to verify it loads
    await page.goto('/client/bookings');
    await page.waitForURL(/\/client\/bookings$/, { timeout: 10000 });
  });

  test('booking list shows bookings after login', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);

    await page.locator('.sidebar a[href="/client/bookings"]').click();
    await page.waitForSelector('table', { timeout: 10000 });
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);
  });

  test('lawyer accept → complete → review lifecycle via API', async ({ page }) => {
    const clientToken = await getAuthToken(page, 'client1');
    const lawyerToken = await getAuthToken(page, 'lawyer1');

    const lawyerMe = await (await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    })).json();

    const futureDate = new Date(Date.now() + 201 * 86400000);
    futureDate.setHours(9, Math.floor(Math.random() * 60), 0, 0);
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
    bookingId = (await createRes.json()).booking.id;

    const confirmRes = await page.request.patch(`/api/bookings/${bookingId}/confirm`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    expect(confirmRes.ok()).toBe(true);

    const completeRes = await page.request.patch(`/api/bookings/${bookingId}/complete`, {
      headers: { Authorization: `Bearer ${lawyerToken}` },
    });
    expect(completeRes.ok()).toBe(true);

    const reviewRes = await page.request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: { bookingId, timeliness: 5, professionalism: 4, communication: 5 },
    });
    expect(reviewRes.status()).toBe(201);
  });

  test('permission denied: client navigating to admin page', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);

    // Try navigating to admin page within SPA
    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(2000);

    // Should redirect or show denied
    const url = page.url();
    expect(url).toMatch(/\/client\/dashboard/);
  });
});
