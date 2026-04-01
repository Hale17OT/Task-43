import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ReviewsService } from '../../core/services/reviews.service';
import { StarRatingComponent } from '../../shared/components/star-rating/star-rating.component';

@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [CommonModule, FormsModule, StarRatingComponent],
  template: `
    <div class="card review-form">
      <h3>Leave a Review</h3>

      <div class="rating-group">
        <div class="rating-item">
          <label>Timeliness</label>
          <app-star-rating [value]="timeliness" (valueChange)="timeliness = $event" />
        </div>
        <div class="rating-item">
          <label>Professionalism</label>
          <app-star-rating [value]="professionalism" (valueChange)="professionalism = $event" />
        </div>
        <div class="rating-item">
          <label>Communication</label>
          <app-star-rating [value]="communication" (valueChange)="communication = $event" />
        </div>
      </div>

      <div class="form-group">
        <label>Comment</label>
        <textarea
          class="input"
          [(ngModel)]="comment"
          rows="4"
          maxlength="1000"
          placeholder="Share your experience..."
        ></textarea>
        <div class="char-count">{{ comment.length }} / 1000</div>
      </div>

      @if (errorMessage) {
        <div class="permission-feedback">{{ errorMessage }}</div>
      }

      @if (successMessage) {
        <div class="policy-banner" style="background: #dcfce7; border-color: var(--color-success); color: #166534;">
          {{ successMessage }}
        </div>
      }

      <button
        class="btn btn-primary"
        (click)="submit()"
        [disabled]="submitting || !timeliness || !professionalism || !communication"
      >
        {{ submitting ? 'Submitting...' : 'Submit Review' }}
      </button>
    </div>
  `,
  styles: [`
    .review-form { max-width: 560px; }
    .review-form h3 { margin-bottom: var(--spacing-md); }
    .rating-group { display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-md); }
    .rating-item {
      display: flex; align-items: center; gap: var(--spacing-md);
      label { min-width: 120px; font-size: 0.875rem; font-weight: 500; }
    }
    .form-group {
      margin-bottom: var(--spacing-md);
      label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
    }
    .char-count { text-align: right; font-size: 0.75rem; color: var(--color-text-muted); margin-top: var(--spacing-xs); }
    .permission-feedback, .policy-banner { margin-bottom: var(--spacing-md); }
  `]
})
export class ReviewFormComponent implements OnInit {
  @Input() bookingId = '';

  timeliness = 0;
  professionalism = 0;
  communication = 0;
  comment = '';
  submitting = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private reviewsService: ReviewsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const paramId = this.route.snapshot.paramMap.get('bookingId');
    if (paramId) this.bookingId = paramId;
  }

  submit() {
    if (!this.timeliness || !this.professionalism || !this.communication) return;
    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.reviewsService.create({
      bookingId: this.bookingId,
      timeliness: this.timeliness,
      professionalism: this.professionalism,
      communication: this.communication,
      comment: this.comment || undefined,
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.successMessage = 'Review submitted successfully.';
        setTimeout(() => this.router.navigate(['/reviews']), 1500);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err.error?.message ?? 'Failed to submit review.';
      },
    });
  }
}
