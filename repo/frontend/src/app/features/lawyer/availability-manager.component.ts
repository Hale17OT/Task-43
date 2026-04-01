import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AvailabilityService } from '../../core/services/availability.service';
import { Availability } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

@Component({
  selector: 'app-availability-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Manage Availability</h2>

      <!-- Add Form -->
      <div class="card form-card">
        <h4>{{ editingId ? 'Edit Slot' : 'Add Availability Slot' }}</h4>
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="slot-form">
          <div class="form-row">
            <div class="form-group">
              <label>Day of Week</label>
              <select class="input" formControlName="dayOfWeek">
                @for (day of days; track day.value) {
                  <option [value]="day.value">{{ day.label }}</option>
                }
              </select>
            </div>
            <div class="form-group">
              <label>Start Time</label>
              <input class="input" type="time" formControlName="startTime" />
            </div>
            <div class="form-group">
              <label>End Time</label>
              <input class="input" type="time" formControlName="endTime" />
            </div>
            <div class="form-group">
              <label>Duration (min)</label>
              <input class="input" type="number" formControlName="slotDurationMin" min="15" step="15" />
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" [disabled]="form.invalid || submitting">
              {{ submitting ? 'Saving...' : editingId ? 'Update' : 'Add Slot' }}
            </button>
            @if (editingId) {
              <button class="btn btn-secondary" type="button" (click)="cancelEdit()">Cancel</button>
            }
          </div>
        </form>
      </div>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }} <button class="retry-btn" (click)="loadSlots()">Retry</button></div>
      }

      <!-- Slots Table -->
      @if (loading) {
        <app-shimmer-loader [lines]="5" />
      } @else {
        <div class="card table-card">
          <table class="table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (slot of slots; track slot.id) {
                <tr>
                  <td>{{ getDayLabel(slot.dayOfWeek) }}</td>
                  <td>{{ slot.startTime }}</td>
                  <td>{{ slot.endTime }}</td>
                  <td>{{ slot.slotDurationMin }} min</td>
                  <td>
                    <span class="badge" [ngClass]="slot.isActive ? 'badge-success' : 'badge-neutral'">
                      {{ slot.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="actions">
                    <button class="btn btn-secondary" (click)="editSlot(slot)">Edit</button>
                    <button class="btn btn-danger" (click)="deleteSlot(slot.id)">Delete</button>
                  </td>
                </tr>
              }
              @if (slots.length === 0) {
                <tr><td colspan="6" class="empty-text">No availability slots configured.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page h2 { margin-bottom: var(--spacing-lg); }
    .form-card { margin-bottom: var(--spacing-lg); }
    .form-card h4 { margin-bottom: var(--spacing-md); }
    .form-row { display: flex; gap: var(--spacing-md); flex-wrap: wrap; }
    .form-group {
      flex: 1; min-width: 140px;
      label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs); }
    }
    .form-actions { display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md); }
    .table-card { padding: 0; overflow-x: auto; }
    .actions { display: flex; gap: var(--spacing-xs); }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
  `]
})
export class AvailabilityManagerComponent implements OnInit {
  form: FormGroup;
  slots: Availability[] = [];
  loading = true;
  submitting = false;
  editingId: string | null = null;
  errorMessage = '';

  days = [
    { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private availabilityService: AvailabilityService
  ) {
    this.form = this.fb.group({
      dayOfWeek: [1, Validators.required],
      startTime: ['09:00', Validators.required],
      endTime: ['17:00', Validators.required],
      slotDurationMin: [30, [Validators.required, Validators.min(15)]],
    });
  }

  ngOnInit() {
    this.loadSlots();
  }

  loadSlots() {
    this.loading = true;
    const userId = this.auth.currentUser()?.id;
    this.availabilityService.list(userId ?? '').subscribe({
      next: (res) => {
        this.slots = res.data;
        this.loading = false;
        this.errorMessage = '';
      },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load availability.'; },
    });
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.submitting = true;
    this.errorMessage = '';

    const body = this.form.value;

    if (this.editingId) {
      this.availabilityService.update(this.editingId, body).subscribe({
        next: () => { this.submitting = false; this.cancelEdit(); this.loadSlots(); },
        error: (err) => { this.submitting = false; this.errorMessage = err.error?.message ?? 'Failed to update slot.'; },
      });
    } else {
      this.availabilityService.create(body).subscribe({
        next: () => { this.submitting = false; this.form.reset({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMin: 30 }); this.loadSlots(); },
        error: (err) => { this.submitting = false; this.errorMessage = err.error?.message ?? 'Failed to add slot.'; },
      });
    }
  }

  editSlot(slot: Availability) {
    this.editingId = slot.id;
    this.form.patchValue({
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      slotDurationMin: slot.slotDurationMin,
    });
  }

  cancelEdit() {
    this.editingId = null;
    this.form.reset({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMin: 30 });
  }

  deleteSlot(id: string) {
    if (!confirm('Delete this availability slot?')) return;
    this.availabilityService.delete(id).subscribe({
      next: () => this.loadSlots(),
    });
  }

  getDayLabel(day: number): string {
    return this.days.find(d => d.value === day)?.label ?? '';
  }
}
