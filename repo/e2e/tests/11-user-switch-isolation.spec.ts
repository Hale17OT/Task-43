import { test, expect } from '@playwright/test';
import { login, logout, waitForShell } from './helpers';

test.describe('User-switch state isolation', () => {
  test('no stale data from user A visible after logout and login as user B', async ({ page }) => {
    // Step 1: Login as client1
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'client1');
    await waitForShell(page);

    // Verify client1 sidebar context
    const sidebarText = await page.locator('.sidebar').textContent();
    expect(sidebarText).toContain('client1');

    // Step 2: Logout
    await logout(page);

    // Step 3: Login as lawyer1
    await login(page, 'lawyer1');
    await waitForShell(page);

    // Step 4: Assert NO client1 data in lawyer1's session
    const lawyerSidebar = await page.locator('.sidebar').textContent();
    expect(lawyerSidebar).toContain('lawyer1');
    expect(lawyerSidebar).not.toContain('client1');

    // Lawyer nav should show lawyer items
    expect(lawyerSidebar).toContain('Availability');
    expect(lawyerSidebar).not.toContain('Credit Score');

    // Step 5: Logout and login as admin
    await logout(page);
    await login(page, 'admin1');
    await waitForShell(page);

    const adminSidebar = await page.locator('.sidebar').textContent();
    expect(adminSidebar).toContain('admin1');
    expect(adminSidebar).not.toContain('lawyer1');
    expect(adminSidebar).not.toContain('client1');
    expect(adminSidebar).toContain('Jobs');
    expect(adminSidebar).not.toContain('Availability');
  });
});
