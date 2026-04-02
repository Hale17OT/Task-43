import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ReportsService } from '../../core/services/reports.service';
import { DashboardMetrics, Organization } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';
import { ExportButtonComponent } from '../../shared/components/export-button/export-button.component';

@Component({
  selector: 'app-report-viewer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ShimmerLoaderComponent, ExportButtonComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Reports</h2>
        <div class="export-actions">
          <app-export-button [url]="exportUrl('csv')" label="Export CSV" />
          <app-export-button [url]="exportUrl('xlsx')" label="Export XLSX" />
        </div>
      </div>

      <!-- Filters -->
      <div class="card filters-card">
        <form [formGroup]="filterForm" (ngSubmit)="loadMetrics()" class="filter-row">
          @if (isSuperAdmin) {
            <div class="form-group">
              <label>Organization</label>
              <select class="input" formControlName="orgId">
                <option value="">All Organizations</option>
                @for (org of organizations; track org.id) {
                  <option [value]="org.id">{{ org.name }}</option>
                }
              </select>
            </div>
          }
          <div class="form-group">
            <label>Role</label>
            <select class="input" formControlName="role">
              <option value="">All Roles</option>
              <option value="client">Client</option>
              <option value="lawyer">Lawyer</option>
            </select>
          </div>
          <div class="form-group">
            <label>From</label>
            <input class="input" type="date" formControlName="from" />
          </div>
          <div class="form-group">
            <label>To</label>
            <input class="input" type="date" formControlName="to" />
          </div>
          <button class="btn btn-primary filter-btn" type="submit">Apply</button>
        </form>
      </div>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadMetrics()">Retry</button></div>
      }

      @if (loading) {
        <app-shimmer-loader [lines]="5" />
      } @else if (metrics) {
        <div class="metrics-bars">
          @for (metric of metricItems; track metric.label) {
            <div class="card bar-card">
              <div class="bar-header">
                <span class="bar-label">{{ metric.label }}</span>
                <span class="bar-value">{{ metric.value | number:'1.1-1' }}{{ metric.suffix }}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" [style.width.%]="metric.percent" [style.background]="metric.color"></div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg); }
    .export-actions { display: flex; gap: var(--spacing-sm); }
    .filters-card { margin-bottom: var(--spacing-lg); }
    .filter-row { display: flex; gap: var(--spacing-md); align-items: flex-end; flex-wrap: wrap; }
    .form-group {
      flex: 1; min-width: 140px;
      label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
    }
    .filter-btn { align-self: flex-end; }
    .metrics-bars { display: flex; flex-direction: column; gap: var(--spacing-md); }
    .bar-card { padding: var(--spacing-md) var(--spacing-lg); }
    .bar-header { display: flex; justify-content: space-between; margin-bottom: var(--spacing-sm); }
    .bar-label { font-size: 0.9rem; font-weight: 500; }
    .bar-value { font-size: 0.9rem; font-weight: 700; }
    .bar-track { height: 24px; background: var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
    .bar-fill { height: 100%; border-radius: var(--radius-md); transition: width 0.5s ease; }
  `]
})
export class ReportViewerComponent implements OnInit {
  filterForm: FormGroup;
  metrics: DashboardMetrics | null = null;
  organizations: Organization[] = [];
  loading = true;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    public auth: AuthService,
    private reportsService: ReportsService
  ) {
    this.filterForm = this.fb.group({
      orgId: [''],
      role: [''],
      from: [''],
      to: [''],
    });
  }

  get isSuperAdmin(): boolean {
    return this.auth.userRole() === 'super_admin';
  }

  get metricItems() {
    if (!this.metrics) return [];
    return [
      { label: 'Availability', value: this.metrics.availability, percent: this.metrics.availability, suffix: '%', color: 'var(--color-primary)' },
      { label: 'Fault Rate', value: this.metrics.faultRate, percent: this.metrics.faultRate, suffix: '%', color: 'var(--color-danger)' },
      { label: 'Utilization', value: this.metrics.utilization, percent: this.metrics.utilization, suffix: '%', color: 'var(--color-warning)' },
      { label: 'Throughput', value: this.metrics.throughput, percent: Math.min(100, this.metrics.throughput), suffix: '', color: 'var(--color-primary)' },
      { label: 'Closed-Loop Efficiency', value: this.metrics.closedLoopEfficiency, percent: this.metrics.closedLoopEfficiency, suffix: '%', color: 'var(--color-success)' },
    ];
  }

  ngOnInit() {
    if (this.isSuperAdmin) {
      this.reportsService.getOrganizations().subscribe({
        next: (res) => (this.organizations = res.data),
      });
    }
    this.loadMetrics();
  }

  loadMetrics() {
    this.loading = true;
    const params: any = {};
    const f = this.filterForm.value;
    if (f.orgId) params.orgId = f.orgId;
    if (f.role) params.role = f.role;
    if (f.from) params.from = f.from;
    if (f.to) params.to = f.to;

    this.reportsService.getDashboard(params).subscribe({
      next: (res) => {
        this.metrics = res;
        this.loading = false;
        this.errorMessage = '';
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load report metrics.'; },
    });
  }

  exportUrl(format: string): string {
    const params: any = { format };
    const f = this.filterForm.value;
    if (f.orgId) params.orgId = f.orgId;
    if (f.role) params.role = f.role;
    if (f.from) params.from = f.from;
    if (f.to) params.to = f.to;
    return this.reportsService.exportUrl(params);
  }
}
