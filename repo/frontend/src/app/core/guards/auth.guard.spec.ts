import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard, roleGuard, permissionGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('Auth Guards', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [
      'isLoggedIn', 'userRole', 'getDefaultRoute', 'waitForSessionReady', 'hasPermission',
    ]);
    // waitForSessionReady resolves immediately in tests
    authServiceSpy.waitForSessionReady.and.returnValue(Promise.resolve(true));
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  describe('authGuard', () => {
    it('should return true when user is logged in', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(true);
      const result = await TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeTrue();
    });

    it('should navigate to /login and return false when not logged in', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(false);
      const result = await TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('roleGuard', () => {
    it('should return true when user has allowed role', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(true);
      authServiceSpy.userRole.and.returnValue('client');
      const guard = roleGuard('client');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeTrue();
    });

    it('should redirect with denied message when user has wrong role', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(true);
      authServiceSpy.userRole.and.returnValue('client');
      authServiceSpy.getDefaultRoute.and.returnValue('/client/dashboard');
      const guard = roleGuard('admin');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(
        ['/client/dashboard'],
        { queryParams: { denied: 'Access restricted: requires admin role' } }
      );
    });

    it('should accept multiple roles', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(true);
      authServiceSpy.userRole.and.returnValue('super_admin');
      const guard = roleGuard('admin', 'super_admin');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeTrue();
    });

    it('should redirect to login when not logged in', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(false);
      const guard = roleGuard('client');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should wait for session validation before checking role', async () => {
      // Simulate delayed session validation
      let resolveReady!: (v: boolean) => void;
      authServiceSpy.waitForSessionReady.and.returnValue(
        new Promise<boolean>(r => { resolveReady = r; })
      );
      authServiceSpy.isLoggedIn.and.returnValue(true);
      authServiceSpy.userRole.and.returnValue('admin');

      const guard = roleGuard('admin');
      const resultPromise = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      ) as Promise<boolean>;

      // Guard should not have resolved yet
      let resolved = false;
      resultPromise.then(() => { resolved = true; });
      await Promise.resolve(); // flush microtasks
      expect(resolved).toBeFalse();

      // Now resolve session validation
      resolveReady(true);
      const result = await resultPromise;
      expect(result).toBeTrue();
    });
  });

  describe('permissionGuard', () => {
    it('should allow when role and permission match', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(true);
      authServiceSpy.userRole.and.returnValue('admin');
      authServiceSpy.hasPermission.and.callFake((p: string) => p === 'admin.jobs');
      const guard = permissionGuard('admin.jobs', 'admin', 'super_admin');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeTrue();
    });

    it('should deny when role matches but permission is missing', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(true);
      authServiceSpy.userRole.and.returnValue('admin');
      authServiceSpy.getDefaultRoute.and.returnValue('/admin/dashboard');
      authServiceSpy.hasPermission.and.returnValue(false);
      const guard = permissionGuard('admin.organizations', 'admin', 'super_admin');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(
        ['/admin/dashboard'],
        { queryParams: { denied: jasmine.stringContaining('missing') } }
      );
    });

    it('should deny when role does not match', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(true);
      authServiceSpy.userRole.and.returnValue('client');
      authServiceSpy.getDefaultRoute.and.returnValue('/client/dashboard');
      const guard = permissionGuard('admin.jobs', 'admin', 'super_admin');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeFalse();
    });

    it('should redirect to login when not logged in', async () => {
      authServiceSpy.isLoggedIn.and.returnValue(false);
      const guard = permissionGuard('client.dashboard', 'client');
      const result = await TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
      );
      expect(result).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
