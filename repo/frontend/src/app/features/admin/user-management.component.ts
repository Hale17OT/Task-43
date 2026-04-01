import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { User } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>User Management</h2>
        <button class="btn btn-primary" (click)="showForm = !showForm">
          {{ showForm ? 'Cancel' : 'Create User' }}
        </button>
      </div>

      <!-- Create Form -->
      @if (showForm) {
        <div class="card form-card">
          <h4>Create User</h4>
          <form [formGroup]="form" (ngSubmit)="createUser()" class="user-form">
            <div class="form-row">
              <div class="form-group">
                <label>Username</label>
                <input class="input" formControlName="username" />
              </div>
              <div class="form-group">
                <label>Password</label>
                <input class="input" type="password" formControlName="password" />
                <small class="hint">Min 12 chars, at least 1 number and 1 symbol</small>
              </div>
              <div class="form-group">
                <label>Role</label>
                <select class="input" formControlName="role">
                  <option value="client">Client</option>
                  <option value="lawyer">Lawyer</option>
                  <option value="admin">Admin</option>
                  @if (isSuperAdmin) {
                    <option value="super_admin">Super Admin</option>
                  }
                </select>
              </div>
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
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadUsers()">Retry</button></div>
      }
      @if (loading) {
        <app-shimmer-loader [lines]="8" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Credit Score</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users; track user.id) {
                <tr>
                  <td>
                    @if (editingId === user.id) {
                      <input class="input" [(ngModel)]="editUsername" [ngModelOptions]="{standalone: true}" />
                    } @else {
                      {{ user.username }}
                    }
                  </td>
                  <td>
                    <span class="badge badge-info">{{ user.role }}</span>
                  </td>
                  <td>{{ user.creditScore }}</td>
                  <td>
                    <span class="badge" [ngClass]="user.isActive ? 'badge-success' : 'badge-neutral'">
                      {{ user.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="actions">
                    @if (editingId === user.id) {
                      <button class="btn btn-primary" (click)="saveEdit(user.id)">Save</button>
                      <button class="btn btn-secondary" (click)="editingId = null">Cancel</button>
                    } @else {
                      <button class="btn btn-secondary" (click)="startEdit(user)">Edit</button>
                      @if (isSuperAdmin) {
                        <button class="btn btn-danger" (click)="deleteUser(user.id)">Delete</button>
                      }
                    }
                  </td>
                </tr>
              }
              @if (users.length === 0) {
                <tr><td colspan="5" class="empty-text">No users found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg); }
    .form-card { margin-bottom: var(--spacing-lg); }
    .form-card h4 { margin-bottom: var(--spacing-md); }
    .form-row { display: flex; gap: var(--spacing-md); flex-wrap: wrap; margin-bottom: var(--spacing-md); }
    .form-group {
      flex: 1; min-width: 160px;
      label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
      .hint { display: block; font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px; }
    }
    .table-card { padding: 0; overflow-x: auto; }
    .actions { display: flex; gap: var(--spacing-xs); }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
    .permission-feedback { margin-bottom: var(--spacing-md); }
  `]
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  loading = true;
  showForm = false;
  form: FormGroup;
  creating = false;
  formError = '';
  editingId: string | null = null;
  editUsername = '';
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private usersService: UsersService,
    public auth: AuthService
  ) {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(12), Validators.pattern(/^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).*$/)]],
      role: ['client', Validators.required],
    });
  }

  get isSuperAdmin(): boolean {
    return this.auth.userRole() === 'super_admin';
  }

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.usersService.list().subscribe({
      next: (res) => {
        this.users = res.data;
        this.loading = false;
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load users.'; },
    });
  }

  createUser() {
    if (this.form.invalid) return;
    this.creating = true;
    this.formError = '';

    this.usersService.create(this.form.value).subscribe({
      next: () => {
        this.creating = false;
        this.showForm = false;
        this.form.reset({ role: 'client' });
        this.loadUsers();
      },
      error: (err) => {
        this.creating = false;
        this.formError = err.error?.message ?? 'Failed to create user.';
      },
    });
  }

  startEdit(user: User) {
    this.editingId = user.id;
    this.editUsername = user.username;
  }

  saveEdit(userId: string) {
    this.usersService.update(userId, { username: this.editUsername }).subscribe({
      next: () => {
        this.editingId = null;
        this.loadUsers();
      },
    });
  }

  deleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    this.usersService.delete(userId).subscribe({
      next: () => this.loadUsers(),
    });
  }
}
