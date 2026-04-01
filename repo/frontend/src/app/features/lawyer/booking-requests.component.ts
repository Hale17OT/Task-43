import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingsService } from '../../core/services/bookings.service';
import { CreditService } from '../../core/services/credit.service';
import { Booking } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-booking-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Booking Requests</h2>

      <div class="filters">
        <select class="input filter-select" [(ngModel)]="statusFilter" (ngModelChange)="loadBookings()">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>
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
                <th>Client</th>
                <th>Credit</th>
                <th>Type</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (booking of bookings; track booking.id) {
                <tr>
                  <td>{{ booking.clientId }}</td>
                  <td>
                    <span class="badge" [ngClass]="getCreditClass(clientCredits[booking.clientId])">
                      {{ clientCredits[booking.clientId] !== undefined ? clientCredits[booking.clientId] : '...' }}
                    </span>
                  </td>
                  <td>{{ booking.type }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(booking.status)">{{ booking.status }}</span>
                  </td>
                  <td>{{ (booking.scheduledAt || booking.deadlineAt) | date:'medium' }}</td>
                  <td class="actions">
                    @if (booking.status === 'pending') {
                      <button class="btn btn-primary" (click)="confirm(booking.id)" [disabled]="processingId === booking.id">
                        {{ processingId === booking.id ? 'Processing...' : 'Accept' }}
                      </button>
                      <button class="btn btn-danger" (click)="decline(booking.id)" [disabled]="processingId === booking.id">Decline</button>
                    }
                    @if (booking.status === 'confirmed') {
                      <button class="btn btn-primary" (click)="complete(booking.id)" [disabled]="processingId === booking.id">
                        {{ processingId === booking.id ? 'Processing...' : 'Complete' }}
                      </button>
                      <button class="btn btn-danger" (click)="markNoShow(booking.id)" [disabled]="processingId === booking.id">No-show</button>
                    }
                    @if (booking.status === 'completed') {
                      <a class="btn btn-primary" [routerLink]="['/reviews/new', booking.id]">Leave Review</a>
                    }
                  </td>
                </tr>
              }
              @if (bookings.length === 0) {
                <tr><td colspan="6" class="empty-text">No bookings found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page h2 { margin-bottom: var(--spacing-md); }
    .filters { margin-bottom: var(--spacing-md); }
    .filter-select { max-width: 200px; }
    .table-card { padding: 0; overflow-x: auto; }
    .actions { display: flex; gap: var(--spacing-xs); }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
    .error-banner { background: var(--color-danger, #dc3545); color: white; padding: 10px 16px; border-radius: var(--radius-md); margin-bottom: var(--spacing-md); font-size: 0.9rem; }
  `]
})
export class BookingRequestsComponent implements OnInit {
  bookings: Booking[] = [];
  loading = true;
  statusFilter = '';
  actionError = '';
  processingId: string | null = null;
  clientCredits: Record<string, number> = {};

  constructor(private auth: AuthService, private bookingsService: BookingsService, private creditService: CreditService) {}

  ngOnInit() {
    this.loadBookings();
  }

  loadBookings() {
    this.loading = true;
    const userId = this.auth.currentUser()?.id;
    const params: Record<string, string> = { lawyerId: userId ?? '' };
    if (this.statusFilter) params['status'] = this.statusFilter;

    this.bookingsService.list(params).subscribe({
      next: (res) => {
        this.bookings = res.data;
        this.loading = false;
        // Load client credit scores
        const clientIds = [...new Set(res.data.map(b => b.clientId))];
        clientIds.forEach(cid => {
          this.creditService.getScore(cid).subscribe({
            next: (r) => (this.clientCredits[cid] = r.creditScore),
          });
        });
      },
      error: () => { this.loading = false; this.actionError = 'Failed to load bookings.'; },
    });
  }

  confirm(bookingId: string) {
    this.actionError = '';
    this.processingId = bookingId;
    this.bookingsService.confirm(bookingId).subscribe({
      next: () => { this.processingId = null; this.loadBookings(); },
      error: (err) => { this.processingId = null; this.actionError = err.error?.message ?? 'Failed to confirm booking'; },
    });
  }

  decline(bookingId: string) {
    this.actionError = '';
    this.processingId = bookingId;
    this.bookingsService.decline(bookingId).subscribe({
      next: () => { this.processingId = null; this.loadBookings(); },
      error: (err) => { this.processingId = null; this.actionError = err.error?.message ?? 'Failed to decline booking'; },
    });
  }

  complete(bookingId: string) {
    this.actionError = '';
    this.processingId = bookingId;
    this.bookingsService.complete(bookingId).subscribe({
      next: () => { this.processingId = null; this.loadBookings(); },
      error: (err) => { this.processingId = null; this.actionError = err.error?.message ?? 'Failed to complete booking'; },
    });
  }

  markNoShow(bookingId: string) {
    this.actionError = '';
    this.processingId = bookingId;
    this.bookingsService.markNoShow(bookingId).subscribe({
      next: () => { this.processingId = null; this.loadBookings(); },
      error: (err) => { this.processingId = null; this.actionError = err.error?.message ?? 'Failed to mark no-show'; },
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-warning', confirmed: 'badge-info', completed: 'badge-success',
      cancelled: 'badge-neutral', no_show: 'badge-danger', declined: 'badge-danger',
    };
    return map[status] ?? 'badge-neutral';
  }

  getCreditClass(score: number | undefined): string {
    if (score === undefined) return 'badge-neutral';
    if (score > 60) return 'badge-success';
    if (score >= 20) return 'badge-warning';
    return 'badge-danger';
  }
}
