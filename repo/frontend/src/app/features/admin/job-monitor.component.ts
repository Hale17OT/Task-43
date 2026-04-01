import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JobsService } from '../../core/services/jobs.service';
import { Job } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-job-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Job Monitor</h2>

      <div class="filters">
        <select class="input filter-select" [(ngModel)]="statusFilter" (ngModelChange)="loadJobs()">
          <option value="">All Statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="dead">Dead</option>
        </select>
      </div>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadJobs()">Retry</button></div>
      }
      @if (loading) {
        <app-shimmer-loader [lines]="6" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Latency</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Last Error</th>
              </tr>
            </thead>
            <tbody>
              @for (job of jobs; track job.id) {
                <tr>
                  <td>{{ job.type }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(job.status)">{{ job.status }}</span>
                  </td>
                  <td>{{ job.attempts }} / {{ job.maxAttempts }}</td>
                  <td>{{ job.latencyMs != null ? job.latencyMs + 'ms' : '-' }}</td>
                  <td>{{ job.startedAt | date:'medium' }}</td>
                  <td>{{ job.completedAt | date:'medium' }}</td>
                  <td class="error-cell">{{ job.lastError || '-' }}</td>
                </tr>
              }
              @if (jobs.length === 0) {
                <tr><td colspan="7" class="empty-text">No jobs found.</td></tr>
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
    .error-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-danger); font-size: 0.8rem; }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
  `]
})
export class JobMonitorComponent implements OnInit {
  jobs: Job[] = [];
  loading = true;
  statusFilter = '';
  errorMessage = '';

  constructor(private jobsService: JobsService) {}

  ngOnInit() {
    this.loadJobs();
  }

  loadJobs() {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.statusFilter) params['status'] = this.statusFilter;

    this.jobsService.list(params).subscribe({
      next: (res) => {
        this.jobs = res.data;
        this.loading = false;
        this.errorMessage = '';
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load jobs.'; },
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      queued: 'badge-neutral', running: 'badge-info', completed: 'badge-success',
      failed: 'badge-warning', dead: 'badge-danger',
    };
    return map[status] ?? 'badge-neutral';
  }
}
