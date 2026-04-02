import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card card">
        <h2>JusticeOps</h2>
        <p class="login-subtitle">Sign in to your account</p>

        @if (sessionMessage) {
          <div class="permission-feedback">{{ sessionMessage }}</div>
        }

        @if (errorMessage) {
          <div class="permission-feedback">{{ errorMessage }}</div>
        }

        @if (lockoutSeconds > 0) {
          <div class="policy-banner">
            Account locked. Try again in {{ lockoutSeconds }} seconds.
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              id="username"
              class="input"
              type="text"
              [(ngModel)]="username"
              name="username"
              required
              [disabled]="loading || lockoutSeconds > 0"
              autocomplete="username"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              class="input"
              type="password"
              [(ngModel)]="password"
              name="password"
              required
              minlength="12"
              [disabled]="loading || lockoutSeconds > 0"
              autocomplete="current-password"
            />
            <p class="hint">12+ characters, at least 1 number and 1 symbol</p>
            @if (password && password.length < 12) {
              <p class="field-error">Password must be at least 12 characters</p>
            } @else if (password && !isPasswordValid()) {
              <p class="field-error">Password must contain at least 1 number and 1 symbol</p>
            }
          </div>

          <button
            class="btn btn-primary login-btn"
            type="submit"
            [disabled]="loading || lockoutSeconds > 0 || !username || !password || !isPasswordValid()"
          >
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-surface-secondary);
    }
    .login-card {
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    .login-subtitle {
      color: var(--color-text-secondary);
      margin: var(--spacing-xs) 0 var(--spacing-lg);
      font-size: 0.9rem;
    }
    .login-form { text-align: left; }
    .form-group {
      margin-bottom: var(--spacing-md);
      label {
        display: block;
        font-size: 0.85rem;
        font-weight: 500;
        margin-bottom: var(--spacing-xs);
      }
    }
    .hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-top: var(--spacing-xs);
    }
    .field-error {
      font-size: 0.75rem;
      color: var(--color-danger, #dc3545);
      margin-top: 4px;
    }
    .login-btn { width: 100%; margin-top: var(--spacing-sm); }
    .permission-feedback, .policy-banner { margin-bottom: var(--spacing-md); }
  `]
})
export class LoginComponent implements OnInit, OnDestroy {
  username = '';
  password = '';
  loading = false;
  errorMessage = '';
  sessionMessage = '';
  lockoutSeconds = 0;
  private lockoutTimer: any;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate([this.auth.getDefaultRoute()]);
      return;
    }
    this.route.queryParams.subscribe(params => {
      if (params['message']) {
        this.sessionMessage = params['message'];
      }
    });
  }

  ngOnDestroy() {
    if (this.lockoutTimer) clearInterval(this.lockoutTimer);
  }

  onSubmit() {
    this.errorMessage = '';
    this.sessionMessage = '';
    this.loading = true;

    this.auth.login(this.username, this.password).subscribe({
      next: (response) => {
        this.auth.handleLoginSuccess(response);
        this.loading = false;
        this.router.navigate([this.auth.getDefaultRoute()]);
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        if (err.status === 401 && err.error?.retryAfterSeconds) {
          // Account locked — server returns 401 with retryAfterSeconds to prevent enumeration
          this.startLockout(err.error.retryAfterSeconds);
        } else if (err.status === 401) {
          this.errorMessage = 'Invalid username or password.';
        } else if (err.status === 429) {
          const retryAfter = err.error?.retryAfterSeconds ?? 60;
          this.errorMessage = `Too many login attempts. Please try again in ${retryAfter} seconds.`;
        } else {
          this.errorMessage = err.error?.message ?? 'Login failed. Please try again.';
        }
      },
    });
  }

  isPasswordValid(): boolean {
    if (!this.password || this.password.length < 12) return false;
    return /\d/.test(this.password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(this.password);
  }

  private startLockout(seconds: number) {
    this.lockoutSeconds = seconds;
    this.lockoutTimer = setInterval(() => {
      this.lockoutSeconds--;
      if (this.lockoutSeconds <= 0) {
        clearInterval(this.lockoutTimer);
      }
    }, 1000);
  }
}
