import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="bell-wrapper">
      <button class="bell-btn" (click)="toggleDropdown()" aria-label="Notifications">
        <span class="bell-icon">&#128276;</span>
        @if (notificationService.fetchError()) {
          <span class="error-badge">!</span>
        } @else if (notificationService.unreadCount() > 0) {
          <span class="unread-badge">{{ notificationService.unreadCount() }}</span>
        }
      </button>
      @if (dropdownOpen) {
        <div class="bell-dropdown card">
          <div class="dropdown-header">
            <strong>Notifications</strong>
            <button class="btn btn-secondary" style="font-size: 0.7rem; padding: 2px 8px;" (click)="notificationService.markAllRead()">Mark all read</button>
          </div>
          @if (notificationService.fetchError()) {
            <p class="error-msg">Unable to load notifications. <button class="retry-link" (click)="notificationService.fetch()">Retry</button></p>
          } @else if (notificationService.notifications().length === 0) {
            <p class="empty-msg">No notifications</p>
          }
          @for (n of notificationService.notifications(); track n.id) {
            <div class="notif-item" [class.unread]="!n.isRead" (click)="notificationService.markRead(n.id)">
              <div class="notif-title">{{ n.title }}</div>
              <div class="notif-time">{{ n.createdAt | date:'short' }}</div>
            </div>
          }
          <a routerLink="/notifications" class="view-all" (click)="dropdownOpen = false">View all</a>
        </div>
      }
    </div>
  `,
  styles: [`
    .bell-wrapper { position: relative; }
    .bell-btn {
      background: none; border: none; cursor: pointer; position: relative;
      font-size: 1.25rem; padding: var(--spacing-xs);
      &:focus-visible { outline: 2px solid var(--color-primary); border-radius: var(--radius-sm); }
    }
    .bell-icon { display: block; }
    .unread-badge {
      position: absolute; top: -4px; right: -4px;
      background: var(--color-danger); color: white;
      font-size: 0.625rem; font-weight: 700;
      min-width: 16px; height: 16px;
      border-radius: 9999px;
      display: flex; align-items: center; justify-content: center;
      padding: 0 4px;
    }
    .bell-dropdown {
      position: absolute; right: 0; top: 100%; margin-top: var(--spacing-xs);
      width: 320px; max-height: 400px; overflow-y: auto; z-index: 100;
      padding: 0;
    }
    .dropdown-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--color-border);
    }
    .notif-item {
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--color-border);
      cursor: pointer;
      &:hover { background: var(--color-surface-secondary); }
      &.unread { background: var(--color-primary-light); }
    }
    .notif-title { font-size: 0.85rem; font-weight: 500; }
    .notif-time { font-size: 0.7rem; color: var(--color-text-muted); margin-top: 2px; }
    .empty-msg { padding: var(--spacing-md); text-align: center; color: var(--color-text-muted); font-size: 0.85rem; }
    .error-badge {
      position: absolute; top: -4px; right: -4px;
      background: var(--color-warning, #f59e0b); color: white;
      font-size: 0.625rem; font-weight: 700;
      min-width: 16px; height: 16px;
      border-radius: 9999px;
      display: flex; align-items: center; justify-content: center;
    }
    .error-msg { padding: var(--spacing-md); text-align: center; color: var(--color-danger); font-size: 0.85rem; }
    .retry-link { background: none; border: none; color: var(--color-primary); cursor: pointer; text-decoration: underline; font-size: 0.85rem; }
    .view-all {
      display: block; text-align: center; padding: var(--spacing-sm);
      font-size: 0.8rem; color: var(--color-primary); text-decoration: none;
      border-top: 1px solid var(--color-border);
      &:hover { background: var(--color-surface-secondary); }
    }
  `]
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  dropdownOpen = false;

  constructor(public notificationService: NotificationService) {}

  ngOnInit() {
    this.notificationService.startPolling();
  }

  ngOnDestroy() {
    this.notificationService.stopPolling();
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('app-notification-bell')) {
      this.dropdownOpen = false;
    }
  }
}
