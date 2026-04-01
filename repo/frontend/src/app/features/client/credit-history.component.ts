import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { CreditService } from '../../core/services/credit.service';
import { CreditHistory } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-credit-history',
  standalone: true,
  imports: [CommonModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Credit Score</h2>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }}</div>
      }
      @if (loading) {
        <app-shimmer-loader [lines]="6" />
      } @else {
        <div class="score-display card">
          <div class="score-number" [style.color]="scoreColor">{{ currentScore }}</div>
          <div class="score-label">Current Score</div>
        </div>

        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rule</th>
                <th>Change</th>
                <th>New Score</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              @for (entry of history; track entry.id) {
                <tr>
                  <td>{{ entry.createdAt | date:'medium' }}</td>
                  <td><span class="badge badge-neutral">{{ entry.ruleCode }}</span></td>
                  <td>
                    <span [style.color]="entry.changeAmount >= 0 ? 'var(--color-success)' : 'var(--color-danger)'"
                          style="font-weight: 600;">
                      {{ entry.changeAmount >= 0 ? '+' : '' }}{{ entry.changeAmount }}
                    </span>
                  </td>
                  <td>{{ entry.newScore }}</td>
                  <td>{{ entry.reason }}</td>
                </tr>
              }
              @if (history.length === 0) {
                <tr><td colspan="5" class="empty-text">No credit history entries.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page h2 { margin-bottom: var(--spacing-lg); }
    .score-display {
      text-align: center;
      margin-bottom: var(--spacing-lg);
      padding: var(--spacing-xl);
    }
    .score-number { font-size: 4rem; font-weight: 700; }
    .score-label { font-size: 0.9rem; color: var(--color-text-secondary); margin-top: var(--spacing-xs); }
    .table-card { padding: 0; overflow-x: auto; }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
  `]
})
export class CreditHistoryComponent implements OnInit {
  loading = true;
  currentScore = 0;
  history: CreditHistory[] = [];
  errorMessage = '';

  constructor(private creditService: CreditService, private auth: AuthService) {}

  ngOnInit() {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;

    this.creditService.getHistory(userId).subscribe({
      next: (res) => {
        this.currentScore = res.creditScore;
        this.history = (res as any).history ?? (res as any).data ?? [];
        this.loading = false;
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load credit history.'; },
    });
  }

  get scoreColor(): string {
    if (this.currentScore > 60) return 'var(--color-success)';
    if (this.currentScore >= 20) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }
}
