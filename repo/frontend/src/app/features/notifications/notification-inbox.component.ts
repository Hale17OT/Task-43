import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Notification } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-notification-inbox',
  standalone: true,
  imports: [CommonModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Notifications</h2>
        <button class="btn btn-secondary" (click)="markAllRead()" [disabled]="unreadCount === 0">
          Mark All Read
        </button>
      </div>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadNotifications()">Retry</button></div>
      }

      @if (loading) {
        <app-shimmer-loader [lines]="8" />
      } @else {
        <div class="notification-list">
          @for (notif of notifications; track notif.id) {
            <div class="card notif-card" [class.unread]="!notif.isRead">
              <div class="notif-header">
                <span class="notif-type-icon">{{ getTypeIcon(notif.type) }}</span>
                <strong class="notif-title">{{ notif.title }}</strong>
                <span class="notif-time">{{ notif.createdAt | date:'medium' }}</span>
              </div>
              @if (notif.body) {
                <p class="notif-body">{{ notif.body }}</p>
              }
              @if (!notif.isRead) {
                <button class="btn btn-secondary mark-btn" (click)="markRead(notif.id)">Mark read</button>
              }
            </div>
          }
          @if (notifications.length === 0) {
            <div class="card empty-card">
              <p class="empty-text">No notifications.</p>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg); }
    .notification-list { display: flex; flex-direction: column; gap: var(--spacing-sm); }
    .notif-card {
      transition: background 0.15s ease;
      &.unread { border-left: 3px solid var(--color-primary); background: var(--color-primary-light); }
    }
    .notif-header { display: flex; align-items: center; gap: var(--spacing-sm); }
    .notif-type-icon { font-size: 1.25rem; }
    .notif-title { flex: 1; font-size: 0.9rem; }
    .notif-time { font-size: 0.75rem; color: var(--color-text-muted); }
    .notif-body { font-size: 0.85rem; color: var(--color-text-secondary); margin-top: var(--spacing-xs); }
    .mark-btn { margin-top: var(--spacing-sm); font-size: 0.75rem; padding: 2px 8px; }
    .empty-text { text-align: center; color: var(--color-text-muted); }
    .empty-card { text-align: center; }
  `]
})
export class NotificationInboxComponent implements OnInit {
  notifications: Notification[] = [];
  loading = true;
  unreadCount = 0;
  errorMessage = '';

  constructor(
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.loadNotifications();
  }

  loadNotifications() {
    this.loading = true;
    this.notificationService.listAll().subscribe({
      next: (res) => {
        this.notifications = res.data;
        this.unreadCount = res.unreadCount;
        this.loading = false;
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load notifications.'; },
    });
  }

  markRead(id: string) {
    this.notificationService.markReadById(id).subscribe({
      next: () => {
        this.loadNotifications();
        this.notificationService.fetch();
      },
    });
  }

  markAllRead() {
    this.notificationService.markAllReadRequest().subscribe({
      next: () => {
        this.loadNotifications();
        this.notificationService.fetch();
      },
    });
  }

  getTypeIcon(type: string | null): string {
    const icons: Record<string, string> = {
      booking: '\u{1F4C5}',
      review: '\u{2B50}',
      dispute: '\u{26A0}',
      credit: '\u{1F4B3}',
      system: '\u{1F514}',
    };
    return icons[type ?? ''] ?? '\u{1F514}';
  }
}
