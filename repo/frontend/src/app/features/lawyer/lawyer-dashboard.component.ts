import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingsService } from '../../core/services/bookings.service';
import { Booking } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-lawyer-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, ShimmerLoaderComponent],
  template: `
    <div class="dashboard">
      <h2>Lawyer Dashboard</h2>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }}</div>
      }
      <div class="dashboard-grid">
        <!-- Today's Bookings -->
        <div class="card">
          <h4>Today's Bookings</h4>
          @if (loading) {
            <app-shimmer-loader [lines]="4" />
          } @else if (todayBookings.length === 0) {
            <p class="empty-text">No bookings today.</p>
          } @else {
            @for (booking of todayBookings; track booking.id) {
              <div class="booking-row">
                <span class="badge" [ngClass]="getStatusClass(booking.status)">{{ booking.status }}</span>
                <span>{{ booking.type }}</span>
                <span class="time">{{ booking.scheduledAt | date:'shortTime' }}</span>
              </div>
            }
          }
        </div>

        <!-- Stats -->
        <div class="stats-col">
          <div class="card stat-card">
            <h4>Pending Requests</h4>
            @if (loading) {
              <app-shimmer-loader [lines]="1" />
            } @else {
              <div class="stat-number">{{ pendingCount }}</div>
            }
          </div>

          <div class="card stat-card">
            <h4>Daily Capacity</h4>
            @if (loading) {
              <app-shimmer-loader [lines]="1" />
            } @else {
              <div class="capacity-bar-track">
                <div
                  class="capacity-bar-fill"
                  [style.width.%]="capacityPercent"
                  [style.background]="capacityPercent > 90 ? 'var(--color-danger)' : 'var(--color-primary)'"
                ></div>
              </div>
              <div class="capacity-label">{{ usedCapacity }} / {{ totalCapacity }} weight used</div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard h2 { margin-bottom: var(--spacing-lg); }
    .dashboard-grid {
      display: grid; grid-template-columns: 1fr 300px; gap: var(--spacing-lg);
    }
    .booking-row {
      display: flex; align-items: center; gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border);
      font-size: 0.875rem;
    }
    .time { margin-left: auto; color: var(--color-text-secondary); }
    .empty-text { color: var(--color-text-muted); font-size: 0.875rem; }
    .stats-col { display: flex; flex-direction: column; gap: var(--spacing-md); }
    .stat-card { text-align: center; }
    .stat-number { font-size: 2.5rem; font-weight: 700; color: var(--color-primary); margin-top: var(--spacing-sm); }
    .capacity-bar-track { height: 12px; background: var(--color-border); border-radius: 6px; overflow: hidden; margin-top: var(--spacing-sm); }
    .capacity-bar-fill { height: 100%; border-radius: 6px; transition: width 0.5s ease; }
    .capacity-label { font-size: 0.8rem; color: var(--color-text-secondary); margin-top: var(--spacing-xs); }
    @media (max-width: 768px) { .dashboard-grid { grid-template-columns: 1fr; } }
  `]
})
export class LawyerDashboardComponent implements OnInit {
  loading = true;
  todayBookings: Booking[] = [];
  pendingCount = 0;
  usedCapacity = 0;
  totalCapacity = 0;
  errorMessage = '';

  constructor(private bookingsService: BookingsService, private auth: AuthService) {}

  ngOnInit() {
    const userId = this.auth.currentUser()?.id;
    this.totalCapacity = this.auth.currentUser()?.dailyCapacity ?? 100;

    const today = new Date().toISOString().split('T')[0];
    this.bookingsService.list({ lawyerId: userId ?? '', date: today }).subscribe({
      next: (res) => {
        this.todayBookings = res.data;
        this.pendingCount = res.data.filter(b => b.status === 'pending').length;
        this.usedCapacity = res.data
          .filter(b => ['confirmed', 'completed'].includes(b.status))
          .reduce((sum, b) => sum + (b.weight || 0), 0);
        this.loading = false;
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load today\'s bookings.'; },
    });
  }

  get capacityPercent(): number {
    if (this.totalCapacity === 0) return 0;
    return Math.min(100, (this.usedCapacity / this.totalCapacity) * 100);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-warning', confirmed: 'badge-info', completed: 'badge-success',
      cancelled: 'badge-neutral', no_show: 'badge-danger', declined: 'badge-danger',
    };
    return map[status] ?? 'badge-neutral';
  }
}
