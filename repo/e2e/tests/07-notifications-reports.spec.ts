import { test, expect } from '@playwright/test';
import { login, waitForShell, getAuthToken } from './helpers';

test.describe('Notifications UI', () => {
  test('notification inbox page loads', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);

    await page.locator('a[href="/notifications"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Notification');
  });
});

test.describe('Notifications API', () => {
  test('fetches notifications for authenticated user', async ({ page }) => {
    const token = await getAuthToken(page, 'client1');
    const res = await page.request.get('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('unreadCount');
  });
});

test.describe('Reports UI', () => {
  test('report viewer loads for admin', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'admin1');
    await waitForShell(page);

    await page.locator('a[href="/reports"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Report');
  });

  test('subscription manager loads for admin', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'admin1');
    await waitForShell(page);

    await page.locator('a[href="/reports/subscriptions"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Subscription');
  });
});

test.describe('Reports API', () => {
  test('admin can fetch dashboard metrics', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');
    const res = await page.request.get('/api/reports/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('availability');
    expect(body).toHaveProperty('faultRate');
    expect(body).toHaveProperty('utilization');
    expect(body).toHaveProperty('throughput');
    expect(body).toHaveProperty('closedLoopEfficiency');
    expect(body).toHaveProperty('period');
  });

  test('admin can export report as CSV', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');
    const res = await page.request.get('/api/reports/export?format=csv', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('text/csv');
  });

  test('admin can manage report subscriptions', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');

    // Create subscription
    const createRes = await page.request.post('/api/report-subscriptions', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reportType: 'weekly_utilization',
        filters: { role: 'lawyer' },
      },
    });
    expect(createRes.status()).toBe(201);
    const { subscription } = await createRes.json();
    expect(subscription.report_type).toBe('weekly_utilization');

    // List subscriptions
    const listRes = await page.request.get('/api/report-subscriptions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok()).toBe(true);
    const listBody = await listRes.json();
    expect(listBody.data.length).toBeGreaterThan(0);

    // Delete subscription
    const delRes = await page.request.delete(`/api/report-subscriptions/${subscription.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status()).toBe(204);
  });

  test('client cannot access reports', async ({ page }) => {
    const token = await getAuthToken(page, 'client1');
    const res = await page.request.get('/api/reports/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });
});
