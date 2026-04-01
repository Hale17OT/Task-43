import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { BookingCreateComponent } from './booking-create.component';
import { AuthService } from '../../core/services/auth.service';
import { IdempotencyService } from '../../core/services/idempotency.service';

describe('BookingCreateComponent', () => {
  let component: BookingCreateComponent;
  let fixture: ComponentFixture<BookingCreateComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  const authSpy = {
    currentUser: () => ({ id: 'user-1', orgId: 'org-1', username: 'client1', role: 'client' as const, creditScore: 80 }),
    isLoggedIn: () => true,
    userRole: () => 'client',
    menuPermissions: () => ['client.dashboard', 'client.bookings'],
    getToken: () => 'mock-token',
    handleLoginSuccess: () => {},
    clearSession: () => {},
    logout: () => {},
    hasPermission: (p: string) => true,
    getDefaultRoute: () => '/client/dashboard',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingCreateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        IdempotencyService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingCreateComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    fixture.detectChanges();
    // Flush initial requests
    httpMock.expectOne('/api/credit/user-1').flush({ creditScore: 80 });
    httpMock.expectOne('/api/lawyers').flush({ data: [{ id: 'l1', username: 'lawyer1' }] });
    expect(component).toBeTruthy();
  });

  it('fetches lawyers from /api/lawyers on init', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/credit/user-1').flush({ creditScore: 80 });
    const req = httpMock.expectOne('/api/lawyers');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ id: 'l1', username: 'lawyer1' }, { id: 'l2', username: 'lawyer2' }] });
    expect(component.lawyers.length).toBe(2);
    expect(component.loadingLawyers).toBeFalse();
  });

  it('disables submit when credit score is below 20', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/credit/user-1').flush({ creditScore: 15 });
    httpMock.expectOne('/api/lawyers').flush({ data: [] });
    expect(component.creditScore).toBe(15);
    // onSubmit should bail out
    component.form.patchValue({ lawyerId: 'l1', scheduledAt: '2026-01-01T10:00' });
    component.onSubmit();
    expect(component.submitting).toBeFalse();
  });

  it('submits booking and navigates on success', fakeAsync(() => {
    spyOn(router, 'navigate');
    fixture.detectChanges();
    httpMock.expectOne('/api/credit/user-1').flush({ creditScore: 80 });
    httpMock.expectOne('/api/lawyers').flush({ data: [{ id: 'l1', username: 'lawyer1' }] });

    component.form.patchValue({
      type: 'consultation',
      lawyerId: 'l1',
      scheduledAt: '2026-06-01T10:00',
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/bookings');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.lawyerId).toBe('l1');
    expect(req.request.body.type).toBe('consultation');
    expect(req.request.body.idempotencyKey).toBeTruthy();
    req.flush({ booking: { id: 'b1' } });
    tick();

    expect(component.submitting).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/client/bookings']);
  }));

  it('shows error message on booking failure', fakeAsync(() => {
    fixture.detectChanges();
    httpMock.expectOne('/api/credit/user-1').flush({ creditScore: 80 });
    httpMock.expectOne('/api/lawyers').flush({ data: [{ id: 'l1', username: 'lawyer1' }] });

    component.form.patchValue({ type: 'consultation', lawyerId: 'l1', scheduledAt: '2026-06-01T10:00' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/bookings');
    req.flush({ error: 'CONFLICT', message: 'Time slot unavailable' }, { status: 409, statusText: 'Conflict' });
    tick();

    expect(component.submitting).toBeFalse();
    expect(component.errorMessage).toContain('Time slot unavailable');
  }));

  it('blocks submit when credit API fails (fail-safe)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/credit/user-1').flush(null, { status: 500, statusText: 'Error' });
    httpMock.expectOne('/api/lawyers').flush({ data: [{ id: 'l1', username: 'lawyer1' }] });

    expect(component.creditError).toBeTrue();
    expect(component.creditLoaded).toBeFalse();

    component.form.patchValue({ type: 'consultation', lawyerId: 'l1', scheduledAt: '2026-06-01T10:00' });
    component.onSubmit();
    expect(component.submitting).toBeFalse(); // blocked
  });
});
