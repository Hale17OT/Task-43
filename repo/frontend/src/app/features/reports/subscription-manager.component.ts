import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReportsService } from '../../core/services/reports.service';
import { ReportSubscription } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-subscription-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Report Subscriptions</h2>
        <button class="btn btn-primary" (click)="showForm = !showForm">
          {{ showForm ? 'Cancel' : 'New Subscription' }}
        </button>
      </div>

      @if (showForm) {
        <div class="card form-card">
          <h4>Create Subscription</h4>
          <form [formGroup]="form" (ngSubmit)="createSubscription()" class="sub-form">
            <div class="form-group">
              <label>Report Type</label>
              <select class="input" formControlName="report_type">
                <option value="availability">Availability</option>
                <option value="fault_rate">Fault Rate</option>
                <option value="utilization">Utilization</option>
                <option value="throughput">Throughput</option>
                <option value="closed_loop">Closed-Loop Efficiency</option>
                <option value="full_dashboard">Full Dashboard</option>
              </select>
            </div>
            <div class="schedule-info">
              Reports are generated daily at <strong>8:00 AM</strong> and delivered as in-app notifications.
            </div>
            @if (formError) {
              <div class="permission-feedback">{{ formError }}</div>
            }
            <button class="btn btn-primary" type="submit" [disabled]="form.invalid || creating">
              {{ creating ? 'Creating...' : 'Create' }}
            </button>
          </form>
        </div>
      }

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadSubscriptions()">Retry</button></div>
      }

      @if (loading) {
        <app-shimmer-loader [lines]="5" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Report Type</th>
                <th>Schedule</th>
                <th>Active</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (sub of subscriptions; track sub.id) {
                <tr>
                  <td>{{ sub.report_type }}</td>
                  <td>Daily 8:00 AM</td>
                  <td>
                    <button
                      class="btn"
                      [ngClass]="sub.is_active ? 'btn-primary' : 'btn-secondary'"
                      (click)="toggleActive(sub)"
                    >
                      {{ sub.is_active ? 'Active' : 'Inactive' }}
                    </button>
                  </td>
                  <td>{{ sub.created_at | date:'mediumDate' }}</td>
                  <td>
                    <button class="btn btn-danger" (click)="deleteSub(sub.id)">Delete</button>
                  </td>
                </tr>
              }
              @if (subscriptions.length === 0) {
                <tr><td colspan="5" class="empty-text">No subscriptions.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg); }
    .form-card { margin-bottom: var(--spacing-lg); max-width: 400px; }
    .form-card h4 { margin-bottom: var(--spacing-md); }
    .form-group {
      margin-bottom: var(--spacing-md);
      label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
    }
    .table-card { padding: 0; overflow-x: auto; }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
    .permission-feedback { margin-bottom: var(--spacing-md); }
    .schedule-info { font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-surface, #f8f9fa); border-radius: var(--radius-md); }
  `]
})
export class SubscriptionManagerComponent implements OnInit {
  subscriptions: ReportSubscription[] = [];
  loading = true;
  showForm = false;
  form: FormGroup;
  creating = false;
  formError = '';
  errorMessage = '';

  constructor(private fb: FormBuilder, private reportsService: ReportsService) {
    this.form = this.fb.group({
      report_type: ['availability', Validators.required],
    });
  }

  ngOnInit() {
    this.loadSubscriptions();
  }

  loadSubscriptions() {
    this.loading = true;
    this.reportsService.listSubscriptions().subscribe({
      next: (res) => {
        this.subscriptions = res.data;
        this.loading = false;
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load subscriptions.'; },
    });
  }

  createSubscription() {
    if (this.form.invalid) return;
    this.creating = true;
    this.formError = '';

    this.reportsService.createSubscription(this.form.value.report_type).subscribe({
      next: () => {
        this.creating = false;
        this.showForm = false;
        this.form.reset({ report_type: 'availability' });
        this.loadSubscriptions();
      },
      error: (err) => {
        this.creating = false;
        this.formError = err.error?.message ?? 'Failed to create subscription.';
      },
    });
  }

  toggleActive(sub: ReportSubscription) {
    this.reportsService.toggleSubscription(sub.id, !sub.is_active).subscribe({
      next: () => this.loadSubscriptions(),
    });
  }

  deleteSub(id: string) {
    if (!confirm('Delete this subscription?')) return;
    this.reportsService.deleteSubscription(id).subscribe({
      next: () => this.loadSubscriptions(),
    });
  }
}
