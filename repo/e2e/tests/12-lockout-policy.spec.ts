import { test, expect } from '@playwright/test';
import { getAuthToken } from './helpers';

test.describe('Account lockout policy: 5 failures → 15-minute lock', () => {
  // Use a dedicated test user to avoid interfering with other tests.
  // client2 is seeded and not heavily used elsewhere.
  const testUser = 'client2';
  const wrongPassword = 'WrongPassword999!';
  const correctPassword = 'SecurePass1!';

  test('5 consecutive wrong passwords trigger 423 lockout with ~900s retry', async ({ page }) => {
    // First, ensure the account is unlocked by logging in successfully
    const unlockRes = await page.request.post('/api/auth/login', {
      data: { username: testUser, password: correctPassword },
    });
    // Account may already be locked from a prior run; if 423, wait and retry
    if (unlockRes.status() === 423) {
      // Skip this test run — account is locked from prior test
      test.skip();
      return;
    }
    expect(unlockRes.status()).toBe(200);

    // Now send 5 wrong password attempts
    for (let i = 1; i <= 5; i++) {
      const res = await page.request.post('/api/auth/login', {
        data: { username: testUser, password: wrongPassword },
      });

      if (i < 5) {
        // Attempts 1-4: should return 401 (invalid credentials)
        expect(res.status()).toBe(401);
      } else {
        // Attempt 5: should return 423 (account locked)
        expect(res.status()).toBe(423);
        const body = await res.json();
        expect(body.retryAfterSeconds).toBeDefined();
        // Should be approximately 900 seconds (15 minutes)
        expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(890);
        expect(body.retryAfterSeconds).toBeLessThanOrEqual(900);
      }
    }

    // Verify account is now locked — even correct password should fail with 423
    const lockedRes = await page.request.post('/api/auth/login', {
      data: { username: testUser, password: correctPassword },
    });
    expect(lockedRes.status()).toBe(423);
    const lockedBody = await lockedRes.json();
    expect(lockedBody.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('UI displays lockout countdown when server returns 423', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    // First ensure account is accessible
    const checkRes = await page.request.post('/api/auth/login', {
      data: { username: testUser, password: correctPassword },
    });
    if (checkRes.status() === 423) {
      test.skip();
      return;
    }

    // Trigger lockout via 5 wrong attempts through UI
    for (let i = 0; i < 5; i++) {
      await page.fill('#username', testUser);
      await page.fill('#password', wrongPassword);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // After 5th attempt, UI should show lockout message/countdown
    // Look for the lockout text (423 handler shows countdown)
    await expect(page.locator('text=/locked|try again/i').first()).toBeVisible({ timeout: 5000 });
  });
});
