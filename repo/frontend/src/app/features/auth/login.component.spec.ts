import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  const authSpy = {
    currentUser: () => null,
    isLoggedIn: () => false,
    userRole: () => null,
    menuPermissions: () => [],
    getToken: () => null,
    hasPermission: () => false,
    getDefaultRoute: () => '/client/dashboard',
    handleLoginSuccess: jasmine.createSpy('handleLoginSuccess'),
    clearSession: () => {},
    logout: () => {},
    login: jasmine.createSpy('login'),
    waitForSessionReady: () => Promise.resolve(true),
  };

  beforeEach(async () => {
    authSpy.handleLoginSuccess.calls.reset();
    authSpy.login.calls.reset();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    if (component) component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.lockoutSeconds).toBe(0);
  });

  it('shows error message on 401', fakeAsync(() => {
    authSpy.login.and.returnValue(of(null).pipe(
      // Simulate error via subscriber
    ));
    // Use direct method approach
    component.username = 'baduser';
    component.password = 'badpass';

    authSpy.login.and.returnValue({
      subscribe: (handlers: any) => {
        handlers.error({ status: 401, error: { message: 'Invalid' } });
        return { unsubscribe: () => {} };
      },
    });
    component.onSubmit();
    tick();

    expect(component.errorMessage).toBe('Invalid username or password.');
    expect(component.loading).toBeFalse();
    expect(component.lockoutSeconds).toBe(0);
  }));

  it('starts lockout countdown on 401 with retryAfterSeconds', fakeAsync(() => {
    component.username = 'lockeduser';
    component.password = 'anypass';

    authSpy.login.and.returnValue({
      subscribe: (handlers: any) => {
        handlers.error({
          status: 401,
          error: { message: 'Account locked', retryAfterSeconds: 30 },
        });
        return { unsubscribe: () => {} };
      },
    });
    component.onSubmit();
    tick();

    expect(component.lockoutSeconds).toBe(30);
    expect(component.loading).toBeFalse();

    // Verify countdown decrements
    tick(1000);
    expect(component.lockoutSeconds).toBe(29);

    tick(1000);
    expect(component.lockoutSeconds).toBe(28);

    // Clean up timer
    discardPeriodicTasks();
  }));

  it('lockout countdown reaches zero and stops', fakeAsync(() => {
    component.username = 'lockeduser';
    component.password = 'anypass';

    authSpy.login.and.returnValue({
      subscribe: (handlers: any) => {
        handlers.error({
          status: 401,
          error: { message: 'Account locked', retryAfterSeconds: 2 },
        });
        return { unsubscribe: () => {} };
      },
    });
    component.onSubmit();
    tick();

    expect(component.lockoutSeconds).toBe(2);
    tick(1000);
    expect(component.lockoutSeconds).toBe(1);
    tick(1000);
    expect(component.lockoutSeconds).toBe(0);

    // No more ticks should change it
    tick(1000);
    expect(component.lockoutSeconds).toBe(0);
  }));

  it('navigates on successful login', fakeAsync(() => {
    spyOn(router, 'navigate');
    component.username = 'client1';
    component.password = 'SecurePass1!';

    const mockResponse = {
      token: 'jwt', user: { id: '1', role: 'client' },
      menuPermissions: [], serverTime: '',
    };
    authSpy.login.and.returnValue({
      subscribe: (handlers: any) => {
        handlers.next(mockResponse);
        return { unsubscribe: () => {} };
      },
    });
    component.onSubmit();
    tick();

    expect(authSpy.handleLoginSuccess).toHaveBeenCalledWith(mockResponse);
    expect(router.navigate).toHaveBeenCalledWith(['/client/dashboard']);
    expect(component.loading).toBeFalse();
  }));
});
