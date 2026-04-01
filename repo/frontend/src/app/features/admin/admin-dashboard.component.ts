import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ReportsService } from '../../core/services/reports.service';
import { DashboardMetrics, Organization } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Admin Dashboard</h2>

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
            <label>From</label>
            <input class="input" type="date" formControlName="from" />
          </div>
          <div class="form-group">
            <label>To</label>
            <input class="input" type="date" formControlName="to" />
          </div>
          <div class="form-group">
            <label>Role</label>
            <select class="input" formControlName="role">
              <option value="">All Roles</option>
              <option value="client">Client</option>
              <option value="lawyer">Lawyer</option>
            </select>
          </div>
          <button class="btn btn-primary filter-btn" type="submit">Apply</button>
        </form>
      </div>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadMetrics()">Retry</button></div>
      }

      <!-- Metrics -->
      @if (loading) {
        <app-shimmer-loader [lines]="5" />
      } @else if (metrics) {
        <div class="metrics-grid">
          <div class="card metric-card">
            <div class="metric-label">Availability</div>
            <div class="metric-value">{{ metrics.availability | number:'1.1-1' }}%</div>
          </div>
          <div class="card metric-card">
            <div class="metric-label">Fault Rate</div>
            <div class="metric-value danger">{{ metrics.faultRate | number:'1.1-1' }}%</div>
          </div>
          <div class="card metric-card">
            <div class="metric-label">Utilization</div>
            <div class="metric-value">{{ metrics.utilization | number:'1.1-1' }}%</div>
          </div>
          <div class="card metric-card">
            <div class="metric-label">Throughput</div>
            <div class="metric-value primary">{{ metrics.throughput }}</div>
          </div>
          <div class="card metric-card">
            <div class="metric-label">Closed-Loop Efficiency</div>
            <div class="metric-value success">{{ metrics.closedLoopEfficiency | number:'1.1-1' }}%</div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page h2 { margin-bottom: var(--spacing-lg); }
    .filters-card { margin-bottom: var(--spacing-lg); }
    .filter-row { display: flex; gap: var(--spacing-md); align-items: flex-end; flex-wrap: wrap; }
    .form-group {
      flex: 1; min-width: 140px;
      label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
    }
    .filter-btn { align-self: flex-end; }
    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);
    }
    .metric-card { text-align: center; padding: var(--spacing-xl) var(--spacing-lg); }
    .metric-label { font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm); }
    .metric-value { font-size: 2rem; font-weight: 700; color: var(--color-text); }
    .metric-value.danger { color: var(--color-danger); }
    .metric-value.primary { color: var(--color-primary); }
    .metric-value.success { color: var(--color-success); }
  `]
})
export class AdminDashboardComponent implements OnInit {
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
      from: [''],
      to: [''],
      role: [''],
    });
  }

  get isSuperAdmin(): boolean {
    return this.auth.userRole() === 'super_admin';
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
    if (f.from) params.from = f.from;
    if (f.to) params.to = f.to;
    if (f.role) params.role = f.role;

    this.reportsService.getDashboard(params).subscribe({
      next: (res) => {
        this.metrics = res;
        this.loading = false;
        this.errorMessage = '';
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load metrics. Please try again.'; },
    });
  }
}
