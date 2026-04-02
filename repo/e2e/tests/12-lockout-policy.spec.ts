import { test, expect } from '@playwright/test';
import { getAuthToken } from './helpers';

test.describe('Account lockout policy: 5 failures → 15-minute lock', () => {
  // Use a dedicated test user to avoid interfering with other tests.
  // client2 is seeded and not heavily used elsewhere.
  const testUser = 'client2';
  const wrongPassword = 'WrongPassword999!';
  const correctPassword = 'SecurePass1!';

  test('5 consecutive wrong passwords trigger lockout with ~900s retry', async ({ page }) => {
    // First, ensure the account is unlocked by logging in successfully
    const unlockRes = await page.request.post('/api/auth/login', {
      data: { username: testUser, password: correctPassword },
    });
    // Account may already be locked from a prior run; if locked it returns 401 with retryAfterSeconds
    const unlockBody = await unlockRes.json().catch(() => ({}));
    if (unlockRes.status() === 401 && unlockBody.retryAfterSeconds) {
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

      // All attempts return 401 (unified response prevents account enumeration)
      expect(res.status()).toBe(401);

      if (i === 5) {
        // Attempt 5: should include retryAfterSeconds indicating lockout
        const body = await res.json();
        expect(body.retryAfterSeconds).toBeDefined();
        // Should be approximately 900 seconds (15 minutes)
        expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(890);
        expect(body.retryAfterSeconds).toBeLessThanOrEqual(900);
      }
    }

    // Verify account is now locked — even correct password should fail with 401 + retryAfterSeconds
    const lockedRes = await page.request.post('/api/auth/login', {
      data: { username: testUser, password: correctPassword },
    });
    expect(lockedRes.status()).toBe(401);
    const lockedBody = await lockedRes.json();
    expect(lockedBody.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('UI displays lockout countdown when server returns 401 with retryAfterSeconds', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    // First ensure account is accessible
    const checkRes = await page.request.post('/api/auth/login', {
      data: { username: testUser, password: correctPassword },
    });
    const checkBody = await checkRes.json().catch(() => ({}));
    if (checkRes.status() === 401 && checkBody.retryAfterSeconds) {
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
    // Look for the lockout text (401 with retryAfterSeconds handler shows countdown)
    await expect(page.locator('text=/locked|try again/i').first()).toBeVisible({ timeout: 5000 });
  });
});
