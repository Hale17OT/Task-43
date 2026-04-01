import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { IdempotencyService } from '../../core/services/idempotency.service';
import { BookingsService } from '../../core/services/bookings.service';
import { CreditService } from '../../core/services/credit.service';
import { UsersService } from '../../core/services/users.service';
import { User } from '../../core/models/interfaces';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';
import { PolicyBannerComponent } from '../../shared/components/policy-banner/policy-banner.component';

@Component({
  selector: 'app-booking-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ShimmerLoaderComponent, PolicyBannerComponent],
  template: `
    <div class="page">
      <h2>Create Booking</h2>

      @if (creditError) {
        <app-policy-banner
          type="warning"
          message="Unable to verify your credit score. Booking is disabled until credit can be confirmed."
        />
      } @else if (creditLoaded && creditScore < 20) {
        <app-policy-banner
          type="warning"
          message="Your credit score is below the threshold (20). You cannot create bookings until it improves."
        />
      }

      @if (loadingLawyers) {
        <app-shimmer-loader [lines]="4" />
      } @else {
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="card booking-form">
          <!-- Type -->
          <div class="form-group">
            <label for="type">Booking Type</label>
            <select id="type" class="input" formControlName="type">
              <option value="consultation">Consultation</option>
              <option value="milestone">Milestone</option>
            </select>
          </div>

          <!-- Lawyer -->
          <div class="form-group">
            <label for="lawyer">Lawyer</label>
            <select id="lawyer" class="input" formControlName="lawyerId">
              <option value="">Select a lawyer...</option>
              @for (lawyer of lawyers; track lawyer.id) {
                <option [value]="lawyer.id">{{ lawyer.username }}</option>
              }
            </select>
          </div>

          <!-- Consultation fields -->
          @if (form.get('type')?.value === 'consultation') {
            <div class="form-group">
              <label for="scheduledAt">Date & Time <span class="required">*</span></label>
              <input id="scheduledAt" class="input" type="datetime-local" formControlName="scheduledAt" />
              @if (form.get('scheduledAt')?.invalid && form.get('scheduledAt')?.touched) {
                <small class="field-error">Date and time is required for consultations</small>
              }
            </div>
          }

          <!-- Milestone fields -->
          @if (form.get('type')?.value === 'milestone') {
            <div class="form-group">
              <label for="deadlineAt">Deadline Date <span class="required">*</span></label>
              <input id="deadlineAt" class="input" type="date" formControlName="deadlineAt" />
              @if (form.get('deadlineAt')?.invalid && form.get('deadlineAt')?.touched) {
                <small class="field-error">Deadline is required for milestones</small>
              }
            </div>
            <div class="form-group">
              <label for="weight">Weight <span class="required">*</span></label>
              <input id="weight" class="input" type="number" formControlName="weight" min="1" max="100" />
              @if (form.get('weight')?.invalid && form.get('weight')?.touched) {
                <small class="field-error">Weight must be between 1 and 100</small>
              }
            </div>
          }

          @if (errorMessage) {
            <div class="permission-feedback">{{ errorMessage }}</div>
          }

          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              [disabled]="form.invalid || submitting || !creditLoaded || creditScore < 20 || creditError"
            >
              {{ submitting ? 'Creating...' : 'Create Booking' }}
            </button>
            <button class="btn btn-secondary" type="button" (click)="goBack()">Cancel</button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .page h2 { margin-bottom: var(--spacing-lg); }
    .booking-form { max-width: 560px; }
    .form-group {
      margin-bottom: var(--spacing-md);
      label {
        display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: var(--spacing-xs);
      }
    }
    .form-actions { display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md); }
    .permission-feedback { margin-bottom: var(--spacing-md); }
    .field-error { display: block; color: var(--color-danger, #dc3545); font-size: 0.75rem; margin-top: 4px; }
    .required { color: var(--color-danger, #dc3545); }
  `]
})
export class BookingCreateComponent implements OnInit {
  form: FormGroup;
  lawyers: User[] = [];
  loadingLawyers = true;
  submitting = false;
  errorMessage = '';
  creditScore = -1;
  creditLoaded = false;
  creditError = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private idempotency: IdempotencyService,
    private bookingsService: BookingsService,
    private creditService: CreditService,
    private usersService: UsersService,
    private router: Router
  ) {
    this.form = this.fb.group({
      type: ['consultation', Validators.required],
      lawyerId: ['', Validators.required],
      scheduledAt: ['', Validators.required],
      deadlineAt: [''],
      weight: [1],
    });

    // Toggle conditional validators when type changes
    this.form.get('type')?.valueChanges.subscribe(type => {
      const scheduledAt = this.form.get('scheduledAt')!;
      const deadlineAt = this.form.get('deadlineAt')!;
      const weight = this.form.get('weight')!;
      if (type === 'consultation') {
        scheduledAt.setValidators([Validators.required]);
        deadlineAt.clearValidators();
        weight.clearValidators();
      } else {
        scheduledAt.clearValidators();
        deadlineAt.setValidators([Validators.required]);
        weight.setValidators([Validators.required, Validators.min(1), Validators.max(100)]);
      }
      scheduledAt.updateValueAndValidity();
      deadlineAt.updateValueAndValidity();
      weight.updateValueAndValidity();
    });
  }

  ngOnInit() {
    const userId = this.auth.currentUser()?.id;
    if (userId) {
      this.creditService.getScore(userId).subscribe({
        next: (res) => {
          this.creditScore = res.creditScore;
          this.creditLoaded = true;
          this.creditError = false;
        },
        error: () => {
          this.creditError = true;
          this.creditLoaded = false;
        },
      });
    }

    this.usersService.listLawyers().subscribe({
      next: (res) => {
        this.lawyers = res.data;
        this.loadingLawyers = false;
      },
      error: () => { this.loadingLawyers = false; this.errorMessage = 'Failed to load lawyers.'; },
    });
  }

  onSubmit() {
    if (this.form.invalid || !this.creditLoaded || this.creditScore < 20) return;
    this.submitting = true;
    this.errorMessage = '';

    const val = this.form.value;
    const body: any = {
      type: val.type,
      lawyerId: val.lawyerId,
      idempotencyKey: this.idempotency.generateKey(),
    };

    if (val.type === 'consultation') {
      body.scheduledAt = val.scheduledAt ? new Date(val.scheduledAt).toISOString() : null;
    } else {
      body.deadlineAt = val.deadlineAt ? new Date(val.deadlineAt).toISOString() : null;
      body.weight = val.weight;
    }

    this.bookingsService.create(body).subscribe({
      next: () => {
        this.submitting = false;
        this.router.navigate(['/client/bookings']);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err.error?.message ?? 'Failed to create booking.';
      },
    });
  }

  goBack() {
    this.router.navigate(['/client/bookings']);
  }
}
