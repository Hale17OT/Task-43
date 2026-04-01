import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for server-side session validation before checking auth state
  await authService.waitForSessionReady();

  if (authService.isLoggedIn()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

export function roleGuard(...allowedRoles: string[]): CanActivateFn {
  return async () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Wait for server-side session validation so role comes from
    // trusted /api/auth/me response, not mutable localStorage
    await authService.waitForSessionReady();

    if (!authService.isLoggedIn()) {
      router.navigate(['/login']);
      return false;
    }

    const role = authService.userRole();
    if (role && allowedRoles.includes(role)) {
      return true;
    }

    const requiredRoles = allowedRoles.join(' or ');
    router.navigate([authService.getDefaultRoute()], {
      queryParams: { denied: `Access restricted: requires ${requiredRoles} role` },
    });
    return false;
  };
}

/**
 * Permission-aware guard that checks both role and specific menu permission.
 * Use on routes where sidebar visibility is permission-gated.
 */
export function permissionGuard(permission: string, ...allowedRoles: string[]): CanActivateFn {
  return async () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    await authService.waitForSessionReady();

    if (!authService.isLoggedIn()) {
      router.navigate(['/login']);
      return false;
    }

    const role = authService.userRole();
    if (!role || !allowedRoles.includes(role)) {
      router.navigate([authService.getDefaultRoute()], {
        queryParams: { denied: `Access restricted: requires ${allowedRoles.join(' or ')} role` },
      });
      return false;
    }

    if (!authService.hasPermission(permission)) {
      router.navigate([authService.getDefaultRoute()], {
        queryParams: { denied: `Access restricted: missing ${permission} permission` },
      });
      return false;
    }

    return true;
  };
}
