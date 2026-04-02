import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { TimeSyncService } from '../../core/services/time-sync.service';
import { BookingsService } from '../../core/services/bookings.service';
import { Booking } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-booking-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>My Bookings</h2>
        <a routerLink="/client/bookings/create" class="btn btn-primary">New Booking</a>
      </div>

      @if (actionError) {
        <div class="error-banner">{{ actionError }}</div>
      }

      @if (loading) {
        <app-shimmer-loader [lines]="6" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Lawyer</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (booking of bookings; track booking.id) {
                <tr>
                  <td>{{ booking.type }}</td>
                  <td>{{ booking.lawyerId }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(booking.status)">{{ booking.status }}</span>
                  </td>
                  <td>{{ (booking.scheduledAt || booking.deadlineAt) | date:'medium' }}</td>
                  <td class="actions">
                    @if (booking.status === 'completed') {
                      <a class="btn btn-primary" [routerLink]="['/reviews/new', booking.id]">Leave Review</a>
                    }
                    @if (canCancel(booking)) {
                      <button class="btn btn-danger" (click)="confirmCancel(booking)">Cancel</button>
                    }
                    @if (canReschedule(booking)) {
                      <button class="btn btn-secondary" (click)="openReschedule(booking)">Reschedule</button>
                    }
                  </td>
                </tr>
              }
              @if (bookings.length === 0) {
                <tr><td colspan="5" class="empty-text">No bookings found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Reschedule Dialog -->
      @if (rescheduleTarget) {
        <div class="dialog-overlay" role="dialog" aria-modal="true" aria-label="Reschedule Booking" (click)="rescheduleTarget = null">
          <div class="dialog card" (click)="$event.stopPropagation()">
            <h3>Reschedule Booking</h3>
            <div class="form-group">
              <label>New Date & Time</label>
              <input class="input" type="datetime-local" [(ngModel)]="rescheduleDate" />
            </div>
            @if (rescheduleError) {
              <div class="error-text">{{ rescheduleError }}</div>
            }
            <div class="dialog-actions">
              <button class="btn btn-primary" (click)="doReschedule()" [disabled]="rescheduling || !rescheduleDate">
                {{ rescheduling ? 'Rescheduling...' : 'Confirm Reschedule' }}
              </button>
              <button class="btn btn-secondary" (click)="rescheduleTarget = null">Cancel</button>
            </div>
          </div>
        </div>
      }

      <!-- Cancel Confirmation Dialog -->
      @if (cancelTarget) {
        <div class="dialog-overlay" role="dialog" aria-modal="true" aria-label="Cancel Booking" (click)="cancelTarget = null">
          <div class="dialog card" (click)="$event.stopPropagation()">
            <h3>Cancel Booking</h3>
            <p>Are you sure you want to cancel this booking?</p>
            @if (isWithin2Hours(cancelTarget)) {
              <div class="policy-banner" style="margin: var(--spacing-md) 0;">
                Warning: Cancelling within 2 hours of the scheduled time will incur a credit penalty.
              </div>
            }
            <div class="dialog-actions">
              <button class="btn btn-danger" (click)="doCancel()" [disabled]="cancelling">
                {{ cancelling ? 'Cancelling...' : 'Confirm Cancel' }}
              </button>
              <button class="btn btn-secondary" (click)="cancelTarget = null">Keep Booking</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg); }
    .table-card { padding: 0; overflow-x: auto; }
    .actions { display: flex; gap: var(--spacing-xs); }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
    .error-banner { background: var(--color-danger, #dc3545); color: white; padding: 10px 16px; border-radius: var(--radius-md); margin-bottom: var(--spacing-md); font-size: 0.9rem; }
    .error-text { color: var(--color-danger, #dc3545); font-size: 0.85rem; margin: var(--spacing-xs) 0; }
    .form-group { margin-bottom: var(--spacing-md); }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
    .dialog-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200;
      display: flex; align-items: center; justify-content: center;
    }
    .dialog { max-width: 440px; width: 100%; }
    .dialog h3 { margin-bottom: var(--spacing-sm); }
    .dialog-actions { display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md); }
  `]
})
export class BookingListComponent implements OnInit {
  bookings: Booking[] = [];
  loading = true;
  cancelTarget: Booking | null = null;
  cancelling = false;
  rescheduleTarget: Booking | null = null;
  rescheduleDate = '';
  rescheduling = false;
  rescheduleError = '';
  actionError = '';

  constructor(
    private auth: AuthService,
    private timeSync: TimeSyncService,
    private bookingsService: BookingsService
  ) {}

  ngOnInit() {
    this.loadBookings();
  }

  loadBookings() {
    this.loading = true;
    this.actionError = '';
    const userId = this.auth.currentUser()?.id ?? '';
    this.bookingsService.list({ clientId: userId }).subscribe({
      next: (res) => {
        this.bookings = res.data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.actionError = 'Failed to load bookings. Please try again.';
      },
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-warning', confirmed: 'badge-info', completed: 'badge-success',
      cancelled: 'badge-neutral', no_show: 'badge-danger', declined: 'badge-danger',
      rescheduled: 'badge-info',
    };
    return map[status] ?? 'badge-neutral';
  }

  canCancel(b: Booking): boolean {
    return ['pending', 'confirmed'].includes(b.status);
  }

  canReschedule(b: Booking): boolean {
    return ['pending', 'confirmed'].includes(b.status) && b.type === 'consultation';
  }

  confirmCancel(booking: Booking) {
    this.cancelTarget = booking;
  }

  isWithin2Hours(booking: Booking): boolean {
    const scheduled = booking.scheduledAt || booking.deadlineAt;
    if (!scheduled) return false;
    const diff = new Date(scheduled).getTime() - this.timeSync.serverNow().getTime();
    return diff < 2 * 60 * 60 * 1000;
  }

  doCancel() {
    if (!this.cancelTarget) return;
    this.cancelling = true;
    this.actionError = '';
    this.bookingsService.cancel(this.cancelTarget.id).subscribe({
      next: () => {
        this.cancelling = false;
        this.cancelTarget = null;
        this.loadBookings();
      },
      error: (err) => {
        this.cancelling = false;
        this.cancelTarget = null;
        this.actionError = err.error?.message ?? 'Failed to cancel booking';
      },
    });
  }

  openReschedule(booking: Booking) {
    this.rescheduleTarget = booking;
    this.rescheduleDate = '';
    this.rescheduleError = '';
  }

  doReschedule() {
    if (!this.rescheduleTarget || !this.rescheduleDate) return;
    const parsed = new Date(this.rescheduleDate);
    if (isNaN(parsed.getTime())) {
      this.rescheduleError = 'Please enter a valid date and time';
      return;
    }
    if (parsed.getTime() <= Date.now()) {
      this.rescheduleError = 'New date must be in the future';
      return;
    }
    this.rescheduling = true;
    this.rescheduleError = '';
    this.actionError = '';
    this.bookingsService.reschedule(this.rescheduleTarget.id, parsed.toISOString(), crypto.randomUUID()).subscribe({
      next: () => {
        this.rescheduling = false;
        this.rescheduleTarget = null;
        this.loadBookings();
      },
      error: (err) => {
        this.rescheduling = false;
        this.rescheduleError = err.error?.message ?? 'Failed to reschedule booking';
      },
    });
  }
}
