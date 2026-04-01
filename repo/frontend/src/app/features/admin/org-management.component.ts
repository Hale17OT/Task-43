import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OrganizationsService } from '../../core/services/organizations.service';
import { Organization } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-org-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Organizations</h2>
        <button class="btn btn-primary" (click)="showForm = !showForm">
          {{ showForm ? 'Cancel' : 'Create Organization' }}
        </button>
      </div>

      @if (showForm) {
        <div class="card form-card">
          <h4>New Organization</h4>
          <form [formGroup]="form" (ngSubmit)="createOrg()" class="org-form">
            <div class="form-group">
              <label>Name</label>
              <input class="input" formControlName="name" placeholder="Organization name" />
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
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadOrgs()">Retry</button></div>
      }
      @if (loading) {
        <app-shimmer-loader [lines]="5" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              @for (org of organizations; track org.id) {
                <tr>
                  <td>{{ org.name }}</td>
                  <td>{{ org.created_at | date:'mediumDate' }}</td>
                </tr>
              }
              @if (organizations.length === 0) {
                <tr><td colspan="2" class="empty-text">No organizations found.</td></tr>
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
  `]
})
export class OrgManagementComponent implements OnInit {
  organizations: Organization[] = [];
  loading = true;
  showForm = false;
  form: FormGroup;
  creating = false;
  formError = '';
  errorMessage = '';

  constructor(private fb: FormBuilder, private orgsService: OrganizationsService) {
    this.form = this.fb.group({
      name: ['', Validators.required],
    });
  }

  ngOnInit() {
    this.loadOrgs();
  }

  loadOrgs() {
    this.loading = true;
    this.orgsService.list().subscribe({
      next: (res) => {
        this.organizations = res.data;
        this.loading = false;
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load organizations.'; },
    });
  }

  createOrg() {
    if (this.form.invalid) return;
    this.creating = true;
    this.formError = '';

    this.orgsService.create(this.form.value.name).subscribe({
      next: () => {
        this.creating = false;
        this.showForm = false;
        this.form.reset();
        this.loadOrgs();
      },
      error: (err) => {
        this.creating = false;
        this.formError = err.error?.message ?? 'Failed to create organization.';
      },
    });
  }
}
