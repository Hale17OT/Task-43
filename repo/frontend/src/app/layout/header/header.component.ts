import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { NotificationBellComponent } from '../../shared/components/notification-bell/notification-bell.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, NotificationBellComponent],
  template: `
    <header class="app-header">
      <div class="header-left">
        <h3>JusticeOps</h3>
      </div>
      <div class="header-right">
        <app-notification-bell />
        <div class="user-menu" (click)="menuOpen = !menuOpen">
          <span class="user-avatar">{{ initials }}</span>
          @if (menuOpen) {
            <div class="user-dropdown card">
              <div class="dropdown-user">
                <strong>{{ auth.currentUser()?.username }}</strong>
                <span class="badge badge-info">{{ auth.currentUser()?.role }}</span>
              </div>
              <button class="btn btn-secondary dropdown-action" (click)="auth.logout()">Logout</button>
            </div>
          }
        </div>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      height: 56px;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--spacing-lg);
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .header-left h3 { color: var(--color-primary); margin: 0; }
    .header-right { display: flex; align-items: center; gap: var(--spacing-md); }
    .user-menu { position: relative; cursor: pointer; }
    .user-avatar {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px;
      border-radius: 9999px;
      background: var(--color-primary);
      color: white;
      font-weight: 600;
      font-size: 0.8rem;
    }
    .user-dropdown {
      position: absolute; right: 0; top: 100%; margin-top: var(--spacing-xs);
      width: 200px; z-index: 100; padding: var(--spacing-sm);
    }
    .dropdown-user {
      display: flex; flex-direction: column; gap: 4px;
      padding-bottom: var(--spacing-sm);
      border-bottom: 1px solid var(--color-border);
      margin-bottom: var(--spacing-sm);
    }
    .dropdown-action { width: 100%; }
  `]
})
export class HeaderComponent {
  menuOpen = false;

  constructor(public auth: AuthService) {}

  get initials(): string {
    const name = this.auth.currentUser()?.username ?? '';
    return name.substring(0, 2).toUpperCase();
  }
}
