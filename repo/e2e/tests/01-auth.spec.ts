import { test, expect } from '@playwright/test';
import { login, logout, waitForShell } from './helpers';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear local storage before each test to ensure clean state
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
  });

  test('shows login page with form fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('JusticeOps');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
    // Password hint visible
    await expect(page.locator('.hint')).toContainText('12+ characters');
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'nonexistent');
    await page.fill('#password', 'WrongPassword1!');
    await page.click('button[type="submit"]');

    // Wait for error message to appear (either class)
    await expect(page.locator('.permission-feedback, .error-message, [class*="error"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('client1 can log in and lands on client dashboard', async ({ page }) => {
    await login(page, 'client1');
    await waitForShell(page);
    await expect(page).toHaveURL(/\/client\/dashboard/);
    await expect(page.locator('h2')).toContainText('Welcome, client1');
  });

  test('lawyer1 can log in and lands on lawyer dashboard', async ({ page }) => {
    await login(page, 'lawyer1');
    await waitForShell(page);
    await expect(page).toHaveURL(/\/lawyer\/dashboard/);
  });

  test('admin1 can log in and lands on admin dashboard', async ({ page }) => {
    await login(page, 'admin1');
    await waitForShell(page);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('h2')).toContainText('Admin Dashboard');
  });

  test('superadmin can log in and lands on admin dashboard', async ({ page }) => {
    await login(page, 'superadmin');
    await waitForShell(page);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('logout redirects to login page', async ({ page }) => {
    await login(page, 'client1');
    await waitForShell(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to protected route redirects to login', async ({ page }) => {
    await page.goto('/client/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('client cannot access admin routes', async ({ page }) => {
    await login(page, 'client1');
    await waitForShell(page);

    // Use SPA navigation to test guard without full page reload
    await page.evaluate(() => window.history.pushState({}, '', '/admin/dashboard'));
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));

    // Guard should redirect client to their own dashboard
    await expect(page).toHaveURL(/\/client\/dashboard/, { timeout: 5000 });

    // Denied feedback banner should appear with access-restricted message
    const banner = page.locator('.permission-denied-banner');
    await expect(banner).toBeVisible({ timeout: 3000 });
    await expect(banner).toContainText('Access restricted');
  });

  test('lawyer cannot access client routes', async ({ page }) => {
    await login(page, 'lawyer1');
    await waitForShell(page);

    await page.evaluate(() => window.history.pushState({}, '', '/client/dashboard'));
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));

    // Guard should redirect lawyer to their own dashboard
    await expect(page).toHaveURL(/\/lawyer\/dashboard/, { timeout: 5000 });

    // Denied feedback banner should appear with access-restricted message
    const banner = page.locator('.permission-denied-banner');
    await expect(banner).toBeVisible({ timeout: 3000 });
    await expect(banner).toContainText('Access restricted');
  });
});
