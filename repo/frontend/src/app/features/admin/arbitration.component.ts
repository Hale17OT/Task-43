import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewsService } from '../../core/services/reviews.service';
import { Dispute } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-arbitration',
  standalone: true,
  imports: [CommonModule, FormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Arbitration</h2>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab-btn"
          [class.active]="activeTab === 'pending'"
          (click)="activeTab = 'pending'; loadDisputes()"
        >Pending</button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'resolved'"
          (click)="activeTab = 'resolved'; loadDisputes()"
        >Resolved</button>
      </div>

      @if (actionError) {
        <div class="error-banner">{{ actionError }} <button class="retry-btn" (click)="loadDisputes()">Retry</button></div>
      }

      @if (loading) {
        <app-shimmer-loader [lines]="6" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Appellant</th>
                <th>Reason</th>
                <th>Filed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (dispute of disputes; track dispute.id) {
                <tr>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(dispute.status)">{{ dispute.status }}</span>
                  </td>
                  <td>{{ dispute.appellantId }}</td>
                  <td class="reason-cell">{{ dispute.reason }}</td>
                  <td>{{ dispute.filedAt | date:'mediumDate' }}</td>
                  <td>
                    @if (dispute.status === 'pending' || dispute.status === 'under_review') {
                      @if (resolvingId === dispute.id) {
                        <div class="resolve-form">
                          <select class="input" [(ngModel)]="resolution">
                            <option value="upheld">Upheld</option>
                            <option value="dismissed">Dismissed</option>
                          </select>
                          <textarea class="input" [(ngModel)]="resolutionNotes" placeholder="Notes..." rows="2"></textarea>
                          <div class="resolve-actions">
                            <button class="btn btn-primary" (click)="submitResolution(dispute.id)" [disabled]="resolving">
                              {{ resolving ? 'Saving...' : 'Submit' }}
                            </button>
                            <button class="btn btn-secondary" (click)="resolvingId = null">Cancel</button>
                          </div>
                        </div>
                      } @else {
                        <button class="btn btn-primary" (click)="resolvingId = dispute.id; resolution = 'upheld'; resolutionNotes = ''">
                          Resolve
                        </button>
                      }
                    } @else {
                      <span class="resolved-notes">{{ dispute.resolutionNotes || '-' }}</span>
                    }
                  </td>
                </tr>
              }
              @if (disputes.length === 0) {
                <tr><td colspan="5" class="empty-text">No disputes found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page h2 { margin-bottom: var(--spacing-md); }
    .tabs { display: flex; gap: 0; margin-bottom: var(--spacing-md); }
    .tab-btn {
      padding: var(--spacing-sm) var(--spacing-md); border: 1px solid var(--color-border);
      background: var(--color-surface); cursor: pointer; font-size: 0.875rem; font-weight: 500;
      &:first-child { border-radius: var(--radius-md) 0 0 var(--radius-md); }
      &:last-child { border-radius: 0 var(--radius-md) var(--radius-md) 0; border-left: none; }
      &.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
      &:hover:not(.active) { background: var(--color-surface-secondary); }
    }
    .table-card { padding: 0; overflow-x: auto; }
    .reason-cell { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .resolve-form { display: flex; flex-direction: column; gap: var(--spacing-xs); min-width: 200px; }
    .resolve-actions { display: flex; gap: var(--spacing-xs); }
    .resolved-notes { font-size: 0.8rem; color: var(--color-text-secondary); }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
  `]
})
export class ArbitrationComponent implements OnInit {
  disputes: Dispute[] = [];
  loading = true;
  activeTab: 'pending' | 'resolved' = 'pending';
  resolvingId: string | null = null;
  resolution = 'upheld';
  resolutionNotes = '';
  resolving = false;
  actionError = '';

  constructor(private reviewsService: ReviewsService) {}

  ngOnInit() {
    this.loadDisputes();
  }

  loadDisputes() {
    this.loading = true;
    const status = this.activeTab === 'pending' ? 'pending,under_review' : 'resolved,dismissed';
    this.reviewsService.listDisputes(status).subscribe({
      next: (res) => {
        this.disputes = res.data;
        this.loading = false;
      },
      error: () => { this.loading = false; this.actionError = 'Failed to load disputes.'; },
    });
  }

  submitResolution(disputeId: string) {
    this.resolving = true;
    this.actionError = '';
    this.reviewsService.resolveDispute(disputeId, {
      resolution: this.resolution,
      notes: this.resolutionNotes || undefined,
    }).subscribe({
      next: () => {
        this.resolving = false;
        this.resolvingId = null;
        this.loadDisputes();
      },
      error: (err) => { this.resolving = false; this.actionError = err.error?.message ?? 'Failed to resolve dispute.'; },
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-warning', under_review: 'badge-info',
      resolved: 'badge-success', dismissed: 'badge-neutral',
    };
    return map[status] ?? 'badge-neutral';
  }
}
