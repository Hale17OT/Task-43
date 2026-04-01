import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NotificationInboxComponent } from './notification-inbox.component';
import { NotificationService } from '../../core/services/notification.service';
import { of, throwError } from 'rxjs';

describe('NotificationInboxComponent', () => {
  let component: NotificationInboxComponent;
  let fixture: ComponentFixture<NotificationInboxComponent>;

  const mockNotifications = [
    { id: 'n1', userId: 'u1', title: 'Test Notif', body: 'Hello', type: 'system', referenceId: null, isRead: false, createdAt: new Date().toISOString() },
  ];

  const notifServiceSpy = {
    fetch: jasmine.createSpy('fetch'),
    reset: jasmine.createSpy('reset'),
    listAll: jasmine.createSpy('listAll').and.returnValue(of({ data: mockNotifications, total: 1, unreadCount: 1 })),
    markReadById: jasmine.createSpy('markReadById').and.returnValue(of({})),
    markAllReadRequest: jasmine.createSpy('markAllReadRequest').and.returnValue(of({})),
  };

  beforeEach(async () => {
    notifServiceSpy.fetch.calls.reset();
    notifServiceSpy.listAll.calls.reset();
    notifServiceSpy.markReadById.calls.reset();
    notifServiceSpy.markAllReadRequest.calls.reset();

    // Reset return values
    notifServiceSpy.listAll.and.returnValue(of({ data: mockNotifications, total: 1, unreadCount: 1 }));

    await TestBed.configureTestingModule({
      imports: [NotificationInboxComponent],
      providers: [
        { provide: NotificationService, useValue: notifServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationInboxComponent);
    component = fixture.componentInstance;
  });

  it('loads notifications on init', () => {
    fixture.detectChanges();
    expect(notifServiceSpy.listAll).toHaveBeenCalled();
    expect(component.notifications.length).toBe(1);
    expect(component.unreadCount).toBe(1);
    expect(component.loading).toBeFalse();
  });

  it('handles load failure gracefully', () => {
    notifServiceSpy.listAll.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    expect(component.loading).toBeFalse();
    expect(component.notifications.length).toBe(0);
  });

  it('marks single notification as read', fakeAsync(() => {
    fixture.detectChanges();
    component.markRead('n1');
    tick();
    expect(notifServiceSpy.markReadById).toHaveBeenCalledWith('n1');
    expect(notifServiceSpy.fetch).toHaveBeenCalled();
  }));

  it('marks all notifications as read', fakeAsync(() => {
    fixture.detectChanges();
    component.markAllRead();
    tick();
    expect(notifServiceSpy.markAllReadRequest).toHaveBeenCalled();
    expect(notifServiceSpy.fetch).toHaveBeenCalled();
  }));

  it('returns correct type icons', () => {
    expect(component.getTypeIcon('booking')).toBeTruthy();
    expect(component.getTypeIcon('review')).toBeTruthy();
    expect(component.getTypeIcon('system')).toBeTruthy();
    expect(component.getTypeIcon(null)).toBeTruthy();
  });
});
