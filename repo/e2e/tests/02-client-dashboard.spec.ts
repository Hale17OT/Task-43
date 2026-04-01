import { test, expect } from '@playwright/test';
import { login, waitForShell } from './helpers';

test.describe('Client Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);
  });

  test('displays credit score', async ({ page }) => {
    // Wait for the dashboard content to load
    await expect(page.locator('h2')).toContainText('Welcome', { timeout: 10000 });
    const bodyText = await page.locator('body').textContent() ?? '';
    // client1 has a credit score - just verify the gauge exists with a number
    expect(bodyText).toContain('/ 100');
  });

  test('displays upcoming bookings section', async ({ page }) => {
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toContain('Booking');
  });

  test('displays policy banners', async ({ page }) => {
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    // Policy banners mention no-show and cancellation
    expect(bodyText?.toLowerCase()).toContain('no-show');
  });

  test('sidebar shows correct nav items for client role', async ({ page }) => {
    const navItems = page.locator('.nav-item');
    const labels = await navItems.allTextContents();
    const trimmed = labels.map(l => l.trim());

    expect(trimmed).toContain('Dashboard');
    expect(trimmed).toContain('Bookings');
    expect(trimmed).toContain('Credit Score');
    expect(trimmed).toContain('Reviews');
    expect(trimmed).toContain('Notifications');
    // Should NOT have admin-only items
    expect(trimmed).not.toContain('Jobs');
    expect(trimmed).not.toContain('Arbitration');
    expect(trimmed).not.toContain('Users');
  });

  test('sidebar shows username and role', async ({ page }) => {
    await expect(page.locator('.username')).toContainText('client1');
    await expect(page.locator('.role-label')).toContainText('client');
  });
});
