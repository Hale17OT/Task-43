import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  route: string;
  permission: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-icon">&#9878;</span>
        <span class="brand-text">JusticeOps</span>
      </div>

      <div class="sidebar-nav">
        @for (item of visibleItems(); track item.route) {
          <a
            class="nav-item"
            [routerLink]="item.route"
            routerLinkActive="active"
          >
            {{ item.label }}
          </a>
        }
      </div>

      <div class="sidebar-footer">
        @if (auth.currentUser(); as user) {
          <div class="user-info">
            <div class="username">{{ user.username }}</div>
            <div class="role-label badge badge-info">{{ user.role }}</div>
          </div>
        }
        <button class="btn btn-secondary logout-btn" (click)="auth.logout()">Logout</button>
      </div>
    </nav>
  `,
  styles: [`
    .sidebar {
      width: 240px;
      height: 100vh;
      background: var(--color-sidebar);
      color: var(--color-sidebar-text);
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 50;
    }
    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-lg) var(--spacing-md);
      border-bottom: 1px solid var(--color-sidebar-hover);
    }
    .brand-icon { font-size: 1.5rem; }
    .brand-text { font-size: 1.125rem; font-weight: 700; }
    .sidebar-nav {
      flex: 1;
      padding: var(--spacing-sm) 0;
      overflow-y: auto;
    }
    .nav-item {
      display: block;
      padding: var(--spacing-sm) var(--spacing-md);
      color: var(--color-sidebar-text);
      text-decoration: none;
      font-size: 0.875rem;
      transition: background 0.15s ease;
      &:hover { background: var(--color-sidebar-hover); }
      &.active {
        background: var(--color-sidebar-hover);
        border-left: 3px solid var(--color-primary);
        font-weight: 600;
      }
    }
    .sidebar-footer {
      padding: var(--spacing-md);
      border-top: 1px solid var(--color-sidebar-hover);
    }
    .user-info { margin-bottom: var(--spacing-sm); }
    .username { font-size: 0.85rem; font-weight: 500; }
    .role-label { margin-top: 4px; font-size: 0.7rem; }
    .logout-btn {
      width: 100%;
      margin-top: var(--spacing-sm);
      background: var(--color-sidebar-hover);
      color: var(--color-sidebar-text);
      border: 1px solid rgba(255,255,255,0.1);
      &:hover { background: rgba(255,255,255,0.15); }
    }
  `]
})
export class SidebarComponent {
  constructor(public auth: AuthService) {}

  private clientItems: NavItem[] = [
    { label: 'Dashboard', route: '/client/dashboard', permission: 'client.dashboard' },
    { label: 'Bookings', route: '/client/bookings', permission: 'client.bookings' },
    { label: 'Credit Score', route: '/client/credit-history', permission: 'client.credit' },
    { label: 'Reviews', route: '/reviews', permission: 'reviews' },
    { label: 'Notifications', route: '/notifications', permission: 'notifications' },
  ];

  private lawyerItems: NavItem[] = [
    { label: 'Dashboard', route: '/lawyer/dashboard', permission: 'lawyer.dashboard' },
    { label: 'Availability', route: '/lawyer/availability', permission: 'lawyer.availability' },
    { label: 'Bookings', route: '/lawyer/bookings', permission: 'lawyer.bookings' },
    { label: 'Reviews', route: '/reviews', permission: 'reviews' },
    { label: 'Notifications', route: '/notifications', permission: 'notifications' },
  ];

  private adminItems: NavItem[] = [
    { label: 'Dashboard', route: '/admin/dashboard', permission: 'admin.dashboard' },
    { label: 'Jobs', route: '/admin/jobs', permission: 'admin.jobs' },
    { label: 'Arbitration', route: '/admin/arbitration', permission: 'admin.arbitration' },
    { label: 'Users', route: '/admin/users', permission: 'admin.users' },
    { label: 'Organizations', route: '/admin/organizations', permission: 'admin.organizations' },
    { label: 'Configuration', route: '/admin/config', permission: 'admin.config' },
    { label: 'Reports', route: '/reports', permission: 'reports' },
    { label: 'Subscriptions', route: '/reports/subscriptions', permission: 'reports.subscriptions' },
    { label: 'Notifications', route: '/notifications', permission: 'notifications' },
  ];

  visibleItems(): NavItem[] {
    const role = this.auth.userRole();
    const perms = this.auth.menuPermissions();

    let items: NavItem[];
    switch (role) {
      case 'client':
        items = this.clientItems;
        break;
      case 'lawyer':
        items = this.lawyerItems;
        break;
      case 'admin':
      case 'super_admin':
        items = this.adminItems;
        break;
      default:
        items = [];
    }

    return items.filter(item => perms.includes(item.permission));
  }
}
