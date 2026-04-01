import { test, expect } from '@playwright/test';
import { login, waitForShell, getAuthToken } from './helpers';

test.describe('Admin Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'admin1');
    await waitForShell(page);
  });

  test('admin dashboard shows 5 metric cards', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('.metric-card')).toHaveCount(5, { timeout: 10000 });
    // Verify metric labels
    const labels = await page.locator('.metric-label').allTextContents();
    expect(labels).toContain('Availability');
    expect(labels).toContain('Fault Rate');
    expect(labels).toContain('Utilization');
    expect(labels).toContain('Throughput');
    expect(labels).toContain('Closed-Loop Efficiency');
  });

  test('admin sidebar shows correct nav items', async ({ page }) => {
    const labels = await page.locator('.nav-item').allTextContents();
    const trimmed = labels.map(l => l.trim());
    expect(trimmed).toContain('Dashboard');
    expect(trimmed).toContain('Jobs');
    expect(trimmed).toContain('Arbitration');
    expect(trimmed).toContain('Users');
    // Admin (not super_admin) should NOT see Organizations
    expect(trimmed).not.toContain('Organizations');
  });

  test('job monitor page loads', async ({ page }) => {
    await page.locator('a[href="/admin/jobs"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Job');
  });

  test('arbitration page loads', async ({ page }) => {
    await page.locator('a[href="/admin/arbitration"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Arbitration');
  });

  test('user management page loads', async ({ page }) => {
    await page.locator('a[href="/admin/users"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toContainText('User');
  });
});

test.describe('Super Admin Extra Capabilities', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'superadmin');
    await waitForShell(page);
  });

  test('super_admin sees Organizations nav item', async ({ page }) => {
    const labels = await page.locator('.nav-item').allTextContents();
    expect(labels.map(l => l.trim())).toContain('Organizations');
  });

  test('org management page loads', async ({ page }) => {
    await page.locator('a[href="/admin/organizations"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('h2')).toContainText('Organization');
  });

  test('admin dashboard shows org filter for super_admin', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    // Super admin should see the org dropdown
    await expect(page.locator('select[formcontrolname="orgId"], select').first()).toBeVisible();
  });
});

test.describe('Admin API: User Management', () => {
  test('admin can list users', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');
    const res = await page.request.get('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    // All users should be in the same org as admin1
    for (const user of body.data) {
      expect(user.orgId).toBe(body.data[0].orgId);
    }
  });

  test('admin can create a new user', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');

    // Get admin's org
    const meRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { user: admin } = await meRes.json();

    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const res = await page.request.post('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: `e2e_client_${randomSuffix}`,
        password: 'E2eTestPass1!@#',
        role: 'client',
        orgId: admin.orgId,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user.username).toBe(`e2e_client_${randomSuffix}`);
    expect(body.user.role).toBe('client');
  });

  test('admin cannot create a user with weak password', async ({ page }) => {
    const token = await getAuthToken(page, 'admin1');
    const meRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { user: admin } = await meRes.json();

    const res = await page.request.post('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: 'weakpassuser',
        password: 'short',
        role: 'client',
        orgId: admin.orgId,
      },
    });
    expect(res.status()).toBe(422);
  });
});
