import { Page, expect } from '@playwright/test';

const TEST_PASSWORD = 'SecurePass1!';

// Cache tokens per user to avoid revoking sessions with repeated logins
const tokenCache: Record<string, string> = {};

/**
 * Log in as a given seeded user via UI and wait for redirect.
 */
export async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.waitForSelector('#username');

  await page.fill('#username', username);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for the login to complete and navigate away from /login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });

  // Invalidate cached token since UI login revokes previous sessions
  delete tokenCache[username];
}

/**
 * Log out via the sidebar button.
 */
export async function logout(page: Page) {
  await page.click('.logout-btn');
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
}

/**
 * Login and get the JWT token for direct API calls.
 * Caches tokens to avoid unnecessary session revocation.
 */
export async function getAuthToken(page: Page, username: string): Promise<string> {
  if (tokenCache[username]) {
    // Verify the cached token still works
    const checkRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenCache[username]}` },
    });
    if (checkRes.ok()) {
      return tokenCache[username];
    }
    // Token expired or revoked — get a fresh one
    delete tokenCache[username];
  }

  const response = await page.request.post('/api/auth/login', {
    data: { username, password: TEST_PASSWORD },
  });
  const body = await response.json();
  tokenCache[username] = body.token;
  return body.token;
}

/**
 * Wait for the sidebar to appear (indicates authenticated shell loaded).
 */
export async function waitForShell(page: Page) {
  await page.waitForSelector('.sidebar', { timeout: 10000 });
}

/**
 * Navigate within the Angular SPA without triggering a full page reload.
 * This avoids session re-validation issues from full reloads.
 * Falls back to page.goto if SPA navigation fails.
 */
export async function navigateTo(page: Page, path: string) {
  try {
    await page.evaluate((p) => {
      const router = (window as any).ng?.getComponent(document.querySelector('app-root'))?.router;
      if (router) {
        router.navigateByUrl(p);
        return;
      }
      // Fallback: use Angular's injector
      const appRef = (window as any).ng?.coreTokens?.ApplicationRef;
      if (appRef) {
        const injector = appRef._injector || appRef.injector;
        const r = injector.get((window as any).ng?.coreTokens?.Router);
        if (r) { r.navigateByUrl(p); return; }
      }
      // Last resort: location change (still SPA-aware in Angular)
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForTimeout(500);
  } catch {
    // Fallback to full navigation
    await page.goto(path);
  }
}
