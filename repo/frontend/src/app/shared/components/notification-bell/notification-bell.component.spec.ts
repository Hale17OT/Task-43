import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationService } from '../../../core/services/notification.service';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

describe('NotificationBellComponent', () => {
  let component: NotificationBellComponent;
  let fixture: ComponentFixture<NotificationBellComponent>;

  const notifServiceSpy = {
    notifications: signal([
      { id: 'n1', userId: 'u1', title: 'Test', body: null, type: 'system', referenceId: null, isRead: false, createdAt: new Date().toISOString() },
      { id: 'n2', userId: 'u1', title: 'Read', body: null, type: 'system', referenceId: null, isRead: true, createdAt: new Date().toISOString() },
    ]),
    unreadCount: signal(1),
    fetchError: signal(false),
    startPolling: jasmine.createSpy('startPolling'),
    stopPolling: jasmine.createSpy('stopPolling'),
    fetch: jasmine.createSpy('fetch'),
    markRead: jasmine.createSpy('markRead'),
    markAllRead: jasmine.createSpy('markAllRead'),
    reset: jasmine.createSpy('reset'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: notifServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts polling on init', () => {
    expect(notifServiceSpy.startPolling).toHaveBeenCalled();
  });

  it('stops polling on destroy', () => {
    component.ngOnDestroy();
    expect(notifServiceSpy.stopPolling).toHaveBeenCalled();
  });
});
