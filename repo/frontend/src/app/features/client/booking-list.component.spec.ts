import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BookingListComponent } from './booking-list.component';
import { AuthService } from '../../core/services/auth.service';
import { TimeSyncService } from '../../core/services/time-sync.service';

describe('BookingListComponent', () => {
  let component: BookingListComponent;
  let fixture: ComponentFixture<BookingListComponent>;
  let httpMock: HttpTestingController;

  const authSpy = {
    currentUser: () => ({ id: 'user-1', orgId: 'org-1', username: 'client1', role: 'client' as const, creditScore: 80 }),
    isLoggedIn: () => true,
    userRole: () => 'client',
    menuPermissions: () => ['client.dashboard', 'client.bookings'],
    getToken: () => 'mock-token',
    hasPermission: () => true,
    getDefaultRoute: () => '/client/dashboard',
    handleLoginSuccess: () => {},
    clearSession: () => {},
    logout: () => {},
    waitForSessionReady: () => Promise.resolve(true),
  };

  const timeSyncSpy = {
    init: () => {},
    destroy: () => {},
    serverNow: () => new Date(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: TimeSyncService, useValue: timeSyncSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingListComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create and load bookings', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url.includes('/api/bookings'));
    req.flush({ data: [
      { id: 'b1', type: 'consultation', status: 'pending', lawyerId: 'l1', scheduledAt: '2026-06-01T10:00:00Z', clientId: 'user-1' },
    ], total: 1 });
    expect(component.bookings.length).toBe(1);
  });

  it('opens reschedule modal instead of prompt', () => {
    fixture.detectChanges();
    httpMock.expectOne(r => r.url.includes('/api/bookings')).flush({
      data: [{ id: 'b1', type: 'consultation', status: 'pending', lawyerId: 'l1', scheduledAt: '2026-06-01T10:00:00Z' }],
      total: 1,
    });
    const booking = component.bookings[0];
    component.openReschedule(booking);
    expect(component.rescheduleTarget).toBe(booking);
    expect(component.rescheduleDate).toBe('');
  });

  it('validates reschedule date before submitting', () => {
    fixture.detectChanges();
    httpMock.expectOne(r => r.url.includes('/api/bookings')).flush({ data: [
      { id: 'b1', type: 'consultation', status: 'pending', lawyerId: 'l1', scheduledAt: '2026-06-01T10:00:00Z' },
    ], total: 1 });

    component.rescheduleTarget = component.bookings[0];
    component.rescheduleDate = 'invalid-date';
    component.doReschedule();
    expect(component.rescheduleError).toContain('valid date');

    component.rescheduleDate = '2020-01-01T10:00';
    component.doReschedule();
    expect(component.rescheduleError).toContain('future');
  });

  it('shows error banner on cancel failure', fakeAsync(() => {
    fixture.detectChanges();
    httpMock.expectOne(r => r.url.includes('/api/bookings')).flush({ data: [
      { id: 'b1', type: 'consultation', status: 'confirmed', lawyerId: 'l1', scheduledAt: '2026-06-01T10:00:00Z' },
    ], total: 1 });

    component.cancelTarget = component.bookings[0];
    component.doCancel();
    const req = httpMock.expectOne(r => r.url.includes('/cancel'));
    req.flush({ error: 'CONFLICT', message: 'Cannot cancel' }, { status: 409, statusText: 'Conflict' });
    tick();
    expect(component.actionError).toContain('Cannot cancel');
  }));

  it('shows error banner on reschedule failure', fakeAsync(() => {
    fixture.detectChanges();
    httpMock.expectOne(r => r.url.includes('/api/bookings')).flush({ data: [
      { id: 'b1', type: 'consultation', status: 'pending', lawyerId: 'l1', scheduledAt: '2026-06-01T10:00:00Z' },
    ], total: 1 });

    component.rescheduleTarget = component.bookings[0];
    component.rescheduleDate = '2027-01-01T10:00';
    component.doReschedule();

    const req = httpMock.expectOne(r => r.url.includes('/reschedule'));
    req.flush({ error: 'CONFLICT', message: 'Slot unavailable' }, { status: 409, statusText: 'Conflict' });
    tick();
    expect(component.rescheduleError).toContain('Slot unavailable');
  }));
});
