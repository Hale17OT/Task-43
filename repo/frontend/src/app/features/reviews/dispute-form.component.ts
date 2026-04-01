import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ReviewsService } from '../../core/services/reviews.service';

@Component({
  selector: 'app-dispute-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h2>File Dispute</h2>

      <div class="card dispute-form">
        <p class="deadline-note">
          Disputes must be filed within 7 days of the review.
        </p>

        <div class="form-group">
          <label>Reason</label>
          <textarea
            class="input"
            [(ngModel)]="reason"
            rows="5"
            placeholder="Explain why you are disputing this review..."
          ></textarea>
        </div>

        @if (errorMessage) {
          <div class="permission-feedback">{{ errorMessage }}</div>
        }

        @if (successMessage) {
          <div class="policy-banner" style="background: #dcfce7; border-color: var(--color-success); color: #166534;">
            {{ successMessage }}
          </div>
        }

        <div class="form-actions">
          <button
            class="btn btn-primary"
            (click)="submit()"
            [disabled]="submitting || !reason.trim()"
          >
            {{ submitting ? 'Filing...' : 'File Dispute' }}
          </button>
          <button class="btn btn-secondary" (click)="router.navigate(['/reviews'])">Cancel</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page h2 { margin-bottom: var(--spacing-lg); }
    .dispute-form { max-width: 560px; }
    .deadline-note {
      font-size: 0.85rem; color: var(--color-warning);
      margin-bottom: var(--spacing-md); font-weight: 500;
    }
    .form-group {
      margin-bottom: var(--spacing-md);
      label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
    }
    .form-actions { display: flex; gap: var(--spacing-sm); }
    .permission-feedback, .policy-banner { margin-bottom: var(--spacing-md); }
  `]
})
export class DisputeFormComponent implements OnInit {
  reviewId = '';
  reason = '';
  submitting = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private reviewsService: ReviewsService
  ) {}

  ngOnInit() {
    this.reviewId = this.route.snapshot.paramMap.get('reviewId') ?? '';
  }

  submit() {
    if (!this.reason.trim()) return;
    this.submitting = true;
    this.errorMessage = '';

    this.reviewsService.fileDispute({
      reviewId: this.reviewId,
      reason: this.reason,
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.successMessage = 'Dispute filed successfully.';
        setTimeout(() => this.router.navigate(['/reviews']), 1500);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err.error?.message ?? 'Failed to file dispute.';
      },
    });
  }
}
