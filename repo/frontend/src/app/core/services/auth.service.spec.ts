import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { TimeSyncService } from './time-sync.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;
  let timeSyncSpy: jasmine.SpyObj<TimeSyncService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    timeSyncSpy = jasmine.createSpyObj('TimeSyncService', ['init', 'destroy']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['reset']);
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
        { provide: TimeSyncService, useValue: timeSyncSpy },
        { provide: NotificationService, useValue: notificationSpy },
        AuthService,
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('login() should POST to /api/auth/login', () => {
    service.login('testuser', 'testpass').subscribe();
    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'testuser', password: 'testpass' });
    req.flush({ token: 'jwt', user: { id: '1', role: 'client' }, menuPermissions: [], serverTime: '' });
  });

  it('handleLoginSuccess() should store token and user', () => {
    const response = {
      token: 'jwt-token-123',
      user: { id: '1', orgId: 'org-1', username: 'user1', role: 'client' as const, creditScore: 50 },
      menuPermissions: ['client.dashboard', 'client.bookings'],
      serverTime: new Date().toISOString(),
    };
    service.handleLoginSuccess(response);

    expect(service.getToken()).toBe('jwt-token-123');
    expect(service.currentUser()).toEqual(response.user);
    expect(service.isLoggedIn()).toBeTrue();
    expect(service.userRole()).toBe('client');
    expect(service.menuPermissions()).toEqual(['client.dashboard', 'client.bookings']);
  });

  it('clearSession() should clear storage and navigate to /login', () => {
    localStorage.setItem('justiceops_token', 'token');
    localStorage.setItem('justiceops_user', '{}');
    service.clearSession();

    expect(service.getToken()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isLoggedIn()).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('getDefaultRoute() should return correct route per role', () => {
    service.handleLoginSuccess({
      token: 't', user: { id: '1', orgId: 'o', username: 'u', role: 'client', creditScore: 50 },
      menuPermissions: [], serverTime: '',
    });
    expect(service.getDefaultRoute()).toBe('/client/dashboard');

    service.handleLoginSuccess({
      token: 't', user: { id: '1', orgId: 'o', username: 'u', role: 'lawyer', creditScore: 50 },
      menuPermissions: [], serverTime: '',
    });
    expect(service.getDefaultRoute()).toBe('/lawyer/dashboard');

    service.handleLoginSuccess({
      token: 't', user: { id: '1', orgId: 'o', username: 'u', role: 'admin', creditScore: 50 },
      menuPermissions: [], serverTime: '',
    });
    expect(service.getDefaultRoute()).toBe('/admin/dashboard');
  });

  it('hasPermission() should check menuPermissions', () => {
    service.handleLoginSuccess({
      token: 't', user: { id: '1', orgId: 'o', username: 'u', role: 'client', creditScore: 50 },
      menuPermissions: ['client.dashboard', 'reviews'], serverTime: '',
    });
    expect(service.hasPermission('client.dashboard')).toBeTrue();
    expect(service.hasPermission('reviews')).toBeTrue();
    expect(service.hasPermission('admin.users')).toBeFalse();
  });
});
