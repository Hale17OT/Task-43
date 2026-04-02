import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { LoginResponse, User } from '../models/interfaces';
import { NotificationService } from './notification.service';
import { TimeSyncService } from './time-sync.service';
import { firstValueFrom, ReplaySubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'justiceops_token';
  private userKey = 'justiceops_user';
  private permissionsKey = 'justiceops_permissions';
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  currentUser = signal<User | null>(this.loadUser());
  isLoggedIn = computed(() => !!this.currentUser());
  userRole = computed(() => this.currentUser()?.role ?? null);
  menuPermissions = signal<string[]>(this.loadPermissions());
  /** Signal that becomes true when the token is about to expire (within 5 minutes). */
  tokenExpiringSoon = signal(false);

  /**
   * Emits true once session has been validated against the server,
   * or immediately if no stored token exists. Guards await this
   * before checking role, so localStorage tampering cannot grant access.
   */
  private sessionReady$ = new ReplaySubject<boolean>(1);

  constructor(private http: HttpClient, private router: Router, private notificationService: NotificationService, private timeSyncService: TimeSyncService) {
    if (this.getToken()) {
      this.validateSession();
    } else {
      // No token: clear any stale user/permissions from localStorage
      // to prevent tampered justiceops_user from granting UI access.
      if (this.currentUser()) {
        localStorage.removeItem(this.userKey);
        localStorage.removeItem(this.permissionsKey);
        this.currentUser.set(null);
        this.menuPermissions.set([]);
      }
      this.sessionReady$.next(true);
    }
  }

  /** Returns a promise that resolves once server-side session validation is complete. */
  waitForSessionReady(): Promise<boolean> {
    return firstValueFrom(this.sessionReady$);
  }

  private validateSession() {
    this.http.get<{ user: User; permissions: string[] }>('/api/auth/me').subscribe({
      next: (res) => {
        this.currentUser.set(res.user);
        localStorage.setItem(this.userKey, JSON.stringify(res.user));
        if (res.permissions) {
          this.menuPermissions.set(res.permissions);
          localStorage.setItem(this.permissionsKey, JSON.stringify(res.permissions));
        }
        this.sessionReady$.next(true);
      },
      error: (err) => {
        // Don't clear session on network abort (status 0) — this happens during
        // page navigation and would wipe localStorage for the new page load.
        if (err?.status === 0) {
          this.sessionReady$.next(true);
          return;
        }
        this.clearSession();
        this.sessionReady$.next(true);
      },
    });
  }

  login(username: string, password: string) {
    return this.http.post<LoginResponse>('/api/auth/login', { username, password });
  }

  handleLoginSuccess(response: LoginResponse) {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
    localStorage.setItem(this.permissionsKey, JSON.stringify(response.menuPermissions));
    this.currentUser.set(response.user);
    this.menuPermissions.set(response.menuPermissions);
    this.tokenExpiringSoon.set(false);
    // Login is server-validated by definition
    this.sessionReady$.next(true);
    // Start time sync for policy timing (e.g., 2-hour cancellation window)
    this.timeSyncService.init();
    // Schedule token expiry warning
    this.scheduleExpiryWarning(response.token);
  }

  logout() {
    this.http.post('/api/auth/logout', {}).subscribe({
      complete: () => this.clearSession(),
      error: () => this.clearSession(),
    });
  }

  clearSession() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.tokenExpiringSoon.set(false);
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.permissionsKey);
    this.currentUser.set(null);
    this.menuPermissions.set([]);
    this.notificationService.reset();
    this.timeSyncService.destroy();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getDefaultRoute(): string {
    const role = this.userRole();
    switch (role) {
      case 'client': return '/client/dashboard';
      case 'lawyer': return '/lawyer/dashboard';
      case 'admin':
      case 'super_admin': return '/admin/dashboard';
      default: return '/login';
    }
  }

  hasPermission(permission: string): boolean {
    return this.menuPermissions().includes(permission);
  }

  private loadUser(): User | null {
    const stored = localStorage.getItem(this.userKey);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem(this.userKey);
      return null;
    }
  }

  private loadPermissions(): string[] {
    const stored = localStorage.getItem(this.permissionsKey);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem(this.permissionsKey);
      return [];
    }
  }

  /**
   * Decode JWT expiry and schedule a warning 5 minutes before expiration.
   * Does not validate the token — server handles that.
   */
  private scheduleExpiryWarning(token: string) {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return;
      const expiresAt = payload.exp * 1000;
      const warningMs = expiresAt - Date.now() - 5 * 60 * 1000; // 5 min before
      if (warningMs <= 0) {
        this.tokenExpiringSoon.set(true);
        return;
      }
      this.expiryTimer = setTimeout(() => {
        this.tokenExpiringSoon.set(true);
      }, warningMs);
    } catch {
      // Malformed token — ignore, server will reject on next request
    }
  }
}
