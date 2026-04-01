import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ReviewsService } from '../../core/services/reviews.service';
import { Review } from '../../core/models/interfaces';
import { StarRatingComponent } from '../../shared/components/star-rating/star-rating.component';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-review-list',
  standalone: true,
  imports: [CommonModule, RouterModule, StarRatingComponent, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Reviews</h2>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab-btn" [class.active]="activeTab === 'given'" (click)="activeTab = 'given'; loadReviews()">
          Given
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'received'" (click)="activeTab = 'received'; loadReviews()">
          Received
        </button>
      </div>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadReviews()">Retry</button></div>
      }
      @if (loading) {
        <app-shimmer-loader [lines]="6" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Timeliness</th>
                <th>Professionalism</th>
                <th>Communication</th>
                <th>Comment</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (review of reviews; track review.id) {
                <tr>
                  <td>{{ review.bookingId | slice:0:8 }}...</td>
                  <td><app-star-rating [value]="review.timeliness" [readonly]="true" /></td>
                  <td><app-star-rating [value]="review.professionalism" [readonly]="true" /></td>
                  <td><app-star-rating [value]="review.communication" [readonly]="true" /></td>
                  <td class="comment-cell">{{ review.comment || '-' }}</td>
                  <td>{{ review.createdAt | date:'mediumDate' }}</td>
                  <td>
                    @if (canDispute(review)) {
                      <a [routerLink]="['/reviews/dispute', review.id]" class="btn btn-secondary">
                        File Dispute
                      </a>
                    }
                  </td>
                </tr>
              }
              @if (reviews.length === 0) {
                <tr><td colspan="7" class="empty-text">No reviews found.</td></tr>
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
    .comment-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
  `]
})
export class ReviewListComponent implements OnInit {
  reviews: Review[] = [];
  loading = true;
  activeTab: 'given' | 'received' = 'given';
  errorMessage = '';

  constructor(private reviewsService: ReviewsService, private auth: AuthService) {}

  ngOnInit() {
    this.loadReviews();
  }

  loadReviews() {
    this.loading = true;
    const userId = this.auth.currentUser()?.id ?? '';
    const fetch$ = this.activeTab === 'given'
      ? this.reviewsService.listByReviewer(userId)
      : this.reviewsService.listByReviewee(userId);
    fetch$.subscribe({
      next: (res) => {
        this.reviews = res.data;
        this.loading = false;
        this.errorMessage = '';
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load reviews.'; },
    });
  }

  canDispute(review: Review): boolean {
    // Within 7 days of review creation
    const created = new Date(review.createdAt).getTime();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return now - created < sevenDays && this.activeTab === 'received';
  }
}
