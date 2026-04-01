# JusticeOps Frontend

Angular 19 role-based UI for the JusticeOps legal services platform. Supports Client, Lawyer, Admin, and Super Admin workspaces.

## Prerequisites

- Node.js 20+
- Backend API running on `http://localhost:3000` (see root `README.md` for setup)

## Development

```bash
npm install --legacy-peer-deps
npm start
```

The dev server starts on `http://localhost:4200` and proxies `/api/*` requests to the backend via `proxy.conf.json`.

### Seed Accounts

All seeded users use password `SecurePass1!`:

| Username   | Role        | Workspace          |
|------------|-------------|---------------------|
| client1    | client      | /client/dashboard   |
| lawyer1    | lawyer      | /lawyer/dashboard   |
| admin1     | admin       | /admin/dashboard    |
| superadmin | super_admin | /admin/dashboard    |

## Building

```bash
npm run build
```

Output is generated to `dist/frontend`.

## Testing

### Unit Tests

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

### E2E Tests (Playwright)

E2E tests require the full stack (backend + PostgreSQL). See root `README.md` for Docker or local setup instructions.

```bash
cd ../e2e
npm install
npx playwright install chromium
npx playwright test
```

## Architecture

```
src/app/
  core/          # Auth service, guards, interceptors, models
  features/      # Client, Lawyer, Admin, Reviews, Reports, Notifications, Config
  layout/        # Shell, sidebar, header
  shared/        # Star rating, shimmer loader, policy banner, notification bell, export button
```

### Key Patterns

- **Standalone components** with lazy-loaded routes
- **Permission-aware route guards** checking both role and menu permission
- **Server-validated session** on bootstrap via `/api/auth/me`
- **Time sync** with backend for policy timing (cancellation windows)
- **Notification polling** (30s interval) with logout cleanup

### Security Posture

**Token storage:** JWT is stored in `localStorage` per prompt requirements for locally-persisted signed session tokens. This is inherently XSS-sensitive by design.

**Mitigations in place:**
- Strict Content-Type enforcement via Angular's built-in XSS sanitization on template bindings
- Auth interceptor attaches token only to API requests (not external URLs)
- Server-side 24-hour token expiry with session-nonce revocation on new login
- Lockout policy: 5 failed login attempts trigger a 15-minute account lock (server-enforced)
- Logout clears all client state: token, user, permissions, notification cache, time sync

**Hardening recommendations for production:**
- Deploy with strict Content-Security-Policy headers (no `unsafe-inline`, no `unsafe-eval`)
- Consider `HttpOnly` cookie-based token storage if XSS risk profile increases
- Enable Subresource Integrity (SRI) for CDN-served assets
- Monitor for DOM-based XSS via security scanning in CI
- Keep Angular and dependencies up to date for security patches
