import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingsService } from '../../core/services/bookings.service';
import { CreditService } from '../../core/services/credit.service';
import { Booking } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';
import { PolicyBannerComponent } from '../../shared/components/policy-banner/policy-banner.component';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, ShimmerLoaderComponent, PolicyBannerComponent],
  template: `
    <div class="dashboard">
      <h2>Welcome, {{ auth.currentUser()?.username }}</h2>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }}</div>
      }

      <div class="dashboard-grid">
        <!-- Credit Score Gauge -->
        <div class="card credit-card">
          <h4>Credit Score</h4>
          @if (loading) {
            <app-shimmer-loader [lines]="2" />
          } @else {
            <div class="credit-gauge" [style.color]="creditColor">
              <span class="credit-number">{{ creditScore }}</span>
              <span class="credit-max">/ 100</span>
            </div>
            <div class="credit-bar-track">
              <div class="credit-bar-fill" [style.width.%]="creditScore" [style.background]="creditColor"></div>
            </div>
          }
        </div>

        <!-- Upcoming Bookings -->
        <div class="card bookings-card">
          <div class="card-header">
            <h4>Upcoming Bookings</h4>
            <a routerLink="/client/bookings" class="btn btn-secondary">View All</a>
          </div>
          @if (loading) {
            <app-shimmer-loader [lines]="5" />
          } @else if (upcomingBookings.length === 0) {
            <p class="empty-text">No upcoming bookings.</p>
          } @else {
            @for (booking of upcomingBookings; track booking.id) {
              <div class="booking-row">
                <span class="badge" [ngClass]="getStatusClass(booking.status)">{{ booking.status }}</span>
                <span class="booking-type">{{ booking.type }}</span>
                <span class="booking-date">{{ (booking.scheduledAt || booking.deadlineAt) | date:'medium' }}</span>
              </div>
            }
          }
        </div>
      </div>

      <!-- Policy Banners -->
      <div class="policy-banners">
        <app-policy-banner
          type="warning"
          message="No-show after 10 minutes past the scheduled start counts as a violation."
        />
        <app-policy-banner
          type="warning"
          message="Cancellations within 2 hours incur a credit penalty."
        />
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <a routerLink="/client/bookings/create" class="btn btn-primary">Create Booking</a>
        <a routerLink="/client/bookings" class="btn btn-secondary">View All Bookings</a>
      </div>
    </div>
  `,
  styles: [`
    .dashboard h2 { margin-bottom: var(--spacing-lg); }
    .dashboard-grid {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: var(--spacing-lg);
      margin-bottom: var(--spacing-lg);
    }
    .credit-card { text-align: center; }
    .credit-gauge { margin: var(--spacing-md) 0; }
    .credit-number { font-size: 3rem; font-weight: 700; }
    .credit-max { font-size: 1rem; color: var(--color-text-muted); }
    .credit-bar-track {
      height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden;
    }
    .credit-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
    .card-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);
    }
    .booking-row {
      display: flex; align-items: center; gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--color-border);
      font-size: 0.875rem;
    }
    .booking-type { font-weight: 500; }
    .booking-date { color: var(--color-text-secondary); margin-left: auto; }
    .empty-text { color: var(--color-text-muted); font-size: 0.875rem; }
    .policy-banners { display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg); }
    .quick-actions { display: flex; gap: var(--spacing-sm); }
    @media (max-width: 768px) {
      .dashboard-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class ClientDashboardComponent implements OnInit {
  loading = true;
  creditScore = 0;
  upcomingBookings: Booking[] = [];
  errorMessage = '';

  constructor(public auth: AuthService, private bookingsService: BookingsService, private creditService: CreditService) {}

  ngOnInit() {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;

    this.creditService.getScore(userId).subscribe({
      next: (res) => (this.creditScore = res.creditScore),
    });

    this.bookingsService.list({ clientId: userId, status: 'pending,confirmed', limit: '5' }).subscribe({
      next: (res) => {
        this.upcomingBookings = res.data;
        this.loading = false;
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load bookings.'; },
    });
  }

  get creditColor(): string {
    if (this.creditScore > 60) return 'var(--color-success)';
    if (this.creditScore >= 20) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      confirmed: 'badge-info',
      completed: 'badge-success',
      cancelled: 'badge-neutral',
      no_show: 'badge-danger',
      declined: 'badge-danger',
      rescheduled: 'badge-info',
    };
    return map[status] ?? 'badge-neutral';
  }
}
