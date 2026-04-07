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

    // Try navigating to admin route
    await page.goto(page.url().replace(/\/[^/]*$/, '/admin/dashboard'));
    await page.waitForTimeout(2000);
    // Client must be redirected away from admin — either to own dashboard or denied banner shown
    const url = page.url();
    expect(url).not.toMatch(/\/admin\//);
    // Verify we landed on client dashboard (guard redirect)
    expect(url).toContain('/client/dashboard');
  });

  test('lawyer cannot access client routes', async ({ page }) => {
    await login(page, 'lawyer1');
    await waitForShell(page);

    await page.goto(page.url().replace(/\/[^/]*$/, '/client/dashboard'));
    await page.waitForTimeout(2000);
    const url = page.url();
    // Lawyer must be redirected away from client routes
    expect(url).not.toContain('/client/');
    expect(url).toContain('/lawyer/dashboard');
  });
});
