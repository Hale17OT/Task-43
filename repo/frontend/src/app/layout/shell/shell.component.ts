import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TimeSyncService } from '../../core/services/time-sync.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, HeaderComponent],
  template: `
    @if (!sessionReady()) {
      <div class="loading-shell">
        <div class="loading-spinner"></div>
      </div>
    } @else if (auth.isLoggedIn()) {
      <div class="shell-layout">
        <app-sidebar />
        <div class="shell-main">
          <app-header />
          @if (timeSync.syncError()) {
            <div class="sync-warning">Time sync unavailable — policy timing may be inaccurate.</div>
          }
          @if (deniedMessage()) {
            <div class="permission-denied-banner">
              <span>{{ deniedMessage() }}</span>
              <button class="dismiss-btn" (click)="dismissDenied()">×</button>
            </div>
          }
          <main class="shell-content">
            <router-outlet />
          </main>
        </div>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styles: [`
    .shell-layout { display: flex; min-height: 100vh; }
    .shell-main {
      flex: 1;
      margin-left: 240px;
      display: flex;
      flex-direction: column;
    }
    .shell-content {
      flex: 1;
      padding: var(--spacing-lg);
    }
    .permission-denied-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--color-danger, #dc3545);
      color: white;
      padding: 10px 20px;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .dismiss-btn {
      background: none;
      border: none;
      color: white;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0 4px;
    }
    .sync-warning {
      background: var(--color-warning, #f59e0b);
      color: white;
      padding: 6px 20px;
      font-size: 0.8rem;
      text-align: center;
    }
    .loading-shell {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid var(--color-border, #e5e7eb);
      border-top-color: var(--color-primary, #2563eb);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ShellComponent implements OnInit {
  deniedMessage = signal<string | null>(null);
  sessionReady = signal(false);

  constructor(public auth: AuthService, public timeSync: TimeSyncService, private route: ActivatedRoute) {}

  ngOnInit() {
    // Wait for server session validation before rendering role-dependent chrome
    this.auth.waitForSessionReady().then(() => this.sessionReady.set(true));

    this.route.queryParams.subscribe(params => {
      if (params['denied']) {
        this.deniedMessage.set(params['denied']);
        setTimeout(() => this.deniedMessage.set(null), 6000);
      }
    });
  }

  dismissDenied() {
    this.deniedMessage.set(null);
  }
}
